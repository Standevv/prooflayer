"""Structured contracts and conservative presets for protocol integrations."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


ProtocolType = Literal["lending", "rwa_vault", "treasury_management"]
SupportedAsset = Literal["USDY", "PAXG"]
SupportedClaim = Literal["TreasuryBacking", "GoldBacking"]
ProtocolAction = Literal[
    "accept_as_collateral",
    "admit_to_vault",
    "approve_for_treasury_allocation",
]
VerificationResult = Literal["PASS", "FAIL", "INDETERMINATE"]
CertificateStatus = Literal[
    "REGISTERED_USABLE",
    "REGISTERED_UNUSABLE",
    "NOT_REGISTERED",
    "UNAVAILABLE",
    "NOT_CHECKED",
]
CertificateState = Literal[
    "USABLE",
    "EXPIRED",
    "REVOKED",
    "REGISTERED_UNUSABLE",
    "NO_CERTIFICATE",
    "NO_CERTIFICATE_FIXTURE",
    "LIVE_READ_UNAVAILABLE",
    "NOT_CHECKED",
]
PolicyGateOutcome = Literal["ALLOWED", "BLOCKED", "UNAVAILABLE", "NOT_CHECKED"]
ProtocolRecommendation = Literal["ACCEPT", "REJECT", "REVIEW_REQUIRED"]
TraceStatus = Literal["completed", "unavailable"]
AuthenticityLabel = Literal[
    "PROOFLAYER TOOL",
    "DETERMINISTIC RVC",
    "LIVE ON-CHAIN",
    "POLICY CHECK",
]


class ProtocolAcceptancePolicy(BaseModel):
    """The shared conservative acceptance rule used by all MVP presets."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    require_pass_result: bool = True
    require_usable_certificate: bool = True
    require_policygate_allow: bool = True


class ProtocolPreset(BaseModel):
    """UX context for a protocol integration; never financial risk logic."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    protocol_type: ProtocolType
    label: str
    action: ProtocolAction
    action_label: str
    primary_concern: str
    policy: ProtocolAcceptancePolicy = Field(
        default_factory=ProtocolAcceptancePolicy
    )


PROTOCOL_PRESETS: dict[ProtocolType, ProtocolPreset] = {
    "lending": ProtocolPreset(
        protocol_type="lending",
        label="Lending Protocol",
        action="accept_as_collateral",
        action_label="Accept asset as collateral",
        primary_concern=(
            "Is there a currently usable verification certificate for the required "
            "backing claim?"
        ),
    ),
    "rwa_vault": ProtocolPreset(
        protocol_type="rwa_vault",
        label="RWA Vault",
        action="admit_to_vault",
        action_label="Admit asset into vault",
        primary_concern=(
            "Does the asset satisfy the selected verification policy and have usable "
            "certificate state?"
        ),
    ),
    "treasury_management": ProtocolPreset(
        protocol_type="treasury_management",
        label="Treasury Management",
        action="approve_for_treasury_allocation",
        action_label="Approve asset for treasury allocation",
        primary_concern="Is the backing claim currently verifiable and enforceable?",
    ),
}


class ProtocolCheckRequest(BaseModel):
    """A read-only policy check requested by an integrating protocol."""

    model_config = ConfigDict(extra="forbid")

    protocol_type: ProtocolType
    asset: SupportedAsset
    claim: SupportedClaim
    action: ProtocolAction


class ProtocolTraceStep(BaseModel):
    """A factual public trace of one existing ProofLayer tool call."""

    model_config = ConfigDict(extra="forbid")

    step: int = Field(ge=1)
    tool: str
    status: TraceStatus
    outcome: str
    duration_ms: float = Field(ge=0)
    authenticity_labels: list[AuthenticityLabel] = Field(default_factory=list)


class ProtocolDecision(BaseModel):
    """Protocol-facing decision derived exclusively from ProofLayer state."""

    model_config = ConfigDict(extra="forbid")

    protocol_type: ProtocolType
    protocol_label: str
    asset: SupportedAsset
    claim: SupportedClaim
    intended_action: ProtocolAction
    action_label: str

    verification_status: Literal["COMPLETED", "UNAVAILABLE"]
    verification_result: VerificationResult | None = None
    certificate_exists: bool | None = None
    certificate_usable: bool | None = None
    certificate_status: CertificateStatus
    certificate_state: CertificateState
    policygate_outcome: PolicyGateOutcome

    final_protocol_recommendation: ProtocolRecommendation
    blocking_reasons: list[str] = Field(default_factory=list)
    evidence_root_count: int | None = Field(default=None, ge=0)
    reason_codes: list[str] = Field(default_factory=list)
    authenticity_sources: list[str] = Field(default_factory=list)
    explanation: list[str] = Field(default_factory=list)
    trace: list[ProtocolTraceStep] = Field(default_factory=list)
    policy_config: ProtocolAcceptancePolicy

    state_scope: Literal["CURRENT PROOFLAYER STATE"] = "CURRENT PROOFLAYER STATE"
    simulation_scope: Literal["PROTOCOL SIMULATION"] = "PROTOCOL SIMULATION"
    chain_id: Literal[1952] = 1952
    policygate_address: Literal[
        "0x8e07048285D5f54a3D1D2093b80F4Aa2ce75C645"
    ] = "0x8e07048285D5f54a3D1D2093b80F4Aa2ce75C645"
    blockchain_write_performed: Literal[False] = False


__all__ = [
    "PROTOCOL_PRESETS",
    "ProtocolAcceptancePolicy",
    "ProtocolCheckRequest",
    "ProtocolDecision",
    "ProtocolPreset",
    "ProtocolTraceStep",
]
