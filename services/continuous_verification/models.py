"""Public contracts for deterministic, read-only continuous verification."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator, model_validator


SupportedAsset = Literal["USDY", "PAXG"]
SupportedClaim = Literal["TreasuryBacking", "GoldBacking"]
VerificationResult = Literal["PASS", "FAIL", "INDETERMINATE", "UNAVAILABLE"]
EvidenceFreshness = Literal["CURRENT", "AGING", "STALE", "UNKNOWN", "MIXED"]
CertificateStatus = Literal[
    "REGISTERED_USABLE",
    "REGISTERED_UNUSABLE",
    "NOT_REGISTERED",
    "NO_CERTIFICATE_FIXTURE",
    "LIVE_READ_UNAVAILABLE",
    "NOT_CHECKED",
]
CertificateLifecycleState = Literal[
    "ACTIVE",
    "EXPIRED",
    "REVOKED",
    "NON-PASS",
    "UNUSABLE",
    "NONE",
    "LIVE READ UNAVAILABLE",
    "NOT CHECKED",
]
PolicyGateOutcome = Literal["ALLOW", "BLOCK", "NOT CHECKED", "UNAVAILABLE"]
SourceStatus = Literal["COMPLETE", "PARTIAL", "UNAVAILABLE"]
AuthenticitySource = Literal[
    "DETERMINISTIC RVC",
    "CACHED OFFICIAL EVIDENCE",
    "LIVE ON-CHAIN",
    "DERIVED",
    "DEMO FIXTURE",
    "UNAVAILABLE",
]
TransitionCategory = Literal[
    "VERIFICATION_RESULT_CHANGED",
    "EVIDENCE_FRESHNESS_CHANGED",
    "EVIDENCE_ROOT_CHANGED",
    "INDEPENDENT_ROOT_COUNT_CHANGED",
    "CERTIFICATE_STATUS_CHANGED",
    "CERTIFICATE_USABILITY_CHANGED",
    "POLICYGATE_OUTCOME_CHANGED",
    "REASON_CODES_CHANGED",
]
TransitionSeverity = Literal["INFO", "WARNING", "CRITICAL"]
TransitionValue = str | int | bool | list[str] | None


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("timestamp must be timezone-aware")
    return value.astimezone(timezone.utc)


class MonitoringConfig(BaseModel):
    """Configuration consumed by explicit checks and the local watch process."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    asset: SupportedAsset
    claim: SupportedClaim
    enabled: bool = True
    check_interval_seconds: int = Field(default=300, ge=60, le=86_400)
    monitor_verification: bool = True
    monitor_evidence_freshness: bool = True
    monitor_certificate: bool = True
    monitor_policygate: bool = True

    @model_validator(mode="after")
    def validate_claim_pair(self) -> "MonitoringConfig":
        expected = "TreasuryBacking" if self.asset == "USDY" else "GoldBacking"
        if self.claim != expected:
            raise ValueError(f"{self.asset} monitoring requires claim {expected}")
        return self


class EvidenceFreshnessRecord(BaseModel):
    """One de-duplicated evidence source with an existing freshness policy mapping."""

    model_config = ConfigDict(extra="forbid")

    source_id: str
    source_type: str
    observed_at: str | None = None
    policy_max_age: str | None = None
    freshness: EvidenceFreshness
    explanation: str
    authenticity_labels: list[str] = Field(default_factory=list)


class TrustSnapshot(BaseModel):
    """The current trust state assembled exclusively from existing ProofLayer reads."""

    model_config = ConfigDict(extra="forbid")

    snapshot_id: str = Field(pattern=r"^0x[0-9a-f]{64}$")
    asset: SupportedAsset
    claim: SupportedClaim
    checked_at: datetime

    verification_result: VerificationResult
    reason_codes: list[str] = Field(default_factory=list)
    evidence_root: str | None = None
    independent_root_count: int | None = Field(default=None, ge=0)
    canonical_root_count: int | None = Field(default=None, ge=0)
    independent_trust_domain_count: int | None = Field(default=None, ge=0)
    observed_source_count: int | None = Field(default=None, ge=0)
    unknown_root_count: int | None = Field(default=None, ge=0)
    commitment_version: str | None = "pl-evidence-v1"
    evidence_freshness: EvidenceFreshness | None = None
    evidence_freshness_records: list[EvidenceFreshnessRecord] = Field(default_factory=list)

    certificate_id: str | None = None
    certificate_exists: bool | None = None
    certificate_usable: bool | None = None
    certificate_status: CertificateStatus
    certificate_lifecycle_state: CertificateLifecycleState
    certificate_historical_result: str | None = None
    certificate_valid_until: int | None = Field(default=None, ge=0)

    policygate_outcome: PolicyGateOutcome
    source_status: SourceStatus
    authenticity_sources: list[AuthenticitySource] = Field(default_factory=list)
    source_errors: list[str] = Field(default_factory=list)
    blockchain_write_performed: Literal[False] = False

    @field_validator("checked_at")
    @classmethod
    def normalize_checked_at(cls, value: datetime) -> datetime:
        return _utc(value)

    @field_serializer("checked_at")
    def serialize_checked_at(self, value: datetime) -> str:
        return value.isoformat().replace("+00:00", "Z")


class TrustTransition(BaseModel):
    """A factual difference between two persisted trust snapshots."""

    model_config = ConfigDict(extra="forbid")

    transition_id: str = Field(pattern=r"^0x[0-9a-f]{64}$")
    asset: SupportedAsset
    claim: SupportedClaim
    occurred_at: datetime
    previous_snapshot_id: str = Field(pattern=r"^0x[0-9a-f]{64}$")
    current_snapshot_id: str = Field(pattern=r"^0x[0-9a-f]{64}$")
    category: TransitionCategory
    previous_value: TransitionValue
    current_value: TransitionValue
    severity: TransitionSeverity
    explanation: str

    @field_validator("occurred_at")
    @classmethod
    def normalize_occurred_at(cls, value: datetime) -> datetime:
        return _utc(value)

    @field_serializer("occurred_at")
    def serialize_occurred_at(self, value: datetime) -> str:
        return value.isoformat().replace("+00:00", "Z")


class MonitoringCheckRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset: SupportedAsset
    claim: SupportedClaim

    @model_validator(mode="after")
    def validate_claim_pair(self) -> "MonitoringCheckRequest":
        MonitoringConfig(asset=self.asset, claim=self.claim)
        return self


class MonitoringCheckResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_snapshot: TrustSnapshot
    previous_snapshot: TrustSnapshot | None = None
    transitions: list[TrustTransition] = Field(default_factory=list)
    snapshot_persisted: bool
    transition_count_persisted: int = Field(ge=0)
    next_recommended_check: datetime
    monitoring_mode: Literal["LOCAL / MVP"] = "LOCAL / MVP"
    production_scheduling_enabled: Literal[False] = False
    blockchain_write_performed: Literal[False] = False

    @field_validator("next_recommended_check")
    @classmethod
    def normalize_next_check(cls, value: datetime) -> datetime:
        return _utc(value)

    @field_serializer("next_recommended_check")
    def serialize_next_check(self, value: datetime) -> str:
        return value.isoformat().replace("+00:00", "Z")


class MonitoringAssetSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset: SupportedAsset
    claim: SupportedClaim
    config: MonitoringConfig
    current_snapshot: TrustSnapshot | None = None
    snapshot_count: int = Field(ge=0)
    transition_count: int = Field(ge=0)
    href: str


class MonitoringOverview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assets: list[MonitoringAssetSummary]
    monitoring_mode: Literal["LOCAL / MVP"] = "LOCAL / MVP"
    production_scheduling_enabled: Literal[False] = False
    write_automation_enabled: Literal[False] = False
    blockchain_write_performed: Literal[False] = False


class MonitoringAssetDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset: SupportedAsset
    claim: SupportedClaim
    config: MonitoringConfig
    current_snapshot: TrustSnapshot | None = None
    recent_snapshots: list[TrustSnapshot] = Field(default_factory=list)
    recent_transitions: list[TrustTransition] = Field(default_factory=list)
    monitoring_mode: Literal["LOCAL / MVP"] = "LOCAL / MVP"
    production_scheduling_enabled: Literal[False] = False
    automatic_certificate_actions: Literal[False] = False
    blockchain_write_performed: Literal[False] = False


__all__ = [
    "CertificateLifecycleState",
    "EvidenceFreshnessRecord",
    "MonitoringAssetDetail",
    "MonitoringAssetSummary",
    "MonitoringCheckRequest",
    "MonitoringCheckResult",
    "MonitoringConfig",
    "MonitoringOverview",
    "PolicyGateOutcome",
    "TransitionCategory",
    "TransitionSeverity",
    "TrustSnapshot",
    "TrustTransition",
]
