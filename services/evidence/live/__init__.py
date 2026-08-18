"""Live evidence source registry for ProofLayer V1.

Maintains a canonical catalog of every evidence source, its capabilities,
retrieval method, and current availability state. The registry is the single
source of truth for which providers are configured and how to reach them.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class SourceType(str, Enum):
    ISSUER = "issuer"
    BLOCKCHAIN_RPC = "blockchain_rpc"
    ORACLE = "oracle"
    MARKET_DATA = "market_data"
    AUDITOR = "attestation"
    CUSTODIAN = "custodian"
    INDEXER = "indexer"
    DOCUMENT = "document"
    INTERNAL_FIXTURE = "internal_fixture"


class SourceAvailabilityState(str, Enum):
    AVAILABLE = "AVAILABLE"
    NOT_CONFIGURED = "NOT_CONFIGURED"
    UNAUTHORIZED = "UNAUTHORIZED"
    RATE_LIMITED = "RATE_LIMITED"
    TIMEOUT = "TIMEOUT"
    UNSUPPORTED = "UNSUPPORTED"
    INVALID_RESPONSE = "INVALID_RESPONSE"
    STALE = "STALE"
    OFFLINE = "OFFLINE"


class EvidenceCollectionMode(str, Enum):
    LIVE = "LIVE"
    CACHED = "CACHED"
    SNAPSHOT = "SNAPSHOT"
    FIXTURE = "FIXTURE"


@dataclass(frozen=True)
class SourceDefinition:
    source_id: str
    source_name: str
    source_type: SourceType
    root_source_id: str
    base_url: str | None = None
    authority_category: str = "unknown"
    supported_assets: tuple[str, ...] = ()
    supported_claims: tuple[str, ...] = ()
    authentication_required: bool = False
    authentication_env_var: str | None = None
    retrieval_method: str = "http"
    refresh_interval_seconds: int = 3600
    enabled: bool = True
    description: str = ""


@dataclass
class SourceStatus:
    source_id: str
    state: SourceAvailabilityState
    last_retrieved_at: str | None = None
    last_success_at: str | None = None
    last_error: str | None = None
    retry_count: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Canonical registry — every evidence source ProofLayer can use
# ---------------------------------------------------------------------------

SOURCE_REGISTRY: dict[str, SourceDefinition] = {}


def _register(source: SourceDefinition) -> None:
    SOURCE_REGISTRY[source.source_id] = source


# -- Ondo Finance (issuer) --

_register(SourceDefinition(
    source_id="ondo-portfolio",
    source_name="Ondo USDY Portfolio Snapshot",
    source_type=SourceType.ISSUER,
    root_source_id="ondo",
    base_url="https://ondo.finance/usdy",
    authority_category="issuer",
    supported_assets=("USDY",),
    supported_claims=("TreasuryBacking",),
    authentication_required=False,
    retrieval_method="cached_snapshot",
    refresh_interval_seconds=86400,
    description="Cached official Ondo USDY portfolio composition and financials.",
))

_register(SourceDefinition(
    source_id="ondo-addresses",
    source_name="Ondo Official Contract Addresses",
    source_type=SourceType.ISSUER,
    root_source_id="ondo",
    base_url="https://docs.ondo.finance/addresses.md",
    authority_category="issuer",
    supported_assets=("USDY",),
    supported_claims=("TreasuryBacking",),
    authentication_required=False,
    retrieval_method="http_markdown",
    refresh_interval_seconds=86400,
    description="Official Ondo contract address listing for address verification.",
))

# -- Ankura Trust (attestation) --

_register(SourceDefinition(
    source_id="ankura-daily-attestation",
    source_name="Ankura Trust Daily USDY Attestation",
    source_type=SourceType.AUDITOR,
    root_source_id="ankura",
    base_url="https://www.dropbox.com/scl/fo/375wdvar3rbc7o23nxsgp/AOFY8jhpENaNx9WAw-WPnbY?rlkey=4icqn1z9bez725wywr30fx52a",
    authority_category="attestation",
    supported_assets=("USDY",),
    supported_claims=("TreasuryBacking",),
    authentication_required=False,
    retrieval_method="cached_snapshot",
    refresh_interval_seconds=86400,
    description="Ankura Trust Company daily reserve attestation for USDY.",
))

# -- Ethereum onchain --

_register(SourceDefinition(
    source_id="ethereum-usdy-onchain",
    source_name="Ethereum USDY ERC-20 On-Chain State",
    source_type=SourceType.BLOCKCHAIN_RPC,
    root_source_id="ethereum",
    base_url="https://ethereum-rpc.publicnode.com",
    authority_category="onchain",
    supported_assets=("USDY",),
    supported_claims=("TreasuryBacking",),
    authentication_required=False,
    retrieval_method="evm_jsonrpc",
    refresh_interval_seconds=300,
    description="Live Ethereum mainnet USDY totalSupply and contract verification.",
))

# -- RWA.xyz (market data / discovery) --

_register(SourceDefinition(
    source_id="rwa-xyz",
    source_name="RWA.xyz Tokenized Asset Data",
    source_type=SourceType.MARKET_DATA,
    root_source_id="rwa-xyz",
    base_url="https://app.rwa.xyz",
    authority_category="aggregator",
    supported_assets=("USDY",),
    supported_claims=("TreasuryBacking",),
    authentication_required=True,
    authentication_env_var="RWA_XYZ_API_KEY",
    retrieval_method="http_json",
    refresh_interval_seconds=3600,
    description="RWA.xyz discovery and market-context data for tokenized assets.",
))

# -- Chainlink (oracle) --

_register(SourceDefinition(
    source_id="chainlink-usdy",
    source_name="Chainlink USDY Price Feed",
    source_type=SourceType.ORACLE,
    root_source_id="chainlink",
    base_url="https://data.chain.link",
    authority_category="oracle",
    supported_assets=("USDY",),
    supported_claims=("TreasuryBacking",),
    authentication_required=False,
    retrieval_method="evm_jsonrpc",
    refresh_interval_seconds=300,
    description="Chainlink price feed for USDY (if available).",
))

_register(SourceDefinition(
    source_id="chainlink-proof-of-reserve",
    source_name="Chainlink Proof of Reserve",
    source_type=SourceType.ORACLE,
    root_source_id="chainlink",
    base_url="https://data.chain.link",
    authority_category="oracle",
    supported_assets=("USDY",),
    supported_claims=("TreasuryBacking",),
    authentication_required=False,
    retrieval_method="evm_jsonrpc",
    refresh_interval_seconds=300,
    description="Chainlink Proof of Reserve feeds for tokenized US Treasuries (if available).",
))


def get_source(source_id: str) -> SourceDefinition | None:
    return SOURCE_REGISTRY.get(source_id)


def get_sources_for_asset(asset: str) -> list[SourceDefinition]:
    normalized = asset.strip().upper()
    return [
        source
        for source in SOURCE_REGISTRY.values()
        if normalized in source.supported_assets and source.enabled
    ]


def get_source_availability(
    source_id: str,
    *,
    api_key_present: bool = True,
    last_error: str | None = None,
) -> SourceAvailabilityState:
    source = get_source(source_id)
    if source is None:
        return SourceAvailabilityState.OFFLINE
    if not source.enabled:
        return SourceAvailabilityState.UNSUPPORTED
    if source.authentication_required and not api_key_present:
        return SourceAvailabilityState.NOT_CONFIGURED
    if last_error:
        error_lower = last_error.lower()
        if "timeout" in error_lower:
            return SourceAvailabilityState.TIMEOUT
        if "429" in error_lower or "rate" in error_lower:
            return SourceAvailabilityState.RATE_LIMITED
        if "401" in error_lower or "403" in error_lower or "unauthorized" in error_lower:
            return SourceAvailabilityState.UNAUTHORIZED
        if "404" in error_lower or "not found" in error_lower:
            return SourceAvailabilityState.UNSUPPORTED
        return SourceAvailabilityState.OFFLINE
    return SourceAvailabilityState.AVAILABLE


__all__ = [
    "EvidenceCollectionMode",
    "SourceAvailabilityState",
    "SourceDefinition",
    "SourceType",
    "SourceAvailabilityState",
    "SOURCE_REGISTRY",
    "get_source",
    "get_source_availability",
    "get_sources_for_asset",
]
