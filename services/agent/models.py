"""Structured API contracts for the ProofLayer verification agent."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


VerificationOutcome = Literal["PASS", "FAIL", "INDETERMINATE"]
CertificateStatus = Literal[
    "REGISTERED_USABLE",
    "REGISTERED_UNUSABLE",
    "NOT_REGISTERED",
    "UNAVAILABLE",
]
PolicyGateOutcome = Literal["ALLOWED", "BLOCKED", "UNAVAILABLE"]


class AgentRequest(BaseModel):
    """A single natural-language verification investigation."""

    model_config = ConfigDict(extra="forbid")

    query: str | None = Field(default=None, min_length=3, max_length=2_000)
    message: str | None = Field(default=None, min_length=3, max_length=2_000)

    @model_validator(mode="after")
    def require_one_input(self) -> "AgentRequest":
        if (self.query is None) == (self.message is None):
            raise ValueError("provide exactly one of query or message")
        return self

    @property
    def investigation_query(self) -> str:
        return self.query if self.query is not None else str(self.message)


class ToolTraceArguments(BaseModel):
    """Whitelisted, non-secret MCP arguments safe for the public trace."""

    model_config = ConfigDict(extra="forbid")

    asset: str | None = None
    claim: str | None = None
    certificate_id: str | None = None
    policy: str | None = None


class ToolTraceStep(BaseModel):
    """A safe execution summary; never hidden reasoning or chain-of-thought."""

    model_config = ConfigDict(extra="forbid")

    tool: str
    arguments: ToolTraceArguments = Field(default_factory=ToolTraceArguments)
    status: Literal["completed", "error"] = "completed"
    summary: str


class AgentResponse(BaseModel):
    """Grounded response returned by both the agent service and frontend gateway."""

    model_config = ConfigDict(extra="forbid")

    answer: str
    asset: str | None = None
    claim: str | None = None
    verification_result: VerificationOutcome | None = None
    certificate_status: CertificateStatus | None = None
    policygate_outcome: PolicyGateOutcome | None = None
    evidence_root_count: int | None = Field(default=None, ge=0)
    reason_codes: list[str] = Field(default_factory=list)
    tools_used: list[str] = Field(default_factory=list)
    trace: list[ToolTraceStep] = Field(default_factory=list)


__all__ = [
    "AgentRequest",
    "AgentResponse",
    "CertificateStatus",
    "PolicyGateOutcome",
    "ToolTraceArguments",
    "ToolTraceStep",
    "VerificationOutcome",
]
