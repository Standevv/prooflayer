from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ProvenanceNode:
    source_id: str
    root_source_id: str
    parent_source_ids: tuple[str, ...]
    source_type: str
    evidence_tier: str
    asset: str
    field: str


@dataclass(frozen=True)
class ProvenanceGraph:
    nodes: tuple[ProvenanceNode, ...]


@dataclass
class ProvenanceResult:
    independent_root_count: int
    independent_root_ids: list[str]
    dependency_groups: dict[str, list[str]]
    duplicated_or_dependent_sources: list[str]
    provenance_summary: dict[str, Any]
    source_count: int
    dependent_source_count: int
    graph: ProvenanceGraph
    unknown_root_count: int = 0
    unknown_root_ids: list[str] | None = None
    canonical_root_count: int = 0
    independent_trust_domain_count: int = 0
    observed_source_count: int = 0
    trusted_root_ids: list[str] | None = None
    malformed: bool = False
    validation_errors: list[str] | None = None

    def __post_init__(self) -> None:
        if self.unknown_root_ids is None:
            self.unknown_root_ids = []
        if self.trusted_root_ids is None:
            self.trusted_root_ids = []
        if self.validation_errors is None:
            self.validation_errors = []


__all__ = ["ProvenanceGraph", "ProvenanceNode", "ProvenanceResult"]
