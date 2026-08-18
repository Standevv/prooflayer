"""The single official MCP server exposing ProofLayer's read-only tools."""

from __future__ import annotations

import os
from typing import Any

from mcp.server.fastmcp import FastMCP

from services.evidence.ondo import DEFAULT_ETHEREUM_MAINNET_RPC_URL
from services.evidence.usdy_attestation import DEFAULT_USDY_ATTESTATION_SNAPSHOT

from .tools import ProofLayerTools


mcp = FastMCP(
    "ProofLayer Verification Tools",
    instructions=(
        "Read-only access to existing ProofLayer evidence adapters, deterministic "
        "RVC verifiers, provenance analysis, and the deployed X Layer testnet state."
    ),
    log_level="ERROR",
)
tools = ProofLayerTools(
    ethereum_rpc_url=os.getenv("ETHEREUM_MAINNET_RPC_URL")
    or DEFAULT_ETHEREUM_MAINNET_RPC_URL,
    usdy_attestation_path=DEFAULT_USDY_ATTESTATION_SNAPSHOT,
)


@mcp.tool(structured_output=True)
def discover_assets() -> dict[str, Any]:
    """List assets and claim types supported by existing deterministic RVC code."""
    return tools.discover_assets()


@mcp.tool(structured_output=True)
def get_system_architecture(
    topic: str = "overview",
    audience: str = "engineer",
) -> dict[str, Any]:
    """Explain current and target ProofLayer architecture from repository facts."""
    return tools.get_system_architecture(topic, audience)


@mcp.tool(structured_output=True)
def get_asset_metadata(asset: str) -> dict[str, Any]:
    """Return source, verifier, and known certificate metadata for an asset."""
    return tools.get_asset_metadata(asset)


@mcp.tool(structured_output=True)
def get_evidence(asset: str, claim: str) -> dict[str, Any]:
    """Load normalized repository evidence for a supported asset and claim."""
    return tools.get_evidence(asset, claim)


@mcp.tool(structured_output=True)
def analyze_provenance(asset: str, claim: str) -> dict[str, Any]:
    """Analyze independent roots and evidence dependencies with ProofLayer provenance."""
    return tools.analyze_provenance(asset, claim)


@mcp.tool(structured_output=True)
def verify_claim(asset: str, claim: str) -> dict[str, Any]:
    """Invoke the existing deterministic RVC verifier for a supported claim."""
    return tools.verify_claim(asset, claim)


@mcp.tool(structured_output=True)
def get_certificate_state(certificate_id: str) -> dict[str, Any]:
    """Read registration and current usability from the X Layer registry."""
    return tools.get_certificate_state(certificate_id)


@mcp.tool(structured_output=True)
def get_policygate_state(
    certificate_id: str,
    asset: str,
    claim: str,
    policy: str,
) -> dict[str, Any]:
    """Read whether PolicyGate would currently accept a certificate; executes nothing."""
    return tools.get_policygate_state(certificate_id, asset, claim, policy)


@mcp.tool(structured_output=True)
def get_decision_history(certificate_id: str) -> dict[str, Any]:
    """Read successful DecisionLog entries for a certificate from X Layer."""
    return tools.get_decision_history(certificate_id)


def main() -> None:
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
