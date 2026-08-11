"""Typed contracts for off-chain institutional policy configuration and evaluation."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator, model_validator


SupportedAsset = Literal["USDY", "PAXG"]
SupportedClaim = Literal["TreasuryBacking", "GoldBacking"]
AuthoritativeResult = Literal["PASS", "FAIL", "INDETERMINATE", "UNAVAILABLE"]
PolicyDecision = Literal["ACCEPT", "REJECT", "REVIEW_REQUIRED"]
RuleStatus = Literal["SATISFIED", "NOT_SATISFIED", "UNAVAILABLE", "NOT_APPLICABLE"]
PolicySource = Literal["DEMO POLICY PRESET", "SAVED POLICY"]
AuthenticityLabel = Literal[
    "DETERMINISTIC RVC",
    "CUSTOM POLICY",
    "LIVE ON-CHAIN",
    "CACHED OFFICIAL EVIDENCE",
    "DERIVED",
    "UNAVAILABLE",
]

SUPPORTED_REASON_CODES = frozenset(
    {
        "MISSING_EVIDENCE",
        "STALE_ATTESTATION",
        "UNDERCOLLATERALIZED",
        "INVALID_EVIDENCE",
        "INVALID_GOLD_TOKEN_RELATIONSHIP",
        "INSUFFICIENT_ALLOCATED_GOLD",
        "LOW_BACKING_RATIO",
        "INVALID_ATTESTATION_TIMESTAMP",
        "UNVERIFIED_ISSUER_CONTRACT",
    }
)


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("timestamp must be timezone-aware")
    return value.astimezone(timezone.utc)


class InstitutionalPolicyDraft(BaseModel):
    """Untrusted typed policy input; expressions and arbitrary code are impossible."""

    model_config = ConfigDict(extra="forbid")

    policy_id: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9-]{2,63}$")
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=500)
    supported_asset: SupportedAsset | None = None
    supported_claim: SupportedClaim
    required_verification_results: list[Literal["PASS"]] = Field(
        default_factory=lambda: ["PASS"], min_length=1, max_length=1
    )
    minimum_independent_roots: int | None = Field(default=None, ge=0, le=100)
    require_certificate: bool = False
    require_certificate_usable: bool = False
    require_not_revoked: bool = False
    require_policygate_allow: bool = False
    maximum_attestation_age_days: int | None = Field(default=None, ge=1, le=3_650)
    blocking_reason_codes: list[str] = Field(default_factory=list, max_length=20)
    enabled: bool = True

    @field_validator("name")
    @classmethod
    def nonblank_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if not normalized:
            raise ValueError("Policy name must not be empty.")
        return normalized

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        return " ".join(value.split())

    @field_validator("blocking_reason_codes")
    @classmethod
    def validate_reason_codes(cls, values: list[str]) -> list[str]:
        normalized = sorted(set(values))
        unsupported = sorted(set(normalized) - SUPPORTED_REASON_CODES)
        if unsupported:
            raise ValueError(
                "Unsupported blocking reason code(s): " + ", ".join(unsupported) + "."
            )
        return normalized

    @model_validator(mode="after")
    def validate_dependencies(self) -> "InstitutionalPolicyDraft":
        if self.require_certificate_usable and not self.require_certificate:
            raise ValueError(
                "Certificate usability can only be required when a certificate is required."
            )
        if self.require_not_revoked and not self.require_certificate:
            raise ValueError(
                "Not-revoked status can only be required when a certificate is required."
            )
        if self.require_policygate_allow and not (
            self.require_certificate and self.require_certificate_usable
        ):
            raise ValueError(
                "PolicyGate ALLOW requires both a certificate and current certificate usability."
            )
        expected_asset = "USDY" if self.supported_claim == "TreasuryBacking" else "PAXG"
        if self.supported_asset is not None and self.supported_asset != expected_asset:
            raise ValueError(
                f"{self.supported_claim} is only supported for {expected_asset}."
            )
        return self


class InstitutionalPolicy(InstitutionalPolicyDraft):
    """One immutable semantic version of a logical institutional policy."""

    policy_id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{2,63}$")
    policy_version: int = Field(ge=1)
    policy_commitment: str = Field(pattern=r"^0x[0-9a-f]{64}$")
    source: PolicySource = "SAVED POLICY"
    created_at: datetime
    updated_at: datetime
    mvp_status: Literal["MVP / PRE-PRODUCTION"] = "MVP / PRE-PRODUCTION"
    blockchain_write_performed: Literal[False] = False

    @field_validator("created_at", "updated_at")
    @classmethod
    def normalize_timestamp(cls, value: datetime) -> datetime:
        return _utc(value)

    @field_serializer("created_at", "updated_at")
    def serialize_timestamp(self, value: datetime) -> str:
        return value.isoformat().replace("+00:00", "Z")


class PolicyRuleResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rule: str
    required: Any = None
    observed: Any = None
    status: RuleStatus
    explanation: str


class PolicyEvaluation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    evaluation_id: str = Field(pattern=r"^0x[0-9a-f]{64}$")
    policy_id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{2,63}$")
    policy_version: int = Field(ge=1)
    policy_commitment: str = Field(pattern=r"^0x[0-9a-f]{64}$")
    asset: SupportedAsset
    claim: SupportedClaim
    evaluated_at: datetime
    trust_snapshot_id: str = Field(pattern=r"^0x[0-9a-f]{64}$")
    verification_result: AuthoritativeResult
    final_decision: PolicyDecision
    rule_results: list[PolicyRuleResult]
    blocking_reasons: list[str] = Field(default_factory=list)
    review_reasons: list[str] = Field(default_factory=list)
    explanation: str
    source_authenticity: list[AuthenticityLabel]
    evaluation_mode: Literal["CURRENT READ-ONLY STATE"] = "CURRENT READ-ONLY STATE"
    blockchain_write_performed: Literal[False] = False
    openai_call_performed: Literal[False] = False

    @field_validator("evaluated_at")
    @classmethod
    def normalize_timestamp(cls, value: datetime) -> datetime:
        return _utc(value)

    @field_serializer("evaluated_at")
    def serialize_timestamp(self, value: datetime) -> str:
        return value.isoformat().replace("+00:00", "Z")


class PolicyEvaluationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset: SupportedAsset
    claim: SupportedClaim

    @model_validator(mode="after")
    def validate_pair(self) -> "PolicyEvaluationRequest":
        expected = "TreasuryBacking" if self.asset == "USDY" else "GoldBacking"
        if self.claim != expected:
            raise ValueError(f"{self.asset} evaluation requires claim {expected}.")
        return self


class PolicyDecisionTransition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    previous_evaluation_id: str
    current_evaluation_id: str
    occurred_at: datetime
    previous_decision: PolicyDecision
    current_decision: PolicyDecision

    @field_validator("occurred_at")
    @classmethod
    def normalize_timestamp(cls, value: datetime) -> datetime:
        return _utc(value)

    @field_serializer("occurred_at")
    def serialize_timestamp(self, value: datetime) -> str:
        return value.isoformat().replace("+00:00", "Z")


class PolicySummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    policy: InstitutionalPolicy
    last_evaluation: PolicyEvaluation | None = None
    evaluation_count: int = Field(ge=0)
    href: str


class PolicyStudioOverview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    presets: list[PolicySummary]
    saved_policies: list[PolicySummary]
    supported_reason_codes: list[str]
    api_status: Literal["MVP / PRE-PRODUCTION"] = "MVP / PRE-PRODUCTION"
    automatic_re_evaluation_enabled: Literal[False] = False
    blockchain_write_performed: Literal[False] = False


class PolicyDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    policy: InstitutionalPolicy
    evaluations: list[PolicyEvaluation]
    decision_transitions: list[PolicyDecisionTransition]
    compatible_assets: list[SupportedAsset]
    automatic_re_evaluation_enabled: Literal[False] = False
    blockchain_write_performed: Literal[False] = False


__all__ = [
    "InstitutionalPolicy",
    "InstitutionalPolicyDraft",
    "PolicyDecisionTransition",
    "PolicyDetail",
    "PolicyEvaluation",
    "PolicyEvaluationRequest",
    "PolicyRuleResult",
    "PolicyStudioOverview",
    "PolicySummary",
    "SUPPORTED_REASON_CODES",
]
