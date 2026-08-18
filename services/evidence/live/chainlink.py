"""Chainlink adapter for USDY price and proof-of-reserve feeds.

Investigates official Chainlink feeds relevant to USDY or tokenized US
Treasuries. If no relevant feed exists, returns UNSUPPORTED honestly.

Chainlink price evidence must NOT be misrepresented as backing evidence.
This adapter provides supplementary pricing/oracle context only.
"""

from __future__ import annotations

import json
import os
from collections.abc import Callable
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from services.evidence.live import (
    EvidenceCollectionMode,
    SourceAvailabilityState,
    SourceDefinition,
    SourceType,
)
from services.evidence.live.base import (
    AdapterConfig,
    BaseEvidenceAdapter,
    SourceAdapterResult,
    content_hash_json,
    utc_now,
)
from services.evidence.evm import EvmJsonRpcClient, EvmRpcError
from services.rvc.models import EvidenceRecord


# Known Chainlink AggregatorProxy addresses for USDY feeds (if any exist).
# These must be confirmed from official Chainlink documentation before use.
# Placeholder: no known USDY feed exists on Ethereum mainnet as of 2026-08.
_KNOWN_USDY_FEEDS: dict[str, dict[str, Any]] = {}


class ChainlinkAdapter(BaseEvidenceAdapter):
    """Adapter for Chainlink oracle feeds."""

    def __init__(self, config: AdapterConfig) -> None:
        source = SourceDefinition(
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
            description="Chainlink price feed for USDY.",
        )
        super().__init__(source, config)

    def collect(self) -> SourceAdapterResult:
        if not self.config.rpc_url:
            return self._error_result(
                SourceAvailabilityState.NOT_CONFIGURED,
                "No Ethereum RPC URL configured for Chainlink feed reads.",
            )

        feed_info = _KNOWN_USDY_FEEDS.get("ethereum")
        if feed_info is None:
            return self._error_result(
                SourceAvailabilityState.UNSUPPORTED,
                "No known Chainlink price feed exists for USDY on Ethereum mainnet. "
                "Chainlink Proof of Reserve for tokenized US Treasuries is not yet available for USDY.",
            )

        try:
            return self._read_feed(feed_info)
        except EvmRpcError as error:
            return self._error_result(
                SourceAvailabilityState.OFFLINE,
                f"Chainlink RPC error: {error}",
            )
        except Exception as error:
            return self._error_result(
                SourceAvailabilityState.OFFLINE,
                f"Chainlink retrieval failed: {type(error).__name__}: {error}",
            )

    def _read_feed(self, feed_info: dict[str, Any]) -> SourceAdapterResult:
        rpc_url = self.config.rpc_url
        if not rpc_url:
            return self._error_result(
                SourceAvailabilityState.NOT_CONFIGURED,
                "Ethereum RPC URL required for Chainlink reads.",
            )

        client = EvmJsonRpcClient(rpc_url, timeout=self.config.timeout_seconds)
        feed_address = feed_info["address"]

        latest_round_selector = "0xfeaf968c"
        try:
            raw_result = client.eth_call(feed_address, latest_round_selector)
        except Exception as error:
            return self._error_result(
                SourceAvailabilityState.OFFLINE,
                f"Failed to read Chainlink round: {error}",
            )

        now = utc_now()
        content_hash = content_hash_json({"feed": feed_address, "result": raw_result})
        records: list[EvidenceRecord] = []

        try:
            words = [raw_result[2 + i * 64 : 2 + (i + 1) * 64] for i in range(8)]
            round_id = int(words[0], 16)
            answer = int(words[1], 16)
            started_at = int(words[2], 16)
            updated_at = int(words[3], 16)
            answered_in_round = int(words[4], 16)
            decimals = feed_info.get("decimals", 8)
            price = Decimal(answer) / Decimal(10 ** decimals)

            records.append(EvidenceRecord(
                source_id=f"chainlink-{feed_address.lower()}-price",
                source_type="oracle",
                root_source_id="chainlink",
                asset="USDY",
                field="chainlink_price",
                value=price,
                unit="USD",
                observed_at=datetime.fromtimestamp(updated_at, tz=timezone.utc) if updated_at > 0 else now,
                retrieved_at=now,
                content_hash=content_hash,
                evidence_tier="A",
                simulation=False,
                metadata={
                    "root_source_id": "chainlink",
                    "retrieved_at": now,
                    "content_hash": content_hash,
                    "evidence_tier": "A",
                    "chain_id": feed_info.get("chain_id", 1),
                    "feed_address": feed_address,
                    "round_id": round_id,
                    "decimals": decimals,
                    "raw_answer": str(answer),
                    "started_at": started_at,
                    "updated_at": updated_at,
                    "answered_in_round": answered_in_round,
                    "cache_status": "live_chainlink",
                },
            ))
        except (IndexError, ValueError) as error:
            return self._error_result(
                SourceAvailabilityState.INVALID_RESPONSE,
                f"Chainlink feed response could not be decoded: {error}",
            )

        return self._ok_result(
            records,
            EvidenceCollectionMode.LIVE,
            content_hash=content_hash,
            source_timestamp=now,
            metadata={"feed_address": feed_address, "chain_id": feed_info.get("chain_id", 1)},
        )


__all__ = ["ChainlinkAdapter"]
