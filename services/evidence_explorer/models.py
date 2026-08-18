"""Public response models for the read-only Evidence & Provenance Explorer."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


FreshnessState = Literal["CURRENT", "AGING", "STALE", "UNKNOWN"]
FreshnessSummary = Literal["CURRENT", "AGING", "STALE", "UNKNOWN", "MIXED"]
SourceAvailability = Literal[
    "AVAILABLE",
    "NOT_CONFIGURED",
    "UNAUTHORIZED",
    "RATE_LIMITED",
    "TIMEOUT",
    "UNSUPPORTED",
    "INVALID_RESPONSE",
    "STALE",
    "OFFLINE",
    "UNKNOWN",
]
AuthenticityLabel = Literal[
    "ISSUER",
    "ATTESTATION",
    "ON-CHAIN",
    "DEMO FIXTURE",
    "DERIVED",
    "LIVE READ",
    "CACHED OFFICIAL EVIDENCE",
]
VerificationResult = Literal["PASS", "FAIL", "INDETERMINATE"]


class EvidenceRecordView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    record_id: str
    source_id: str
    source_type: str
    root_source_id: str
    dependency_parent_ids: list[str] = Field(default_factory=list)
    evidence_tier: str
    asset: str
    field: str
    value: Any
    unit: str | None = None
    observed_at: str | None = None
    retrieved_at: str | None = None
    content_hash: str | None = None
    simulation: bool = False
    freshness: FreshnessState
    freshness_reason: str
    authenticity_labels: list[AuthenticityLabel] = Field(default_factory=list)


class PredicateView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    predicate: str
    passed: bool | None = None
    expected: Any = None
    observed: Any = None
    reason_code: str | None = None


class VerificationView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_rvc_result: VerificationResult
    # Compatibility alias for existing consumers. It is always identical to
    # current_rvc_result and never contains historical certificate truth.
    result: VerificationResult
    reason_codes: list[str] = Field(default_factory=list)
    policy_id: str
    policy_version: str
    predicates: list[PredicateView] = Field(default_factory=list)
    observed_at: str
    valid_until: str
    simulation: bool
    authority: str
    source: Literal["DERIVED"] = "DERIVED"


class GraphNode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    kind: Literal[
        "ASSET",
        "CLAIM",
        "ROOT_SOURCE",
        "DIRECT_OBSERVATION",
        "DEPENDENT_SOURCE",
        "ONCHAIN_SOURCE",
        "ATTESTATION",
    ]
    label: str
    subtitle: str
    root_source_id: str | None = None
    record_ids: list[str] = Field(default_factory=list)
    evidence_tiers: list[str] = Field(default_factory=list)
    freshness: FreshnessSummary = "UNKNOWN"
    authenticity_labels: list[AuthenticityLabel] = Field(default_factory=list)


class GraphEdge(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: str
    target: str
    relationship: Literal["CLAIM", "ROOT", "OBSERVATION", "DEPENDENCY"]


class ProvenanceGraphView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)


class DependencyGroup(BaseModel):
    model_config = ConfigDict(extra="forbid")

    root_source_id: str
    source_ids: list[str]
    observation_count: int = Field(ge=0)


class ProvenanceView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    observed_source_count: int = Field(ge=0)
    evidence_record_count: int = Field(ge=0)
    independent_root_count: int = Field(ge=0)
    canonical_root_count: int = Field(ge=0)
    independent_trust_domain_count: int = Field(ge=0)
    unknown_root_count: int = Field(ge=0)
    independent_root_ids: list[str]
    duplicated_or_dependent_source_count: int = Field(ge=0)
    duplicated_or_dependent_sources: list[str]
    dependency_groups: list[DependencyGroup]
    graph: ProvenanceGraphView


class EvidenceCommitment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: str
    version: str = "pl-evidence-v1"
    independent_root_count: int = Field(ge=0)
    canonical_root_count: int = Field(ge=0)
    independent_trust_domain_count: int = Field(ge=0)
    observed_source_count: int = Field(ge=0)
    unknown_root_count: int = Field(ge=0)
    source: Literal["DERIVED"] = "DERIVED"
    description: str = "Deterministically computed by the canonical pl-evidence-v1 manifest over the displayed evidence records."


class CertificateLinkage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["AVAILABLE", "NO CERTIFICATE", "UNAVAILABLE", "NOT CHECKED"]
    certificate_id: str | None = None
    # Explicit semantic names for API consumers. The two legacy fields below
    # remain during compatibility migration, but must carry the same values.
    historical_certificate_result: str | None = None
    current_certificate_usability: str | None = None
    verification_result: str | None = None
    current_usability: str | None = None
    live_registered: bool | None = None
    certificate_evidence_root: str | None = None
    evidence_commitment_matches: bool | None = None
    match_status: Literal["EXACT MATCH", "DOES NOT MATCH", "UNAVAILABLE", "NOT CHECKED"]
    href: str | None = None
    authenticity_labels: list[str] = Field(default_factory=list)
    note: str


class DataCoverageItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str
    status: str
    source_id: str | None = None
    availability: SourceAvailability = "UNKNOWN"
    collection_mode: str | None = None
    record_count: int = 0
    note: str = ""


class DataCoverage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset: str
    overall_status: str
    items: list[DataCoverageItem]
    independent_root_count: int = 0
    total_records: int = 0
    live_sources: int = 0
    cached_sources: int = 0
    snapshot_sources: int = 0
    fixture_sources: int = 0
    unavailable_sources: int = 0


class EvidenceAssetSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset_slug: Literal["usdy", "paxg"]
    asset: Literal["USDY", "PAXG"]
    asset_class: str
    claim: Literal["TreasuryBacking", "GoldBacking"]
    evidence_record_count: int = Field(ge=0)
    observed_source_count: int = Field(ge=0)
    independent_root_count: int = Field(ge=0)
    independent_root_ids: list[str]
    verification_result: VerificationResult
    reason_codes: list[str]
    freshness_summary: FreshnessSummary
    evidence_commitment: str
    source_mode: str
    authenticity_labels: list[AuthenticityLabel]
    href: str


class EvidenceExplorerIndex(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assets: list[EvidenceAssetSummary]
    comparison_fields: list[str]
    source_mode_note: str
    evidence_tier_definitions_available: Literal[False] = False
    blockchain_write_performed: Literal[False] = False


class EvidenceAssetDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset_slug: Literal["usdy", "paxg"]
    asset: Literal["USDY", "PAXG"]
    asset_class: str
    claim: Literal["TreasuryBacking", "GoldBacking"]
    source_mode: str
    source_mode_note: str
    freshness_summary: FreshnessSummary
    evidence_records: list[EvidenceRecordView]
    provenance: ProvenanceView
    verification: VerificationView
    missing_requirements: list[str]
    evidence_commitment: EvidenceCommitment
    certificate_linkage: CertificateLinkage
    live_ethereum_read_enabled: bool | None = None
    live_ethereum_read_failed: bool | None = None
    attestation_available: bool | None = None
    data_coverage: DataCoverage | None = None
    evidence_tier_definitions_available: Literal[False] = False
    warnings: list[str] = Field(default_factory=list)
    blockchain_write_performed: Literal[False] = False


__all__ = [
    "AuthenticityLabel",
    "CertificateLinkage",
    "DataCoverage",
    "DataCoverageItem",
    "DependencyGroup",
    "EvidenceAssetDetail",
    "EvidenceAssetSummary",
    "EvidenceCommitment",
    "EvidenceExplorerIndex",
    "EvidenceRecordView",
    "FreshnessState",
    "FreshnessSummary",
    "GraphEdge",
    "GraphNode",
    "PredicateView",
    "ProvenanceGraphView",
    "ProvenanceView",
    "SourceAvailability",
    "VerificationView",
]
