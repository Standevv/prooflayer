"""RWA.xyz adapter for USDY discovery and market-context evidence.

RWA.xyz provides tokenized asset discovery data. This adapter retrieves
available USDY metadata when an API key is configured. Without a key,
it returns NOT_CONFIGURED honestly.

RWA.xyz market capitalization alone is NOT proof of Treasury backing.
This adapter provides discovery and market-context evidence only.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any
from urllib.request import Request, urlopen

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
from services.rvc.models import EvidenceRecord


class RwaXyzAdapter(BaseEvidenceAdapter):
    """Adapter for RWA.xyz tokenized asset data."""

    BASE_URL = "https://app.rwa.xyz"

    def __init__(self, config: AdapterConfig) -> None:
        source = SourceDefinition(
            source_id="rwa-xyz",
            source_name="RWA.xyz Tokenized Asset Data",
            source_type=SourceType.MARKET_DATA,
            root_source_id="rwa-xyz",
            base_url=self.BASE_URL,
            authority_category="aggregator",
            supported_assets=("USDY",),
            supported_claims=("TreasuryBacking",),
            authentication_required=True,
            authentication_env_var="RWA_XYZ_API_KEY",
            retrieval_method="http_json",
            refresh_interval_seconds=3600,
            description="RWA.xyz discovery and market-context data.",
        )
        super().__init__(source, config)

    def collect(self) -> SourceAdapterResult:
        api_key = self.config.api_key or os.environ.get("RWA_XYZ_API_KEY", "")
        if not api_key or not api_key.strip():
            return self._error_result(
                SourceAvailabilityState.NOT_CONFIGURED,
                "RWA_XYZ_API_KEY is not configured. Set it in the environment to enable RWA.xyz data.",
            )

        try:
            return self._fetch_usdy_data(api_key)
        except Exception as error:
            return self._error_result(
                SourceAvailabilityState.OFFLINE,
                f"RWA.xyz retrieval failed: {type(error).__name__}: {error}",
            )

    def _fetch_usdy_data(self, api_key: str) -> SourceAdapterResult:
        url = f"{self.BASE_URL}/api/assets/USDY"
        request = Request(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/json",
                "User-Agent": "ProofLayer/1.0",
            },
        )
        try:
            with urlopen(request, timeout=self.config.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except Exception as error:
            return self._error_result(
                SourceAvailabilityState.OFFLINE,
                f"HTTP request failed: {error}",
            )

        if not isinstance(payload, dict):
            return self._error_result(
                SourceAvailabilityState.INVALID_RESPONSE,
                "RWA.xyz returned a non-object response",
            )

        now = utc_now()
        content_hash = content_hash_json(payload)
        records: list[EvidenceRecord] = []

        asset_name = payload.get("name") or payload.get("asset_name")
        if asset_name:
            records.append(self._make_record(
                "rwa_xyz_asset_name", "asset_name", str(asset_name), now, content_hash,
            ))

        issuer = payload.get("issuer") or payload.get("issuer_name")
        if issuer:
            records.append(self._make_record(
                "rwa_xyz_issuer", "issuer_name", str(issuer), now, content_hash,
            ))

        market_cap = payload.get("market_cap") or payload.get("total_value_locked")
        if market_cap is not None:
            try:
                records.append(self._make_record(
                    "rwa_xyz_market_cap", "market_cap", str(market_cap), now, content_hash,
                    unit="USD",
                ))
            except (TypeError, ValueError):
                pass

        network = payload.get("network") or payload.get("chain")
        if network:
            records.append(self._make_record(
                "rwa_xyz_network", "network", str(network), now, content_hash,
            ))

        contract_address = payload.get("contract_address") or payload.get("address")
        if contract_address:
            records.append(self._make_record(
                "rwa_xyz_contract_address", "contract_address", str(contract_address), now, content_hash,
            ))

        if not records:
            return self._error_result(
                SourceAvailabilityState.INVALID_RESPONSE,
                "RWA.xyz returned no usable fields",
            )

        source_timestamp = now
        return self._ok_result(
            records,
            EvidenceCollectionMode.LIVE,
            content_hash=content_hash,
            source_timestamp=source_timestamp,
            metadata={"rwa_xyz_raw_keys": list(payload.keys())},
        )

    def _make_record(
        self,
        source_id: str,
        field: str,
        value: str,
        observed_at: datetime,
        content_hash: str,
        unit: str | None = None,
    ) -> EvidenceRecord:
        return EvidenceRecord(
            source_id=f"rwa-xyz-{source_id}",
            source_type="aggregator",
            root_source_id="rwa-xyz",
            asset="USDY",
            field=field,
            value=value,
            unit=unit,
            observed_at=observed_at,
            retrieved_at=observed_at,
            content_hash=content_hash,
            evidence_tier="C",
            simulation=False,
            metadata={
                "root_source_id": "rwa-xyz",
                "retrieved_at": observed_at,
                "content_hash": content_hash,
                "evidence_tier": "C",
                "cache_status": "live_rwa_xyz",
                "source_url": f"{self.BASE_URL}/api/assets/USDY",
                "discovery_only": True,
            },
        )


__all__ = ["RwaXyzAdapter"]
