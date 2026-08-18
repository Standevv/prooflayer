"""Structured models for verified-market eligibility and response shape."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


SupportedMarketAsset = Literal["USDY", "PAXG"]
MarketAction = Literal["swap", "withdraw"]
MarketRecommendation = Literal["ACCESSIBLE", "BLOCKED", "UNAVAILABLE"]
TraceStatus = Literal["completed", "unavailable"]
AuthenticityLabel = Literal[
    "PROOFLAYER TOOL",
    "DETERMINISTIC RVC",
    "LIVE ON-CHAIN",
    "POLICY CHECK",
]


class MarketTraceStep(BaseModel):
    """One read-only ProofLayer tool call performed during eligibility check."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    step: int = Field(ge=1)
    tool: str
    status: TraceStatus
    outcome: str
    duration_ms: float = Field(ge=0)
    authenticity_labels: list[AuthenticityLabel] = Field(default_factory=list)


class MarketEligibilityRequest(BaseModel):
    """Request to evaluate market eligibility for one asset."""

    model_config = ConfigDict(extra="forbid")

    asset: SupportedMarketAsset
    action: MarketAction


class MarketEligibilityResult(BaseModel):
    """Market eligibility decision derived exclusively from ProofLayer state."""

    model_config = ConfigDict(extra="forbid")

    asset: SupportedMarketAsset
    action: MarketAction

    verification_status: Literal["COMPLETED", "UNAVAILABLE"]
    verification_result: str | None = None
    certificate_exists: bool | None = None
    certificate_usable: bool | None = None
    certificate_status: str = "NOT_CHECKED"
    certificate_state: str = "NOT_CHECKED"
    policygate_outcome: str = "NOT_CHECKED"

    recommendation: MarketRecommendation
    blocking_reasons: list[str] = Field(default_factory=list)
    reason_codes: list[str] = Field(default_factory=list)
    authenticity_sources: list[str] = Field(default_factory=list)
    explanation: list[str] = Field(default_factory=list)
    trace: list[MarketTraceStep] = Field(default_factory=list)

    state_scope: Literal["CURRENT PROOFLAYER STATE"] = "CURRENT PROOFLAYER STATE"
    chain_id: Literal[1952] = 1952
    blockchain_write_performed: Literal[False] = False


__all__ = [
    "AuthenticityLabel",
    "MarketAction",
    "MarketEligibilityRequest",
    "MarketEligibilityResult",
    "MarketRecommendation",
    "MarketTraceStep",
    "SupportedMarketAsset",
    "TraceStatus",
]
