"""Public contracts for the zero-cost deterministic ProofLayer demo runner."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from services.agent.models import CertificateStatus, VerificationOutcome


DemoScenario = Literal[
    "usdy_treasury_verification",
    "paxg_gold_verification",
    "usdy_certificate_eligibility",
    "provenance_inspection",
]
DemoPolicyGateOutcome = Literal[
    "ALLOWED",
    "BLOCKED",
    "UNAVAILABLE",
    "NOT_CHECKED",
]
DemoTraceStatus = Literal["completed", "unavailable"]
DemoAuthenticityLabel = Literal[
    "REAL TOOL CALL",
    "DETERMINISTIC RVC",
    "LIVE ON-CHAIN",
    "DEMO FIXTURE",
]


class DemoRunnerRequest(BaseModel):
    """A predefined, deterministic workflow request."""

    model_config = ConfigDict(extra="forbid")

    scenario: DemoScenario
    asset: str | None = Field(default=None, min_length=1, max_length=64)
    claim: str | None = Field(default=None, min_length=1, max_length=128)

    @model_validator(mode="after")
    def require_provenance_inputs(self) -> "DemoRunnerRequest":
        if self.scenario == "provenance_inspection" and (
            self.asset is None or self.claim is None
        ):
            raise ValueError(
                "provenance_inspection requires both asset and claim"
            )
        return self


class DemoTraceArguments(BaseModel):
    """Whitelisted, non-secret arguments included in a public demo trace."""

    model_config = ConfigDict(extra="forbid")

    asset: str | None = None
    claim: str | None = None
    certificate_id: str | None = None
    policy: str | None = None


class DemoTraceStep(BaseModel):
    """One factual tool execution record, never hidden reasoning."""

    model_config = ConfigDict(extra="forbid")

    step: int = Field(ge=1)
    tool: str
    arguments: DemoTraceArguments = Field(default_factory=DemoTraceArguments)
    status: DemoTraceStatus
    result_summary: str
    duration_ms: float = Field(ge=0)
    authenticity_labels: list[DemoAuthenticityLabel] = Field(default_factory=list)


class DemoRunnerResponse(BaseModel):
    """Grounded response assembled only from predefined ProofLayer tool outputs."""

    model_config = ConfigDict(extra="forbid")

    mode: Literal["deterministic_demo"] = "deterministic_demo"
    scenario: DemoScenario
    asset: str
    claim: str
    verification_result: VerificationOutcome | None = None
    certificate_status: CertificateStatus | None = None
    policygate_outcome: DemoPolicyGateOutcome | None = None
    reason_codes: list[str] = Field(default_factory=list)
    evidence_root_count: int | None = Field(default=None, ge=0)
    trace: list[DemoTraceStep] = Field(default_factory=list)
    summary: str


__all__ = [
    "DemoRunnerRequest",
    "DemoRunnerResponse",
    "DemoScenario",
    "DemoTraceArguments",
    "DemoTraceStep",
]
