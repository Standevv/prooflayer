"""Public response models for the read-only ProofLayer Certificate Explorer."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


AuthenticitySource = Literal[
    "LIVE ON-CHAIN",
    "DEMO FIXTURE",
    "DERIVED",
    "DERIVED FROM KNOWN PROJECT CONFIG",
    "UNAVAILABLE",
]
VerificationResult = Literal["PASS", "FAIL", "INDETERMINATE", "UNKNOWN"]
UsabilityState = Literal[
    "USABLE",
    "EXPIRED",
    "REVOKED",
    "NON-PASS",
    "NOT REGISTERED",
    "LIVE READ UNAVAILABLE",
    "UNUSABLE",
]


class CertificateCore(BaseModel):
    model_config = ConfigDict(extra="forbid")

    certificate_id: str
    asset_id: str | None = None
    claim_type: str | None = None
    policy_id: str | None = None
    evidence_root: str | None = None
    observed_at: int | None = None
    valid_until: int | None = None
    independent_root_count: int | None = Field(default=None, ge=0)
    result_code: int | None = None
    result: VerificationResult | None = None
    issuer: str | None = None
    revoked: bool | None = None


class CertificateLabels(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset: str | None = None
    claim: str | None = None
    policy: str | None = None
    source: Literal["DERIVED FROM KNOWN PROJECT CONFIG"] = (
        "DERIVED FROM KNOWN PROJECT CONFIG"
    )


class OffchainVerificationData(BaseModel):
    model_config = ConfigDict(extra="forbid")

    claim_version: str
    policy_version: str
    reason_codes: list[str] = Field(default_factory=list)
    compiler_version: str
    simulation: bool
    source: Literal["DEMO FIXTURE"] = "DEMO FIXTURE"


class RegistryState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    read_status: Literal["AVAILABLE", "UNAVAILABLE"]
    network: Literal["X Layer Testnet"] = "X Layer Testnet"
    chain_id: Literal[1952] = 1952
    registry_address: Literal[
        "0xC24A1Aa861aA4ca5D15CEC055223EBACd0940935"
    ] = "0xC24A1Aa861aA4ca5D15CEC055223EBACd0940935"
    certificate_exists: bool | None = None
    current_usable: bool | None = None
    issuer: str | None = None
    revoked: bool | None = None
    latest_block: int | None = Field(default=None, ge=0)
    error: str | None = None
    source: AuthenticitySource


class UsabilityAssessment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state: UsabilityState
    usable: bool | None = None
    reason: str
    source: AuthenticitySource


class DecisionRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision_id: str
    certificate_id: str
    actor: str
    action_type: str
    allowed: bool
    timestamp: int
    block_number: int
    transaction_hash: str | None = None
    source: Literal["LIVE ON-CHAIN"] = "LIVE ON-CHAIN"


class DecisionHistory(BaseModel):
    model_config = ConfigDict(extra="forbid")

    read_status: Literal["AVAILABLE", "UNAVAILABLE", "NOT CHECKED"]
    records: list[DecisionRecord] = Field(default_factory=list)
    matching_count: int = Field(default=0, ge=0)
    total_decision_count: int | None = Field(default=None, ge=0)
    query_from_block: int | None = Field(default=None, ge=0)
    query_to_block: int | None = Field(default=None, ge=0)
    history_complete_since_deployment: bool | None = None
    note: str
    source: AuthenticitySource


class EnforcementStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    read_status: Literal["AVAILABLE", "UNAVAILABLE", "NOT CHECKED"]
    policygate_address: Literal[
        "0x8e07048285D5f54a3D1D2093b80F4Aa2ce75C645"
    ] = "0x8e07048285D5f54a3D1D2093b80F4Aa2ce75C645"
    certificate_usable: bool | None = None
    outcome: Literal["ALLOW", "BLOCK", "NOT CHECKED", "UNAVAILABLE"]
    reason: str
    source: AuthenticitySource
    action_executed: Literal[False] = False


class CertificateTimeline(BaseModel):
    model_config = ConfigDict(extra="forbid")

    observed_at: int | None = None
    registered_network: str | None = None
    registration_timestamp: None = None
    valid_until: int | None = None
    validity_state: Literal["ACTIVE", "EXPIRED", "UNAVAILABLE"]
    current_state: UsabilityState


class CertificateExplorerRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    certificate_id: str
    found: bool
    live_certificate_found: bool | None
    local_fixture_found: bool
    fixture_matches_live: bool | None = None
    core: CertificateCore
    field_sources: dict[str, AuthenticitySource]
    labels: CertificateLabels
    offchain_verification: OffchainVerificationData | None = None
    registry: RegistryState
    usability: UsabilityAssessment
    decisions: DecisionHistory
    enforcement: EnforcementStatus
    timeline: CertificateTimeline
    authenticity_sources: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    blockchain_write_performed: Literal[False] = False


__all__ = [
    "AuthenticitySource",
    "CertificateCore",
    "CertificateExplorerRecord",
    "CertificateLabels",
    "CertificateTimeline",
    "DecisionHistory",
    "DecisionRecord",
    "EnforcementStatus",
    "OffchainVerificationData",
    "RegistryState",
    "UsabilityAssessment",
]
