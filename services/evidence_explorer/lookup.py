"""Compose existing evidence, provenance, RVC, and certificate reads for exploration."""

from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Mapping, Sequence
from typing import Any

from services.certificate_explorer.lookup import CertificateLookupService
from services.mcp_server.tools import ProofLayerTools

from .models import (
    CertificateLinkage,
    DependencyGroup,
    EvidenceAssetDetail,
    EvidenceAssetSummary,
    EvidenceCommitment,
    EvidenceExplorerIndex,
    EvidenceRecordView,
    GraphEdge,
    GraphNode,
    PredicateView,
    ProvenanceGraphView,
    ProvenanceView,
    VerificationView,
)


SUPPORTED_ASSETS = {
    "USDY": {"slug": "usdy", "claim": "TreasuryBacking"},
    "PAXG": {"slug": "paxg", "claim": "GoldBacking"},
}


class EvidenceExplorerError(ValueError):
    """Raised when an Evidence Explorer request is unsupported or malformed."""


def normalize_evidence_asset(value: str) -> str:
    normalized = value.strip().upper() if isinstance(value, str) else ""
    if normalized not in SUPPORTED_ASSETS:
        raise EvidenceExplorerError(
            f"Unsupported evidence asset {value!r}; supported assets are USDY and PAXG."
        )
    return normalized


def _mapping(name: str, value: Any) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise EvidenceExplorerError(f"{name} returned an invalid response")
    return value


def _sequence(name: str, value: Any) -> Sequence[Any]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        raise EvidenceExplorerError(f"{name} returned an invalid response")
    return value


def _text(value: Any, fallback: str = "") -> str:
    return str(value) if value is not None else fallback


def _record_id(source_id: str, field: str, index: int) -> str:
    safe_source = re.sub(r"[^a-zA-Z0-9_-]+", "-", source_id).strip("-")
    safe_field = re.sub(r"[^a-zA-Z0-9_-]+", "-", field).strip("-")
    return f"record:{safe_source}:{safe_field}:{index}"


def _authenticity_labels(source_type: str, *, source_mode: str, simulation: bool) -> list[str]:
    labels: list[str] = []
    normalized = source_type.strip().lower()
    if normalized == "issuer":
        labels.append("ISSUER")
    elif normalized == "attestation":
        labels.append("ATTESTATION")
    elif normalized in {"onchain", "on-chain", "evm"}:
        labels.append("ON-CHAIN")
    elif normalized == "derived":
        labels.append("DERIVED")

    if "snapshot" in source_mode.lower() or "cached" in source_mode.lower():
        labels.append("CACHED OFFICIAL EVIDENCE")
    elif "live" in source_mode.lower():
        labels.append("LIVE READ")
    if simulation:
        labels.append("DEMO FIXTURE")
    return list(dict.fromkeys(labels))


def _attestation_freshness(predicates: Sequence[Mapping[str, Any]]) -> tuple[str, str]:
    age_predicate = next(
        (
            item
            for item in predicates
            if "attestation.age" in _text(item.get("predicate")).lower()
        ),
        None,
    )
    if age_predicate is None:
        return "UNKNOWN", "No existing RVC attestation-age predicate applies."
    if age_predicate.get("reason_code") == "STALE_ATTESTATION":
        observed = _text(age_predicate.get("observed"), "outside the policy window")
        expected = _text(age_predicate.get("expected"), "the configured policy window")
        return "STALE", f"RVC reported STALE_ATTESTATION ({observed}; expected {expected})."
    if age_predicate.get("passed") is True:
        observed = _text(age_predicate.get("observed"), "within policy")
        expected = _text(age_predicate.get("expected"), "the configured policy window")
        return "CURRENT", f"RVC freshness predicate passed ({observed}; expected {expected})."
    return "UNKNOWN", "The existing RVC could not establish attestation freshness."


def _freshness_summary(states: Sequence[str]) -> str:
    unique = set(states)
    if not unique or unique == {"UNKNOWN"}:
        return "UNKNOWN"
    if "STALE" in unique:
        return "STALE" if unique <= {"STALE", "UNKNOWN"} else "MIXED"
    if "AGING" in unique:
        return "AGING" if unique <= {"AGING", "UNKNOWN"} else "MIXED"
    if unique == {"CURRENT"}:
        return "CURRENT"
    return "MIXED"


class EvidenceExplorerService:
    """Expose current repository evidence without adding a second verification path."""

    def __init__(
        self,
        tools: ProofLayerTools | Any | None = None,
        certificate_lookup: CertificateLookupService | Any | None = None,
    ) -> None:
        self.tools = tools or ProofLayerTools()
        self.certificate_lookup = certificate_lookup or CertificateLookupService(
            tools=self.tools
        )

    def list_assets(self) -> EvidenceExplorerIndex:
        details = [self.get_asset(asset, include_certificate=False) for asset in SUPPORTED_ASSETS]
        return EvidenceExplorerIndex(
            assets=[self._summary(detail) for detail in details],
            comparison_fields=[
                "Evidence records",
                "Observed sources",
                "Independent roots",
                "Current verification result",
                "Freshness",
                "Evidence commitment",
            ],
            source_mode_note=(
                "Repository snapshots preserve cached official evidence. They are not labelled as live reads; "
                "the existing RVC determines whether evidence is sufficient or stale."
            ),
        )

    def get_asset(
        self,
        asset: str,
        *,
        include_certificate: bool = True,
    ) -> EvidenceAssetDetail:
        normalized = normalize_evidence_asset(asset)
        claim = SUPPORTED_ASSETS[normalized]["claim"]

        metadata = _mapping("get_asset_metadata", self.tools.get_asset_metadata(normalized))
        evidence_payload = _mapping("get_evidence", self.tools.get_evidence(normalized, claim))
        provenance_payload = _mapping(
            "analyze_provenance", self.tools.analyze_provenance(normalized, claim)
        )
        verification_payload = _mapping(
            "verify_claim", self.tools.verify_claim(normalized, claim)
        )

        source_mode = _text(evidence_payload.get("source_mode"), "unknown")
        raw_predicates = [
            _mapping("verify_claim predicate", item)
            for item in _sequence("verify_claim predicates", verification_payload.get("predicates", []))
        ]
        records = self._records(
            normalized,
            _sequence("get_evidence evidence", evidence_payload.get("evidence", [])),
            source_mode=source_mode,
            predicates=raw_predicates,
        )
        verification = self._verification(verification_payload, raw_predicates)
        provenance = self._provenance(
            normalized,
            claim,
            records,
            provenance_payload,
        )
        commitment = EvidenceCommitment(
            value=_text(verification_payload.get("evidence_root")),
            version=_text(verification_payload.get("commitment_version"), "pl-evidence-v1") or "pl-evidence-v1",
            independent_root_count=int(verification_payload.get("evidence_root_count", 0)),
            canonical_root_count=int(
                verification_payload.get("canonical_root_count", verification_payload.get("evidence_root_count", 0))
            ),
            independent_trust_domain_count=int(
                verification_payload.get(
                    "independent_trust_domain_count",
                    verification_payload.get("evidence_root_count", 0),
                )
            ),
            observed_source_count=int(
                provenance_payload.get("observed_source_count", provenance_payload.get("source_count", 0))
            ),
            unknown_root_count=int(provenance_payload.get("unknown_root_count", 0)),
        )
        certificate = self._certificate_linkage(
            verification_payload,
            commitment.value,
            include_certificate=include_certificate,
        )
        missing_requirements = list(
            dict.fromkeys(
                _text(item.get("predicate"))
                for item in raw_predicates
                if item.get("reason_code") == "MISSING_EVIDENCE"
            )
        )
        warnings = [_text(evidence_payload.get("warning"))]
        if normalized == "USDY" and any(
            record.field == "portfolio_observation_timestamp" for record in records
        ):
            warnings.append(
                "USDY portfolio_observation_timestamp is an issuer portfolio observation, not an independent attestation; the missing attestation requirement remains missing."
            )
        if "STALE_ATTESTATION" in verification.reason_codes:
            warnings.append(
                "The displayed attestation remains genuine cached evidence, but the existing RVC places it outside the configured freshness window."
            )
        warnings = [warning for warning in warnings if warning]

        return EvidenceAssetDetail(
            asset_slug=SUPPORTED_ASSETS[normalized]["slug"],
            asset=normalized,
            asset_class=_text(metadata.get("asset_class")),
            claim=claim,
            source_mode=source_mode,
            source_mode_note=(
                "CACHED OFFICIAL EVIDENCE — loaded from the repository snapshot; no live evidence fetch was performed."
                if "snapshot" in source_mode.lower()
                else "Evidence source mode is reported exactly by the existing adapter boundary."
            ),
            freshness_summary=_freshness_summary([record.freshness for record in records]),
            evidence_records=records,
            provenance=provenance,
            verification=verification,
            missing_requirements=missing_requirements,
            evidence_commitment=commitment,
            certificate_linkage=certificate,
            warnings=warnings,
        )

    @staticmethod
    def _records(
        asset: str,
        raw_records: Sequence[Any],
        *,
        source_mode: str,
        predicates: Sequence[Mapping[str, Any]],
    ) -> list[EvidenceRecordView]:
        attestation_state, attestation_reason = _attestation_freshness(predicates)
        records: list[EvidenceRecordView] = []
        for index, candidate in enumerate(raw_records):
            item = _mapping("get_evidence record", candidate)
            source_type = _text(item.get("source_type"), "unknown")
            simulation = bool(item.get("simulation"))
            if source_type.strip().lower() == "attestation":
                freshness = attestation_state
                freshness_reason = attestation_reason
            else:
                freshness = "UNKNOWN"
                freshness_reason = (
                    "No existing RVC freshness predicate maps this record to a policy window."
                )
            source_id = _text(item.get("source_id"), "unknown-source")
            field = _text(item.get("field"), "unknown-field")
            parents = item.get("dependent_on", item.get("dependency_parent_ids", []))
            parent_ids = [
                _text(parent)
                for parent in _sequence("evidence dependency_parent_ids", parents)
            ]
            records.append(
                EvidenceRecordView(
                    record_id=_record_id(source_id, field, index),
                    source_id=source_id,
                    source_type=source_type,
                    root_source_id=_text(item.get("root_source_id"), source_id),
                    dependency_parent_ids=parent_ids,
                    evidence_tier=_text(item.get("evidence_tier"), "UNKNOWN"),
                    asset=asset,
                    field=field,
                    value=item.get("value"),
                    unit=_text(item.get("unit")) or None,
                    observed_at=_text(item.get("observed_at")) or None,
                    retrieved_at=_text(item.get("retrieved_at")) or None,
                    content_hash=_text(item.get("content_hash")) or None,
                    simulation=simulation,
                    freshness=freshness,
                    freshness_reason=freshness_reason,
                    authenticity_labels=_authenticity_labels(
                        source_type,
                        source_mode=source_mode,
                        simulation=simulation,
                    ),
                )
            )
        return records

    @staticmethod
    def _verification(
        payload: Mapping[str, Any],
        predicates: Sequence[Mapping[str, Any]],
    ) -> VerificationView:
        return VerificationView(
            result=_text(payload.get("verification_result")),
            reason_codes=[_text(item) for item in payload.get("reason_codes", [])],
            policy_id=_text(payload.get("policy_id")),
            policy_version=_text(payload.get("policy_version")),
            predicates=[
                PredicateView(
                    predicate=_text(item.get("predicate")),
                    passed=item.get("passed") if isinstance(item.get("passed"), bool) else None,
                    expected=item.get("expected"),
                    observed=item.get("observed"),
                    reason_code=_text(item.get("reason_code")) or None,
                )
                for item in predicates
            ],
            observed_at=_text(payload.get("observed_at")),
            valid_until=_text(payload.get("valid_until")),
            simulation=bool(payload.get("simulation")),
            authority=_text(payload.get("authority")),
        )

    @staticmethod
    def _provenance(
        asset: str,
        claim: str,
        records: list[EvidenceRecordView],
        payload: Mapping[str, Any],
    ) -> ProvenanceView:
        root_ids = [_text(item) for item in payload.get("independent_root_ids", [])]
        raw_groups = _mapping("provenance dependency_groups", payload.get("dependency_groups", {}))
        by_root: dict[str, list[EvidenceRecordView]] = defaultdict(list)
        by_source: dict[str, list[EvidenceRecordView]] = defaultdict(list)
        for record in records:
            by_root[record.root_source_id].append(record)
            by_source[record.source_id].append(record)

        nodes = [
            GraphNode(
                id="asset",
                kind="ASSET",
                label=asset,
                subtitle="Real-world asset",
                authenticity_labels=["DERIVED"],
            ),
            GraphNode(
                id="claim",
                kind="CLAIM",
                label=claim,
                subtitle="Deterministic claim",
                authenticity_labels=["DERIVED"],
            ),
        ]
        edges = [GraphEdge(source="asset", target="claim", relationship="CLAIM")]
        for root_id in root_ids:
            root_records = by_root.get(root_id, [])
            nodes.append(
                GraphNode(
                    id=f"root:{root_id}",
                    kind="ROOT_SOURCE",
                    label=root_id,
                    subtitle=f"Independent root · {len(root_records)} observations",
                    root_source_id=root_id,
                    record_ids=[item.record_id for item in root_records],
                    evidence_tiers=sorted({item.evidence_tier for item in root_records}),
                    freshness=_freshness_summary([item.freshness for item in root_records]),
                    authenticity_labels=["DERIVED"],
                )
            )
            edges.append(
                GraphEdge(source="claim", target=f"root:{root_id}", relationship="ROOT")
            )

        for source_id, source_records in sorted(by_source.items()):
            source_types = {item.source_type.strip().lower() for item in source_records}
            has_dependency = any(item.dependency_parent_ids for item in source_records)
            source_freshness = _freshness_summary(
                [item.freshness for item in source_records]
            )
            source_tiers = sorted({item.evidence_tier for item in source_records})
            kind = (
                "DEPENDENT_SOURCE"
                if has_dependency
                else "ATTESTATION"
                if "attestation" in source_types
                else "ONCHAIN_SOURCE"
                if source_types.intersection({"onchain", "on-chain", "evm"})
                else "DIRECT_OBSERVATION"
            )
            labels = list(
                dict.fromkeys(
                    label
                    for record in source_records
                    for label in record.authenticity_labels
                )
            )
            root_id = source_records[0].root_source_id
            nodes.append(
                GraphNode(
                    id=f"source:{source_id}",
                    kind=kind,
                    label=source_id,
                    subtitle=(
                        f"{' / '.join(sorted(source_types)).upper()} · root {root_id} · "
                        f"tier {' / '.join(source_tiers)} · {source_freshness}"
                    ),
                    root_source_id=root_id,
                    record_ids=[item.record_id for item in source_records],
                    evidence_tiers=source_tiers,
                    freshness=source_freshness,
                    authenticity_labels=labels,
                )
            )
            edges.append(
                GraphEdge(
                    source=f"root:{root_id}",
                    target=f"source:{source_id}",
                    relationship="OBSERVATION",
                )
            )
            for parent_id in sorted(
                {parent for record in source_records for parent in record.dependency_parent_ids}
            ):
                if parent_id in by_source and parent_id != source_id:
                    edges.append(
                        GraphEdge(
                            source=f"source:{parent_id}",
                            target=f"source:{source_id}",
                            relationship="DEPENDENCY",
                        )
                    )

        groups: list[DependencyGroup] = []
        for root_id in root_ids:
            source_ids = [_text(item) for item in raw_groups.get(root_id, [])]
            groups.append(
                DependencyGroup(
                    root_source_id=root_id,
                    source_ids=source_ids,
                    observation_count=len(by_root.get(root_id, [])),
                )
            )

        dependent_sources = [
            _text(item) for item in payload.get("duplicated_or_dependent_sources", [])
        ]
        return ProvenanceView(
            observed_source_count=int(payload.get("observed_source_count", payload.get("source_count", len(by_source)))),
            evidence_record_count=len(records),
            independent_root_count=int(payload.get("independent_root_count", len(root_ids))),
            canonical_root_count=int(payload.get("canonical_root_count", len(root_ids))),
            independent_trust_domain_count=int(
                payload.get("independent_trust_domain_count", len(root_ids))
            ),
            unknown_root_count=int(payload.get("unknown_root_count", 0)),
            independent_root_ids=root_ids,
            duplicated_or_dependent_source_count=int(
                payload.get("dependent_source_count", len(dependent_sources))
            ),
            duplicated_or_dependent_sources=dependent_sources,
            dependency_groups=groups,
            graph=ProvenanceGraphView(nodes=nodes, edges=edges),
        )

    def _certificate_linkage(
        self,
        verification: Mapping[str, Any],
        evidence_root: str,
        *,
        include_certificate: bool,
    ) -> CertificateLinkage:
        certificate_id = _text(verification.get("known_live_certificate_id")) or None
        if certificate_id is None:
            return CertificateLinkage(
                status="NO CERTIFICATE",
                match_status="UNAVAILABLE",
                note="No exported ProofLayer certificate fixture is mapped to this asset.",
            )
        if not include_certificate:
            return CertificateLinkage(
                status="NOT CHECKED",
                certificate_id=certificate_id,
                match_status="NOT CHECKED",
                href=f"/certificates/{certificate_id}",
                note="Certificate linkage is resolved on the asset detail route.",
            )
        try:
            record = self.certificate_lookup.lookup(certificate_id, include_related=False)
            certificate_root = record.core.evidence_root
            matches = (
                certificate_root.lower() == evidence_root.lower()
                if certificate_root and evidence_root
                else None
            )
            note = (
                "The displayed evidence commitment exactly matches the related certificate."
                if matches is True
                else "The related USDY demo certificate was produced from a different historical evidence set; it is not presented as the certificate for these current records."
                if matches is False
                else "The evidence commitment could not be compared because one value is unavailable."
            )
            return CertificateLinkage(
                status="AVAILABLE" if record.found else "UNAVAILABLE",
                certificate_id=certificate_id,
                verification_result=record.core.result,
                current_usability=record.usability.state,
                live_registered=record.live_certificate_found,
                certificate_evidence_root=certificate_root,
                evidence_commitment_matches=matches,
                match_status=(
                    "EXACT MATCH" if matches is True else "DOES NOT MATCH" if matches is False else "UNAVAILABLE"
                ),
                href=f"/certificates/{certificate_id}",
                authenticity_labels=record.authenticity_sources,
                note=note,
            )
        except Exception:
            return CertificateLinkage(
                status="UNAVAILABLE",
                certificate_id=certificate_id,
                match_status="UNAVAILABLE",
                href=f"/certificates/{certificate_id}",
                note="The related certificate ID is known, but its current state could not be read.",
            )

    @staticmethod
    def _summary(detail: EvidenceAssetDetail) -> EvidenceAssetSummary:
        labels = list(
            dict.fromkeys(
                label
                for record in detail.evidence_records
                for label in record.authenticity_labels
            )
        )
        return EvidenceAssetSummary(
            asset_slug=detail.asset_slug,
            asset=detail.asset,
            asset_class=detail.asset_class,
            claim=detail.claim,
            evidence_record_count=len(detail.evidence_records),
            observed_source_count=detail.provenance.observed_source_count,
            independent_root_count=detail.provenance.independent_root_count,
            independent_root_ids=detail.provenance.independent_root_ids,
            verification_result=detail.verification.result,
            reason_codes=detail.verification.reason_codes,
            freshness_summary=detail.freshness_summary,
            evidence_commitment=detail.evidence_commitment.value,
            source_mode=detail.source_mode,
            authenticity_labels=labels,
            href=f"/evidence/{detail.asset_slug}",
        )


__all__ = [
    "EvidenceExplorerError",
    "EvidenceExplorerService",
    "normalize_evidence_asset",
]
