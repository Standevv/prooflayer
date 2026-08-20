"""Read-only JSON-RPC client for X Layer Mainnet (chain ID 196).

Uses httpx connection pooling for persistent TCP+TLS connections.
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

DEFAULT_XLAYER_MAINNET_RPC = "https://rpc.xlayer.tech"
XLAYER_MAINNET_CHAIN_ID = 196

_CALL_TIMEOUT = 15
_MAX_CACHE_ENTRIES = 128
_cache: dict[str, tuple[float, Any]] = {}
_CACHE_TTL = 30  # seconds

# Persistent httpx client with connection pooling
_client: httpx.Client | None = None


def _get_client() -> httpx.Client:
    """Return a shared httpx client with connection pooling."""
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.Client(
            timeout=httpx.Timeout(_CALL_TIMEOUT),
            limits=httpx.Limits(
                max_connections=8,
                max_keepalive_connections=4,
                keepalive_expiry=30,
            ),
        )
    return _client


def get_rpc_url() -> str:
    return os.getenv("XLAYER_MAINNET_RPC_URL", DEFAULT_XLAYER_MAINNET_RPC)


def _cache_get(key: str) -> Any | None:
    entry = _cache.get(key)
    if entry and (time.time() - entry[0]) < _CACHE_TTL:
        return entry[1]
    _cache.pop(key, None)
    return None


def _cache_set(key: str, value: Any) -> None:
    if len(_cache) >= _MAX_CACHE_ENTRIES:
        oldest = min(_cache, key=lambda k: _cache[k][0])
        _cache.pop(oldest)
    _cache[key] = (time.time(), value)


def raw_rpc(method: str, params: list[Any] | None = None, *, use_cache: bool = True) -> Any:
    """Make a read-only JSON-RPC call to X Layer Mainnet.

    Raises ``RpcError`` on transport or JSON-RPC level failures.
    """
    cache_key = f"{method}:{json.dumps(params or [], sort_keys=True)}"
    if use_cache:
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

    url = get_rpc_url()
    payload = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params or [],
        "id": 1,
    }
    try:
        client = _get_client()
        resp = client.post(url, json=payload, headers={"Content-Type": "application/json"})
        resp.raise_for_status()
        result = resp.json()
    except Exception as exc:
        raise RpcError(f"X Layer RPC transport error: {type(exc).__name__}") from exc

    if "error" in result:
        raise RpcError(f"X Layer RPC error: {result['error'].get('message', 'unknown')}")

    value = result.get("result")
    if use_cache:
        _cache_set(cache_key, value)
    return value


def eth_call(to: str, data: str, *, block: str = "latest") -> str:
    """Execute a read-only eth_call and return the hex result."""
    result = raw_rpc("eth_call", [{"to": to, "data": data, "accessList": []}, block])
    if result is None or not isinstance(result, str):
        raise RpcError("Empty eth_call result")
    return result


def eth_call_batch(calls: list[tuple[str, str]], *, block: str = "latest") -> list[str]:
    """Execute multiple eth_calls as a JSON-RPC batch for connection reuse.

    Each call is (to, data). Returns list of hex results in same order.
    Falls back to sequential calls on batch failure.
    """
    if not calls:
        return []

    url = get_rpc_url()
    batch_payload = [
        {
            "jsonrpc": "2.0",
            "method": "eth_call",
            "params": [{"to": to, "data": data, "accessList": []}, block],
            "id": i + 1,
        }
        for i, (to, data) in enumerate(calls)
    ]

    try:
        client = _get_client()
        resp = client.post(url, json=batch_payload, headers={"Content-Type": "application/json"})
        resp.raise_for_status()
        results = resp.json()
    except Exception:
        # Fallback to sequential on batch failure
        return [eth_call(to, data, block=block) for to, data in calls]

    # Sort by id to preserve order
    if isinstance(results, list):
        sorted_results = sorted(results, key=lambda r: r.get("id", 0))
        return [r.get("result", "0x") for r in sorted_results]

    # Single result fallback
    return [eth_call(to, data, block=block) for to, data in calls]


def get_code(address: str) -> str | None:
    result = raw_rpc("eth_getCode", [address, "latest"])
    if result == "0x" or not result:
        return None
    return result


def get_block_number() -> int:
    result = raw_rpc("eth_blockNumber")
    return int(result, 16)


def get_chain_id() -> int:
    result = raw_rpc("eth_chainId")
    return int(result, 16)


class RpcError(Exception):
    """Raised when an X Layer RPC call fails."""
