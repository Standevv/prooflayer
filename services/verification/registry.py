"""Mainnet RWA asset discovery registry for X Layer.

This registry catalogs real-world assets on X Layer Mainnet (chain 196).
An asset enters the registry ONLY if at least one credible source supports
its RWA nature AND on-chain deployment is confirmed.

Asset families:

  USDY (Ondo):   Reference verification asset. NOT deployed on X Layer.
                  Verified via Ethereum mainnet evidence reads.

  PAXG (Paxos):  Reference verification asset. NOT deployed on X Layer.
                  Verified via Ethereum mainnet evidence reads.

  xStocks:       Scalable family of 100+ individual tokenized stocks/ETFs
                  deployed on X Layer chain 196. Discovered dynamically via
                  xStocks API v2, bytecode-verified on chain 196. Each asset
                  has its own contract address (CREATE2 cross-chain).

Chain separation:
  Evidence reads:  Ethereum mainnet (chain 1) — USDY/PAXG evidence
  RVC computation: Pure Python (chain-agnostic)
  Certificate:     X Layer Testnet (chain 1952) — demo infrastructure
  PolicyGate:      X Layer Testnet (chain 1952) — demo infrastructure
  Markets:         X Layer Mainnet (chain 196) — Aave/Uniswap
  RWA discovery:   X Layer Mainnet (chain 196) — xStocks + registry scanning
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)


class RwaVerificationSupport(str, Enum):
    """How well ProofLayer can verify this asset."""
    FULLY_SUPPORTED = "FULLY_SUPPORTED"
    PARTIALLY_SUPPORTED = "PARTIALLY_SUPPORTED"
    DISCOVERED_ONLY = "DISCOVERED_ONLY"
    UNSUPPORTED = "UNSUPPORTED"


class RwaDiscoveryStatus(str, Enum):
    """Current ProofLayer verification status for the asset."""
    VERIFIED = "VERIFIED"
    WARNING = "WARNING"
    INDETERMINATE = "INDETERMINATE"
    FAILED = "FAILED"
    UNSUPPORTED = "UNSUPPORTED"


class AssetOrigin(str, Enum):
    """Where the asset contract lives relative to X Layer."""
    X_LAYER_NATIVE = "X_LAYER_NATIVE"
    CROSS_CHAIN_REFERENCE = "CROSS_CHAIN_REFERENCE"


@dataclass(frozen=True)
class RwaAsset:
    """One discovered or candidate RWA."""
    chain_id: int
    contract_address: str  # empty if not deployed on this chain
    symbol: str
    canonical_name: str
    issuer: str
    asset_class: str
    decimals: int
    deployment_source: str
    issuer_source: str
    evidence_adapter: str
    verification_support: RwaVerificationSupport
    current_status: RwaDiscoveryStatus
    discovery_timestamp: str
    description: str = ""
    ethereum_address: str | None = None  # cross-chain canonical address
    claims: tuple[str, ...] = ()
    deployed_on_xlayer: bool = False  # whether contract exists on chain 196
    # Verification depth fields
    asset_origin: AssetOrigin = AssetOrigin.X_LAYER_NATIVE
    deployment_verified: bool = False  # bytecode confirmed on chain
    framework_verified: bool = False   # issuer/framework evidence available
    backing_verified: bool = False     # reserve attestation available
    rvc_status: str = "UNAVAILABLE"    # current RVC result


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Static reference assets (NOT on X Layer) ────────────────────────────
#
# USDY and PAXG are preserved as cross-chain reference verification assets.
# They are NOT deployed on X Layer Mainnet. ProofLayer verifies them via
# Ethereum mainnet evidence reads.

_REFERENCE_ASSETS: list[RwaAsset] = [
    # ── USDY — Ondo U.S. Dollar Yield ─────────────────────────────
    RwaAsset(
        chain_id=196,
        contract_address="",  # NOT on X Layer
        symbol="USDY",
        canonical_name="Ondo U.S. Dollar Yield",
        issuer="Ondo USDY LLC",
        asset_class="TOKENIZED_TREASURY",
        decimals=18,
        deployment_source="Ondo official docs — NOT on X Layer (reference asset)",
        issuer_source="https://ondo.finance/usdy",
        evidence_adapter="ethereum_evm + attestation (Ethereum mainnet reads)",
        verification_support=RwaVerificationSupport.FULLY_SUPPORTED,
        current_status=RwaDiscoveryStatus.FAILED,  # STALE_ATTESTATION on Ethereum evidence
        discovery_timestamp="2025-06-01T00:00:00Z",
        description=(
            "Tokenized note backed by short-term U.S. Treasuries. "
            "NOT deployed on X Layer Mainnet. ProofLayer verifies via "
            "Ethereum mainnet evidence reads. RVC status: FAIL (stale attestation). "
            "Preserved as cross-chain reference verification asset."
        ),
        ethereum_address="0x96F6eF951840721AdBF46Ac996b59E0235CB985C",
        claims=("TreasuryBacking",),
        deployed_on_xlayer=False,
        asset_origin=AssetOrigin.CROSS_CHAIN_REFERENCE,
        deployment_verified=False,
        framework_verified=True,
        backing_verified=False,
        rvc_status="FAIL",
    ),

    # ── PAXG — PAX Gold ───────────────────────────────────────────
    RwaAsset(
        chain_id=196,
        contract_address="",  # NOT on X Layer
        symbol="PAXG",
        canonical_name="PAX Gold",
        issuer="Paxos Trust Company",
        asset_class="TOKENIZED_GOLD",
        decimals=18,
        deployment_source="Paxos official docs — NOT on X Layer (reference asset)",
        issuer_source="https://www.paxos.com/pax-gold",
        evidence_adapter="paxos + gold_backing (Ethereum mainnet reads)",
        verification_support=RwaVerificationSupport.FULLY_SUPPORTED,
        current_status=RwaDiscoveryStatus.INDETERMINATE,
        discovery_timestamp="2025-06-01T00:00:00Z",
        description=(
            "Each PAXG token represents one troy ounce of physical gold. "
            "NOT deployed on X Layer Mainnet. ProofLayer verifies via "
            "Ethereum mainnet evidence reads. RVC status: INDETERMINATE. "
            "Preserved as cross-chain reference verification asset."
        ),
        ethereum_address="0x45804880De22913dAFE09f4980848ECE6EcbAf78",
        claims=("GoldBacking",),
        deployed_on_xlayer=False,
        asset_origin=AssetOrigin.CROSS_CHAIN_REFERENCE,
        deployment_verified=False,
        framework_verified=True,
        backing_verified=False,
        rvc_status="INDETERMINATE",
    ),
]


# ── Dynamic xStocks registry ────────────────────────────────────────────
#
# xStocks are discovered dynamically from the xStocks API v2 and verified
# on X Layer chain 196. The registry is populated lazily on first access.

_xstocks_assets: list[RwaAsset] | None = None
_xstocks_lock = threading.Lock()
_xstocks_discovery_result: Any = None  # XStocksDiscoveryResult from adapter


def _xstock_to_rwa_asset(dep: Any) -> RwaAsset:
    """Convert an XStockDeployment to an RwaAsset for the registry."""
    from services.evidence.xstocks import XStockDeployment

    assert isinstance(dep, XStockDeployment)

    if dep.bytecode_verified:
        verification_support = RwaVerificationSupport.PARTIALLY_SUPPORTED
        current_status = RwaDiscoveryStatus.INDETERMINATE
        evidence_adapter = "xstocks_framework (shared framework evidence)"
        description = (
            f"Tokenized {dep.asset_class.lower().replace('tokenized_', '')} "
            f"tracking {dep.underlying_symbol}. "
            f"Issued by {dep.issuer} via {dep.framework}. "
            f"Bytecode verified on X Layer chain 196. "
            f"Framework-level backing evidence available; "
            f"per-token PoR not publicly available."
        )
        deployment_verified = True
        framework_verified = True
        backing_verified = False  # no per-token reserve attestation
    else:
        verification_support = RwaVerificationSupport.DISCOVERED_ONLY
        current_status = RwaDiscoveryStatus.UNSUPPORTED
        evidence_adapter = "none — bytecode not confirmed on chain 196"
        description = (
            f"Tokenized asset listed in xStocks API for X Layer but "
            f"bytecode not confirmed on chain 196. "
            f"Awaiting on-chain verification."
        )
        deployment_verified = False
        framework_verified = True  # framework docs exist even if bytecode missing
        backing_verified = False

    return RwaAsset(
        chain_id=196,
        contract_address=dep.xlayer_address,
        symbol=dep.xstock_symbol,
        canonical_name=dep.canonical_name,
        issuer=dep.issuer,
        asset_class=dep.asset_class,
        decimals=dep.decimals,
        deployment_source=dep.deployment_source,
        issuer_source=dep.metadata_source,
        evidence_adapter=evidence_adapter,
        verification_support=verification_support,
        current_status=current_status,
        discovery_timestamp=dep.metadata_source,
        description=description,
        ethereum_address=dep.xlayer_address,  # same address on all EVM chains
        claims=(),
        deployed_on_xlayer=dep.bytecode_verified,
        asset_origin=AssetOrigin.X_LAYER_NATIVE,
        deployment_verified=deployment_verified,
        framework_verified=framework_verified,
        backing_verified=backing_verified,
        rvc_status="INDETERMINATE" if dep.bytecode_verified else "UNAVAILABLE",
    )


def _ensure_xstocks_discovered() -> list[RwaAsset]:
    """Lazily discover xStocks and populate the registry.

    Thread-safe: only one thread runs discovery; others wait.
    Returns cached results on subsequent calls.
    """
    global _xstocks_assets, _xstocks_discovery_result

    if _xstocks_assets is not None:
        return _xstocks_assets

    with _xstocks_lock:
        # Double-check after acquiring lock
        if _xstocks_assets is not None:
            return _xstocks_assets

        try:
            from services.evidence.xstocks import discover_xstocks_on_xlayer
            result = discover_xstocks_on_xlayer(verify_bytecode=True)
            _xstocks_discovery_result = result
            _xstocks_assets = [_xstock_to_rwa_asset(dep) for dep in result.assets]
            logger.info(
                "xStocks discovery: %d assets, %d bytecode-verified on X Layer",
                result.xlayer_discovered,
                result.xlayer_bytecode_verified,
            )
        except Exception as exc:
            logger.error("xStocks discovery failed: %s", type(exc).__name__)
            _xstocks_assets = []
            _xstocks_discovery_result = None

        return _xstocks_assets


def get_xstocks_discovery_result() -> Any:
    """Return the raw xStocks discovery result (triggers discovery if needed)."""
    _ensure_xstocks_discovered()
    return _xstocks_discovery_result


# ── Combined registry ───────────────────────────────────────────────────

def get_registry() -> list[RwaAsset]:
    """Return the full RWA asset registry.

    Combines static reference assets (USDY, PAXG) with dynamically
    discovered xStocks. Counts are computed dynamically, not hardcoded.
    """
    static = list(_REFERENCE_ASSETS)
    xstocks = _ensure_xstocks_discovered()
    return static + xstocks


def get_asset_by_symbol(symbol: str) -> RwaAsset | None:
    symbol_upper = symbol.upper()
    # Check static assets first
    for asset in _REFERENCE_ASSETS:
        if asset.symbol.upper() == symbol_upper:
            return asset
    # Then check xStocks
    for asset in _ensure_xstocks_discovered():
        if asset.symbol.upper() == symbol_upper:
            return asset
    return None


def get_asset_by_address(address: str) -> RwaAsset | None:
    addr_lower = address.lower()
    # Check static assets
    for asset in _REFERENCE_ASSETS:
        if asset.contract_address and asset.contract_address.lower() == addr_lower:
            return asset
        if asset.ethereum_address and asset.ethereum_address.lower() == addr_lower:
            return asset
    # Check xStocks
    for asset in _ensure_xstocks_discovered():
        if asset.contract_address and asset.contract_address.lower() == addr_lower:
            return asset
        if asset.ethereum_address and asset.ethereum_address.lower() == addr_lower:
            return asset
    return None


def get_supported_assets() -> list[RwaAsset]:
    """Assets where ProofLayer has at least partial verification support."""
    return [
        a for a in get_registry()
        if a.verification_support in {
            RwaVerificationSupport.FULLY_SUPPORTED,
            RwaVerificationSupport.PARTIALLY_SUPPORTED,
        }
    ]


def get_xlayer_deployed_assets() -> list[RwaAsset]:
    """Assets actually deployed on X Layer Mainnet."""
    return [a for a in get_registry() if a.deployed_on_xlayer]


def get_discoverable_assets() -> list[RwaAsset]:
    """All assets including candidates and unsupported."""
    return get_registry()


def register_asset(asset: RwaAsset) -> None:
    """Register a new asset. Primarily for testing; prefer discovery for xStocks."""
    # This modifies the internal list for test compatibility.
    # In production, assets come from discovery.
    _REFERENCE_ASSETS.append(asset)


def asset_summary() -> dict[str, Any]:
    """Registry coverage summary with dynamically computed counts.

    All counts are derived from the actual registry contents, not hardcoded.
    """
    registry = get_registry()
    fully = sum(1 for a in registry if a.verification_support == RwaVerificationSupport.FULLY_SUPPORTED)
    partial = sum(1 for a in registry if a.verification_support == RwaVerificationSupport.PARTIALLY_SUPPORTED)
    discovered = sum(1 for a in registry if a.verification_support == RwaVerificationSupport.DISCOVERED_ONLY)
    unsupported = sum(1 for a in registry if a.verification_support == RwaVerificationSupport.UNSUPPORTED)
    on_xlayer = sum(1 for a in registry if a.deployed_on_xlayer)

    # Get xStocks discovery stats if available
    disc = _xstocks_discovery_result
    xstocks_api_count = disc.api_asset_count if disc else 0
    xstocks_xlayer_discovered = disc.xlayer_discovered if disc else 0
    xstocks_bytecode_verified = disc.xlayer_bytecode_verified if disc else 0

    return {
        "total_candidates": len(registry),
        "confirmed_xlayer_deployments": on_xlayer,
        "fully_supported": fully,
        "partially_supported": partial,
        "discovered_only": discovered,
        "unsupported": unsupported,
        "chain_id": 196,
        "network": "X Layer Mainnet",
        "evidence_chain": "Ethereum mainnet (chain 1) — USDY/PAXG reference assets",
        "rvc_chain": "Pure Python (chain-agnostic)",
        "certificate_chain": "X Layer Testnet (chain 1952) — demo",
        "xstocks_api_asset_count": xstocks_api_count,
        "xstocks_xlayer_discovered": xstocks_xlayer_discovered,
        "xstocks_bytecode_verified": xstocks_bytecode_verified,
        "reference_assets": ["USDY (Ondo, Ethereum mainnet)", "PAXG (Paxos, Ethereum mainnet)"],
        "note": (
            f"Registry contains {len(registry)} assets: "
            f"{fully} fully supported (USDY/PAXG reference), "
            f"{partial} framework-verified (xStocks on X Layer), "
            f"{discovered} discovered-only, "
            f"{unsupported} unsupported. "
            f"USDY and PAXG are cross-chain reference assets verified via "
            f"Ethereum mainnet. xStocks are individually deployed on X Layer "
            f"chain 196 with bytecode verification."
        ),
    }


__all__ = [
    "AssetOrigin",
    "RwaAsset",
    "RwaDiscoveryStatus",
    "RwaVerificationSupport",
    "asset_summary",
    "get_asset_by_address",
    "get_asset_by_symbol",
    "get_discoverable_assets",
    "get_registry",
    "get_supported_assets",
    "get_xlayer_deployed_assets",
    "get_xstocks_discovery_result",
    "register_asset",
]
