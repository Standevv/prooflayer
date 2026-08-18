"""Read-only JSON-RPC client for X Layer Mainnet (chain ID 196)."""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.request
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_XLAYER_MAINNET_RPC = "https://rpc.xlayer.tech"
XLAYER_MAINNET_CHAIN_ID = 196

_CALL_TIMEOUT = 15
_MAX_CACHE_ENTRIES = 64
_cache: dict[str, tuple[float, Any]] = {}
_CACHE_TTL = 30  # seconds


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
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        resp = urllib.request.urlopen(req, timeout=_CALL_TIMEOUT)
        result = json.loads(resp.read())
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
