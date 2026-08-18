"""X Layer Mainnet canonical asset registry.

Addresses sourced from OKLink explorer and Aave V3 governance proposals.
Only verified on-chain assets are listed — no invented tokens.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from typing import Optional

from services.markets.models import AssetCategory, MarketAsset
from services.markets.xlayer.rpc import eth_call, get_block_number

# Canonical ERC-20 selectors
_SELECTOR_SYMBOL = "0x95d89b41"
_SELECTOR_DECIMALS = "0x313ce567"
_SELECTOR_TOTAL_SUPPLY = "0x18160ddd"

# Cache TTL for on-chain reads (token metadata changes never)
_metadata_cache: dict[str, tuple[float, dict]] = {}
_METADATA_CACHE_TTL = 600  # 10 minutes


def _pad_address(addr: str) -> str:
    """Left-pad an address to 32 bytes for ABI encoding."""
    return addr[2:].lower().zfill(64)


def _decode_bytes32(hex_str: str) -> str:
    """Decode a bytes32 ABI return value to a string."""
    if not hex_str or hex_str == "0x" or len(hex_str) < 66:
        return ""
    try:
        raw = bytes.fromhex(hex_str[2:66])
        return raw.split(b"\x00")[0].decode("ascii", errors="replace")
    except (ValueError, UnicodeDecodeError):
        return ""


def _uint256_from_hex(hex_str: str) -> int:
    if not hex_str or hex_str == "0x":
        return 0
    return int(hex_str, 16)


def read_token_metadata(address: str) -> dict:
    """Read symbol, decimals, totalSupply from an on-chain ERC-20."""
    cached = _metadata_cache.get(address)
    if cached and (time.time() - cached[0]) < _METADATA_CACHE_TTL:
        return cached[1]

    meta: dict = {"address": address}
    try:
        sym_raw = eth_call(address, _SELECTOR_SYMBOL)
        meta["symbol"] = _decode_bytes32(sym_raw) or address[:10]
    except Exception:
        meta["symbol"] = address[:10]

    try:
        dec_raw = eth_call(address, _SELECTOR_DECIMALS)
        meta["decimals"] = _uint256_from_hex(dec_raw)
    except Exception:
        meta["decimals"] = 18

    try:
        supply_raw = eth_call(address, _SELECTOR_TOTAL_SUPPLY)
        raw_supply = _uint256_from_hex(supply_raw)
        decimals = meta["decimals"]
        meta["total_supply"] = str(raw_supply) if raw_supply else None
        meta["total_supply_human"] = (
            f"{raw_supply / 10**decimals:,.2f}" if raw_supply and decimals else None
        )
    except Exception:
        meta["total_supply"] = None
        meta["total_supply_human"] = None

    _metadata_cache[address] = (time.time(), meta)
    return meta


# ── Hardcoded registry (verified on-chain) ──────────────────────────────

_REGISTED_ASSETS: dict[str, dict] = {
    "0x779ded0c9e1022225f8e0630b35a9b54be713736": {
        "symbol": "USDT0",
        "name": "USDT0 (Tether USD bridged)",
        "decimals": 6,
        "category": AssetCategory.STABLECOIN,
    },
    "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8": {
        "symbol": "USDG",
        "name": "Global Dollar",
        "decimals": 6,
        "category": AssetCategory.STABLECOIN,
    },
    "0xe538905cf8410324e03a5a23c1c177a474d59b2b": {
        "symbol": "WOKB",
        "name": "Wrapped OKB",
        "decimals": 18,
        "category": AssetCategory.GOVERNANCE,
    },
    "0xb7c00000bcdeef966b20b3d884b98e64d2b06b4f": {
        "symbol": "xBTC",
        "name": "OKX Wrapped BTC",
        "decimals": 8,
        "category": AssetCategory.WRAPPED_CRYPTO,
    },
    "0xe7b000003a45145decf8a28fc755ad5ec5ea025a": {
        "symbol": "xETH",
        "name": "OKX Wrapped ETH",
        "decimals": 18,
        "category": AssetCategory.WRAPPED_CRYPTO,
    },
    "0x505000008de8748dbd4422ff4687a4fc9beba15b": {
        "symbol": "GHO",
        "name": "Aave GHO",
        "decimals": 18,
        "category": AssetCategory.STABLECOIN,
    },
    "0xafeab3b85b6a56cf5f02317f0f7a23340eb983d7": {
        "symbol": "xSOL",
        "name": "OKX Wrapped SOL",
        "decimals": 18,
        "category": AssetCategory.WRAPPED_CRYPTO,
    },
    "0x14a686103854dab7b8801e31979caa595835b25d": {
        "symbol": "xBETH",
        "name": "OKX Wrapped Staked ETH",
        "decimals": 18,
        "category": AssetCategory.YIELD_BEARING,
    },
}

# Aave reserves (set of addresses that are on Aave V3 X Layer)
AAVE_RESERVE_ADDRESSES: set[str] = set(_REGISTED_ASSETS.keys())


def get_all_assets() -> list[MarketAsset]:
    """Return all known X Layer Mainnet assets with live on-chain metadata."""
    now = datetime.now(timezone.utc).isoformat()
    block = get_block_number()

    assets: list[MarketAsset] = []
    for addr, reg in _REGISTED_ASSETS.items():
        try:
            meta = read_token_metadata(addr)
        except Exception:
            meta = {"symbol": reg["symbol"], "decimals": reg["decimals"]}

        symbol = meta.get("symbol") or reg["symbol"]
        decimals = meta.get("decimals") or reg["decimals"]
        total_supply = meta.get("total_supply_human")

        assets.append(
            MarketAsset(
                address=addr,
                symbol=reg["symbol"],
                name=reg["name"],
                decimals=decimals,
                category=reg["category"],
                total_supply=total_supply,
                aave_available=addr.lower() in {a.lower() for a in AAVE_RESERVE_ADDRESSES},
                observed_at=now,
            )
        )
    return assets


def get_asset_by_address(address: str) -> MarketAsset | None:
    """Look up a single asset by its contract address."""
    addr_lower = address.lower()
    for reg_addr, reg in _REGISTED_ASSETS.items():
        if reg_addr.lower() == addr_lower:
            try:
                meta = read_token_metadata(reg_addr)
            except Exception:
                meta = {"symbol": reg["symbol"], "decimals": reg["decimals"]}
            now = datetime.now(timezone.utc).isoformat()
            return MarketAsset(
                address=reg_addr,
                symbol=reg["symbol"],
                name=reg["name"],
                decimals=meta.get("decimals", reg["decimals"]),
                category=reg["category"],
                total_supply=meta.get("total_supply_human"),
                aave_available=True,
                observed_at=now,
            )
    return None


def is_known_asset(address: str) -> bool:
    addr_lower = address.lower()
    return any(r.lower() == addr_lower for r in _REGISTED_ASSETS)


def get_symbol_for_address(address: str) -> str:
    addr_lower = address.lower()
    for reg_addr, reg in _REGISTED_ASSETS.items():
        if reg_addr.lower() == addr_lower:
            return reg["symbol"]
    return address[:10]
