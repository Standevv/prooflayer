"""Read-only platform status assembled from existing ProofLayer capabilities."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any

from services.agent.verification_agent import is_agent_configured
from services.mcp_server.tools import (
    DECISION_LOG_ADDRESS,
    POLICY_GATE_ADDRESS,
    REGISTRY_ADDRESS,
    XLAYER_CHAIN_ID,
    ProofLayerTools,
)

from .models import (
    DeveloperComponentStatus,
    DeveloperContractReference,
    DeveloperPlatformStatus,
)


class DeveloperStatusService:
    """Report availability without exposing secrets or invoking write methods."""

    def __init__(
        self,
        tools: ProofLayerTools | Any | None = None,
        *,
        agent_configured: Callable[[], bool] = is_agent_configured,
    ) -> None:
        self.tools = tools or ProofLayerTools()
        self._agent_configured = agent_configured

    def get_status(self) -> DeveloperPlatformStatus:
        latest_block: int | None = None
        try:
            candidate = self.tools.get_xlayer_status()
            if not isinstance(candidate, Mapping):
                raise TypeError("X Layer status reader returned an invalid response")
            if candidate.get("chain_id") != XLAYER_CHAIN_ID:
                raise ValueError("X Layer status reader returned the wrong chain")
            block = candidate.get("latest_block")
            latest_block = int(block) if isinstance(block, int) else None
            xlayer = DeveloperComponentStatus(
                status="CONNECTED",
                detail="Read-only RPC connection confirmed on chain 1952.",
                authenticity_labels=["LIVE READ"],
            )
        except Exception:
            xlayer = DeveloperComponentStatus(
                status="UNAVAILABLE",
                detail="X Layer live read is unavailable; no chain state is inferred.",
                authenticity_labels=["UNAVAILABLE"],
            )

        agent_available = bool(self._agent_configured())
        return DeveloperPlatformStatus(
            api=DeveloperComponentStatus(
                status="AVAILABLE",
                detail="The local FastAPI read-only interface responded.",
                authenticity_labels=["DERIVED"],
            ),
            xlayer=xlayer,
            ai_agent=DeveloperComponentStatus(
                status="AVAILABLE" if agent_available else "UNCONFIGURED",
                detail=(
                    "Optional AI verification agent is configured."
                    if agent_available
                    else "Optional AI verification agent requires a separately configured OpenAI API key."
                ),
                authenticity_labels=["DERIVED"],
            ),
            deterministic_verification=DeveloperComponentStatus(
                status="AVAILABLE",
                detail="TreasuryBacking and GoldBacking RVC implementations are available.",
                authenticity_labels=["DETERMINISTIC RVC"],
            ),
            openapi=DeveloperComponentStatus(
                status="AVAILABLE",
                detail="FastAPI generated OpenAPI document is exposed at /openapi.json.",
                authenticity_labels=["DERIVED"],
            ),
            latest_block=latest_block,
            contracts=[
                DeveloperContractReference(
                    name="CertificateRegistry",
                    purpose="Stores verification certificates",
                    address=REGISTRY_ADDRESS,
                ),
                DeveloperContractReference(
                    name="PolicyGate",
                    purpose="Enforces certificate usability",
                    address=POLICY_GATE_ADDRESS,
                ),
                DeveloperContractReference(
                    name="DecisionLog",
                    purpose="Records successful policy decisions",
                    address=DECISION_LOG_ADDRESS,
                ),
            ],
        )


__all__ = ["DeveloperStatusService"]
