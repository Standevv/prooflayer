"""Aave V3 X Layer Mainnet reader.

Uses DeFi Llama yield API for live supply/borrow APY and TVL,
cross-referenced with the on-chain reserves list from the Pool contract.

Performance: fetches reserves via batched JSON-RPC, caches results,
and shares data between earn/borrow to avoid duplicate work.
"""

from __future__ import annotations

import json
import logging
import time
import urllib.request
from datetime import datetime, timezone
from typing import Any

from services.markets.models import BorrowOpportunity, EarnOpportunity
from services.markets.xlayer.assets import (
    AAVE_RESERVE_ADDRESSES,
    get_symbol_for_address,
)
from services.markets.xlayer.rpc import eth_call, eth_call_batch, get_block_number

logger = logging.getLogger(__name__)

# DeFi Llama yield API (public, no key required)
_DEFI_LLAMA_POOLS_URL = "https://yields.llama.fi/pools"

# Aave V3 Pool on X Layer Mainnet
AAVE_V3_POOL = "0xE3F3Caefdd7180F884c01E57f65Df979Af84f116"

# keccak256('getReservesList()')[:4]
_SELECTOR_GET_RESERVES_LIST = "0xd1946dbc"

# keccak256('getReserveData(address)')[:4]
_SELECTOR_GET_RESERVE_DATA = "0x35ea6a75"

# Cache
_llama_cache: dict[str, tuple[float, list[dict]]] = {}
_LLAMA_CACHE_TTL = 60  # seconds

# Function-level cache for combined reserve data
_reserve_data_cache: dict[str, tuple[float, list[dict]]] = {}
_RESERVE_DATA_CACHE_TTL = 15  # seconds — short TTL for live rates


def _fetch_llama_pools() -> list[dict]:
    """Fetch all Aave V3 X Layer pools from DeFi Llama."""
    now = time.time()
    cached = _llama_cache.get("aave_v3_xlayer")
    if cached and (now - cached[0]) < _LLAMA_CACHE_TTL:
        return cached[1]

    try:
        req = urllib.request.Request(_DEFI_LLAMA_POOLS_URL, headers={"Accept": "application/json"})
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read())
        pools = data.get("data", [])
        xlayer_aave = [
            p
            for p in pools
            if (p.get("chain") or "").lower() == "xlayer"
            and "aave" in (p.get("project") or "").lower()
        ]
        _llama_cache["aave_v3_xlayer"] = (now, xlayer_aave)
        return xlayer_aave
    except Exception as exc:
        logger.warning("DeFi Llama fetch failed: %s", type(exc).__name__)
        return cached[1] if cached else []


def _get_reserves_from_chain() -> list[str]:
    """Read the reserves list from the Aave V3 Pool contract on X Layer."""
    try:
        raw = eth_call(AAVE_V3_POOL, _SELECTOR_GET_RESERVES_LIST)
        if not raw or raw == "0x":
            return []
        hex_data = raw[2:]
        offset = int(hex_data[0:64], 16) * 2
        length = int(hex_data[64:128], 16)
        addresses = []
        for i in range(length):
            start = offset + (i * 64)
            chunk = hex_data[start : start + 64]
            addr = "0x" + chunk[24:64]
            addresses.append(addr)
        return addresses
    except Exception as exc:
        logger.warning("Aave getReservesList failed: %s", type(exc).__name__)
        return []


def _parse_reserve_data(raw_hex: str) -> dict[str, Any]:
    """Parse the 480-byte return of Pool.getReserveData(address)."""
    if not raw_hex or len(raw_hex) < 962:
        return {}

    def word(idx: int) -> int:
        start = 2 + idx * 64
        return int(raw_hex[start : start + 64], 16)

    def addr(idx: int) -> str:
        return "0x" + hex(word(idx) & ((1 << 160) - 1))[2:].zfill(40)

    return {
        "configuration": word(0),
        "liquidity_index": word(1),
        "current_liquidity_rate": word(2),
        "variable_borrow_index": word(3),
        "current_variable_borrow_rate": word(4),
        "current_stable_borrow_rate": word(5),
        "a_token": addr(8),
        "variable_debt_token": addr(10),
    }


def _ray_to_apr(ray_value: int) -> float:
    """Convert Aave ray (1e27 = 100%) to a decimal APR."""
    return ray_value / 1e27


def _normalize_symbol(s: str) -> str:
    """Normalize a token symbol for fuzzy matching."""
    replacements = {"\u20ae": "T", "₼": "M", "₩": "W", "Ξ": "E", "₿": "P"}
    result = s
    for unicode_char, ascii_char in replacements.items():
        result = result.replace(unicode_char, ascii_char)
    return ''.join(c for c in result if c.isascii() and c.isalnum()).lower()


def _symbols_match(llama_symbol: str, chain_symbol: str) -> bool:
    """Check if a DeFi Llama symbol matches a chain token symbol."""
    n1 = _normalize_symbol(llama_symbol)
    n2 = _normalize_symbol(chain_symbol)
    if not n1 or not n2:
        return False
    return n1 == n2 or n1 in n2 or n2 in n1


def _format_pct(value: float | None) -> str | None:
    if value is None:
        return None
    return f"{value * 100:.2f}%"


def _get_tvl_map() -> dict[str, float]:
    """Build a symbol→TVL mapping from DeFi Llama for supplementary data."""
    llama_pools = _fetch_llama_pools()
    tvl_map: dict[str, float] = {}
    for pool in llama_pools:
        sym = pool.get("symbol", "")
        tvl = pool.get("tvlUsd", 0)
        if sym and tvl:
            tvl_map[_normalize_symbol(sym)] = tvl
    return tvl_map


def _fetch_all_reserve_data() -> list[dict[str, Any]]:
    """Fetch all reserve data in a single batched call. Shared between earn/borrow.

    Returns list of dicts with keys: address, symbol, parsed, config fields.
    """
    now = time.time()
    cache_key = "all_reserves"
    cached = _reserve_data_cache.get(cache_key)
    if cached and (now - cached[0]) < _RESERVE_DATA_CACHE_TTL:
        return cached[1]

    chain_reserves = _get_reserves_from_chain()
    known_addrs = {a.lower() for a in AAVE_RESERVE_ADDRESSES}
    filtered = [addr for addr in chain_reserves if addr.lower() in known_addrs]

    if not filtered:
        return []

    # Batch all getReserveData calls into a single JSON-RPC batch
    calls = [
        (AAVE_V3_POOL, _SELECTOR_GET_RESERVE_DATA + addr[2:].lower().zfill(64))
        for addr in filtered
    ]

    try:
        raw_results = eth_call_batch(calls)
    except Exception as exc:
        logger.warning("Batch reserve fetch failed, falling back to sequential: %s", type(exc).__name__)
        raw_results = []
        for addr in filtered:
            try:
                raw = eth_call(AAVE_V3_POOL, _SELECTOR_GET_RESERVE_DATA + addr[2:].lower().zfill(64))
                raw_results.append(raw)
            except Exception:
                raw_results.append("0x")

    results = []
    for addr, raw in zip(filtered, raw_results):
        if raw and raw != "0x":
            parsed = _parse_reserve_data(raw)
            if parsed:
                symbol = get_symbol_for_address(addr)
                config = parsed.get("configuration", 0)
                results.append({
                    "address": addr,
                    "symbol": symbol,
                    "parsed": parsed,
                    "configuration": config,
                    "supply_rate": _ray_to_apr(parsed.get("current_liquidity_rate", 0)),
                    "borrow_rate": _ray_to_apr(parsed.get("current_variable_borrow_rate", 0)),
                    "collateral_enabled": bool((config >> 56) & 1),
                    "ltv_bits": config & 0xFFFF,
                    "lt_bits": (config >> 16) & 0xFFFF,
                    "borrowable": bool((config >> 57) & 1),
                })

    _reserve_data_cache[cache_key] = (now, results)
    return results


def get_earn_opportunities() -> list[EarnOpportunity]:
    """Get real Aave V3 supply opportunities on X Layer Mainnet."""
    reserves = _fetch_all_reserve_data()
    tvl_map = _get_tvl_map()
    now = datetime.now(timezone.utc).isoformat()

    opportunities: list[EarnOpportunity] = []
    for r in reserves:
        tvl = tvl_map.get(_normalize_symbol(r["symbol"]), 0)
        supply_rate = r["supply_rate"]

        opportunities.append(
            EarnOpportunity(
                asset=r["symbol"],
                symbol=r["symbol"],
                asset_address=r["address"],
                supply_apy=supply_rate if supply_rate > 0 else None,
                supply_apy_display=_format_pct(supply_rate) if supply_rate > 0 else None,
                total_supplied_usd=tvl if tvl else None,
                available_liquidity=f"${tvl:,.0f}" if tvl else None,
                available_liquidity_usd=tvl if tvl else None,
                utilization=None,
                collateral_enabled=r["collateral_enabled"],
                source="Aave V3 / X Layer Mainnet",
                chain_id=196,
                observed_at=now,
            )
        )

    return sorted(opportunities, key=lambda o: o.supply_apy or 0, reverse=True)


def get_borrow_opportunities() -> list[BorrowOpportunity]:
    """Get real Aave V3 borrow opportunities on X Layer Mainnet.

    Reuses the same reserve data as earn (shared _fetch_all_reserve_data).
    """
    reserves = _fetch_all_reserve_data()
    tvl_map = _get_tvl_map()
    now = datetime.now(timezone.utc).isoformat()

    opportunities: list[BorrowOpportunity] = []
    for r in reserves:
        tvl = tvl_map.get(_normalize_symbol(r["symbol"]), 0)
        borrow_rate = r["borrow_rate"]
        ltv = r["ltv_bits"] / 10000 if r["ltv_bits"] > 0 else None
        lt = r["lt_bits"] / 10000 if r["lt_bits"] > 0 else None

        opportunities.append(
            BorrowOpportunity(
                asset=r["symbol"],
                symbol=r["symbol"],
                asset_address=r["address"],
                borrow_apy=borrow_rate if borrow_rate > 0 else None,
                borrow_apy_display=_format_pct(borrow_rate) if borrow_rate > 0 else None,
                available_liquidity=f"${tvl:,.0f}" if tvl else None,
                available_liquidity_usd=tvl if tvl else None,
                ltv=ltv,
                liquidation_threshold=lt,
                borrowable=r["borrowable"] or (borrow_rate > 0),
                collateral_requirements=f"LTV: {ltv:.0%}, LT: {lt:.0%}" if ltv and lt else None,
                source="Aave V3 / X Layer Mainnet",
                chain_id=196,
                observed_at=now,
            )
        )

    return sorted(opportunities, key=lambda o: o.borrow_apy or 0, reverse=True)
