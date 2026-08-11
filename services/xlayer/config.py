"""Fixed deployment metadata and bounded read settings for X Layer Testnet."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEPLOYMENT_PATH = PROJECT_ROOT / "data" / "xlayer-testnet.json"


def _load_deployment() -> dict[str, object]:
    try:
        value = json.loads(DEPLOYMENT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError("X Layer deployment configuration is unavailable") from error
    if not isinstance(value, dict):
        raise RuntimeError("X Layer deployment configuration must be an object")
    return value


def _mapping(value: object, name: str) -> dict[str, object]:
    if not isinstance(value, dict):
        raise RuntimeError(f"X Layer deployment {name} must be an object")
    return value


def _text(value: object, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise RuntimeError(f"X Layer deployment {name} must be a non-empty string")
    return value.strip()


def _integer(value: object, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise RuntimeError(f"X Layer deployment {name} must be a non-negative integer")
    return value


DEPLOYMENT = _load_deployment()
CONTRACTS = _mapping(DEPLOYMENT.get("contracts"), "contracts")
START_BLOCKS = _mapping(
    DEPLOYMENT.get("deployment_start_blocks"), "deployment_start_blocks"
)
XLAYER_NETWORK = _text(DEPLOYMENT.get("network"), "network")
XLAYER_CHAIN_ID = _integer(DEPLOYMENT.get("chain_id"), "chain_id")
DEFAULT_XLAYER_RPC_URL = _text(DEPLOYMENT.get("rpc_url"), "rpc_url")
XLAYER_EXPLORER_URL = _text(DEPLOYMENT.get("explorer_url"), "explorer_url")
REGISTRY_ADDRESS = _text(CONTRACTS.get("registry"), "contracts.registry")
DECISION_LOG_ADDRESS = _text(CONTRACTS.get("decision_log"), "contracts.decision_log")
POLICY_GATE_ADDRESS = _text(CONTRACTS.get("policy_gate"), "contracts.policy_gate")
REGISTRY_DEPLOYMENT_BLOCK = _integer(
    START_BLOCKS.get("registry"), "deployment_start_blocks.registry"
)
DECISION_LOG_DEPLOYMENT_BLOCK = _integer(
    START_BLOCKS.get("decision_log"), "deployment_start_blocks.decision_log"
)
POLICY_GATE_DEPLOYMENT_BLOCK = _integer(
    START_BLOCKS.get("policy_gate"), "deployment_start_blocks.policy_gate"
)


def _env_int(name: str, default: int, *, minimum: int, maximum: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if minimum <= value <= maximum else default


def _env_float(name: str, default: float, *, minimum: float, maximum: float) -> float:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    return value if minimum <= value <= maximum else default


@dataclass(frozen=True)
class ChainReadSettings:
    rpc_timeout_seconds: float
    event_lookup_timeout_seconds: float
    cache_ttl_seconds: int
    cache_max_entries: int
    event_max_scan_blocks: int
    event_chunk_size: int
    event_batch_size: int

    @classmethod
    def from_env(cls) -> "ChainReadSettings":
        chunk_size = _env_int(
            "PROOFLAYER_EVENT_QUERY_CHUNK_SIZE", 2_000, minimum=100, maximum=10_000
        )
        return cls(
            rpc_timeout_seconds=_env_float(
                "PROOFLAYER_RPC_TIMEOUT_SECONDS", 8.0, minimum=1.0, maximum=15.0
            ),
            event_lookup_timeout_seconds=_env_float(
                "PROOFLAYER_EVENT_LOOKUP_TIMEOUT_SECONDS",
                12.0,
                minimum=1.0,
                maximum=20.0,
            ),
            cache_ttl_seconds=_env_int(
                "PROOFLAYER_CHAIN_CACHE_TTL_SECONDS", 30, minimum=15, maximum=60
            ),
            cache_max_entries=_env_int(
                "PROOFLAYER_CHAIN_CACHE_MAX_ENTRIES", 128, minimum=16, maximum=1_024
            ),
            event_max_scan_blocks=_env_int(
                "PROOFLAYER_EVENT_MAX_SCAN_BLOCKS", 20_000, minimum=1_000, maximum=100_000
            ),
            event_chunk_size=chunk_size,
            event_batch_size=_env_int(
                "PROOFLAYER_EVENT_QUERY_BATCH_SIZE", 5, minimum=1, maximum=20
            ),
        )


__all__ = [
    "ChainReadSettings",
    "DECISION_LOG_ADDRESS",
    "DECISION_LOG_DEPLOYMENT_BLOCK",
    "DEFAULT_XLAYER_RPC_URL",
    "POLICY_GATE_ADDRESS",
    "POLICY_GATE_DEPLOYMENT_BLOCK",
    "REGISTRY_ADDRESS",
    "REGISTRY_DEPLOYMENT_BLOCK",
    "XLAYER_CHAIN_ID",
    "XLAYER_EXPLORER_URL",
    "XLAYER_NETWORK",
]
