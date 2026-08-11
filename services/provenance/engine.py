from collections import defaultdict
from collections.abc import Iterable
from typing import Any

from services.evidence_commitment import TRUSTED_ROOT_SOURCE_REGISTRY
from services.rvc.models import EvidenceRecord

from .models import ProvenanceGraph, ProvenanceNode, ProvenanceResult


class ProvenanceAnalysisError(ValueError):
    """Raised when evidence lacks the identity needed for provenance analysis."""


def _required_identifier(name: str, value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ProvenanceAnalysisError(f"{name} is required")
    return value.strip()


def _parent_source_ids(evidence: EvidenceRecord) -> tuple[str, ...]:
    parent_ids = evidence.dependency_parent_ids or []
    normalized_parent_ids = {
        _required_identifier("dependency_parent_ids item", parent_id)
        for parent_id in parent_ids
    }
    return tuple(sorted(normalized_parent_ids))


def _trusted_root(root_source_id: str) -> str | None:
    normalized = root_source_id.strip().lower() if isinstance(root_source_id, str) else ""
    if not normalized:
        return None
    registry_value = TRUSTED_ROOT_SOURCE_REGISTRY.get(normalized)
    if registry_value:
        return registry_value
    if normalized in {
        "ondo",
        "paxos",
        "kpmg",
        "ankura",
        "ethereum",
        "xlayer",
        "chainlink",
    }:
        return normalized
    return None


def _to_node(evidence: EvidenceRecord) -> ProvenanceNode:
    if not isinstance(evidence, EvidenceRecord):
        raise ProvenanceAnalysisError("evidence must contain EvidenceRecord objects")

    source_id = _required_identifier("source_id", evidence.source_id)
    root_source_id = (
        evidence.root_source_id.strip()
        if isinstance(evidence.root_source_id, str) and evidence.root_source_id.strip()
        else source_id
    )
    trusted_root = _trusted_root(root_source_id)
    if trusted_root is None:
        root_source_id = "UNKNOWN"
    else:
        root_source_id = trusted_root

    return ProvenanceNode(
        source_id=source_id,
        root_source_id=root_source_id,
        parent_source_ids=_parent_source_ids(evidence),
        source_type=_required_identifier("source_type", evidence.source_type),
        evidence_tier=_required_identifier("evidence_tier", evidence.evidence_tier),
        asset=_required_identifier("asset", evidence.asset),
        field=_required_identifier("field", evidence.field),
    )


def build_provenance_graph(
    evidence: Iterable[EvidenceRecord],
) -> ProvenanceGraph:
    return ProvenanceGraph(nodes=tuple(_to_node(item) for item in evidence))


def _node_summary(node: ProvenanceNode) -> dict[str, Any]:
    return {
        "source_id": node.source_id,
        "root_source_id": node.root_source_id,
        "parent_source_ids": list(node.parent_source_ids),
        "source_type": node.source_type,
        "evidence_tier": node.evidence_tier,
        "asset": node.asset,
        "field": node.field,
    }


def _validate_provenance_graph(graph: ProvenanceGraph) -> tuple[bool, list[str]]:
    errors: list[str] = []
    by_source = {node.source_id: node for node in graph.nodes}
    seen: set[tuple[str, str]] = set()
    for node in graph.nodes:
        record_id = node.source_id
        record_key = (record_id, node.field)
        if record_key in seen:
            errors.append(
                f"duplicate record (source, field): {record_id}:{node.field}"
            )
        seen.add(record_key)
        if any(parent == record_id for parent in node.parent_source_ids):
            errors.append(f"self-parent relationship: {record_id}")
        for parent in node.parent_source_ids:
            if parent not in by_source:
                errors.append(f"missing parent dependency ref: {parent}")
        if node.root_source_id == "UNKNOWN":
            errors.append(f"unknown root mapping in node: {record_id}")
    for edge_root in {node.root_source_id for node in graph.nodes}:
        if edge_root == "UNKNOWN":
            continue
        if edge_root not in {
            "ondo",
            "paxos",
            "kpmg",
            "ankura",
            "ethereum",
            "xlayer",
            "chainlink",
        }:
            errors.append(f"unsupported root mapping: {edge_root}")
    # Cycle detection by DFS over dependency edges.
    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(source_id: str, path: list[str]) -> None:
        if source_id in visiting:
            errors.append(f"cycle detected: {' -> '.join(path + [source_id])}")
            return
        if source_id in visited:
            return
        visiting.add(source_id)
        node = by_source.get(source_id)
        if node is None:
            return
        for parent in node.parent_source_ids:
            if parent in by_source:
                visit(parent, path + [source_id])
        visiting.remove(source_id)
        visited.add(source_id)

    for source_id in sorted(by_source):
        visit(source_id, [])
    return (len(errors) == 0, errors)


def analyze_provenance(evidence: list[EvidenceRecord]) -> ProvenanceResult:
    graph = build_provenance_graph(evidence)
    validation_ok, validation_errors = _validate_provenance_graph(graph)
    nodes_by_root: dict[str, list[ProvenanceNode]] = defaultdict(list)

    for node in graph.nodes:
        nodes_by_root[node.root_source_id].append(node)

    trusted_roots = sorted(
        root_id for root_id in nodes_by_root if root_id != "UNKNOWN"
    )
    independent_root_ids = sorted(trusted_roots)
    unknown_root_count = len(nodes_by_root.get("UNKNOWN", []))
    unknown_root_ids = sorted({node.source_id for node in nodes_by_root.get("UNKNOWN", [])})

    dependency_groups = {
        root_source_id: sorted({node.source_id for node in nodes})
        for root_source_id, nodes in sorted(nodes_by_root.items())
        if root_source_id != "UNKNOWN"
    }

    nodes_by_source: dict[str, list[ProvenanceNode]] = defaultdict(list)
    for node in graph.nodes:
        nodes_by_source[node.source_id].append(node)

    duplicated_or_dependent_sources = sorted(
        source_id
        for source_id, source_nodes in nodes_by_source.items()
        if any(node.parent_source_ids for node in source_nodes)
        or any(node.root_source_id != source_id for node in source_nodes)
    )

    root_summaries: dict[str, dict[str, Any]] = {}
    for root_source_id, root_nodes in sorted(nodes_by_root.items()):
        if root_source_id == "UNKNOWN":
            continue
        sorted_nodes = sorted(
            root_nodes,
            key=lambda node: (
                node.source_id,
                node.asset,
                node.field,
                node.source_type,
                node.evidence_tier,
                node.parent_source_ids,
            ),
        )
        root_summaries[root_source_id] = {
            "source_ids": dependency_groups[root_source_id],
            "observation_count": len(root_nodes),
            "observations": [_node_summary(node) for node in sorted_nodes],
        }

    source_count = len(nodes_by_source)
    dependent_source_count = len(duplicated_or_dependent_sources)
    sorted_nodes = sorted(
        graph.nodes,
        key=lambda node: (
            node.root_source_id,
            node.source_id,
            node.asset,
            node.field,
            node.source_type,
            node.evidence_tier,
            node.parent_source_ids,
        ),
    )
    provenance_summary = {
        "independent_root_count": len(independent_root_ids),
        "independent_root_ids": independent_root_ids,
        "source_count": source_count,
        "observation_count": len(graph.nodes),
        "dependent_source_count": dependent_source_count,
        "duplicated_or_dependent_sources": duplicated_or_dependent_sources,
        "observations": [_node_summary(node) for node in sorted_nodes],
        "roots": root_summaries,
        "unknown_root_count": unknown_root_count,
        "unknown_root_ids": unknown_root_ids,
        "canonical_root_count": len(independent_root_ids),
        "independent_trust_domain_count": len(independent_root_ids),
        "observed_source_count": source_count,
    }

    return ProvenanceResult(
        independent_root_count=len(independent_root_ids),
        independent_root_ids=independent_root_ids,
        dependency_groups=dependency_groups,
        duplicated_or_dependent_sources=duplicated_or_dependent_sources,
        provenance_summary=provenance_summary,
        source_count=source_count,
        dependent_source_count=dependent_source_count,
        graph=graph,
        unknown_root_count=unknown_root_count,
        unknown_root_ids=unknown_root_ids,
        canonical_root_count=len(independent_root_ids),
        independent_trust_domain_count=len(independent_root_ids),
        observed_source_count=source_count,
        trusted_root_ids=independent_root_ids,
        malformed=not validation_ok,
        validation_errors=validation_errors,
    )


__all__ = [
    "ProvenanceAnalysisError",
    "analyze_provenance",
    "build_provenance_graph",
]
