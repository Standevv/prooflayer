"""Official issuer evidence adapter for USDY.

Retrieves official Ondo sources for contract addresses, product identity,
issuer statements, and backing descriptions. Records canonical URLs,
publisher, publication dates, and content hashes for provenance.
"""

from __future__ import annotations

import hashlib
import json
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
    content_hash_bytes,
    content_hash_json,
    utc_now,
)
from services.rvc.models import EvidenceRecord

ONDO_ADDRESSES_URL = "https://docs.ondo.finance/addresses.md"
ONDO_USDY_BASICS_URL = "https://docs.ondo.finance/general-access-products/usdy/basics"
ONDO_USDY_PRODUCT_URL = "https://ondo.finance/usdy"
ETHEREUM_USDY_ADDRESS = "0x96F6eF951840721AdBF46Ac996b59E0235CB985C"


class IssuerEvidenceAdapter(BaseEvidenceAdapter):
    """Adapter for official Ondo issuer evidence."""

    def __init__(self, config: AdapterConfig) -> None:
        source = SourceDefinition(
            source_id="ondo-addresses",
            source_name="Ondo Official Contract Addresses",
            source_type=SourceType.ISSUER,
            root_source_id="ondo",
            base_url=ONDO_ADDRESSES_URL,
            authority_category="issuer",
            supported_assets=("USDY",),
            supported_claims=("TreasuryBacking",),
            authentication_required=False,
            retrieval_method="http_markdown",
            refresh_interval_seconds=86400,
            description="Official Ondo contract address listing.",
        )
        super().__init__(source, config)

    def collect(self) -> SourceAdapterResult:
        try:
            return self._fetch_addresses()
        except Exception as error:
            return self._error_result(
                SourceAvailabilityState.OFFLINE,
                f"Ondo issuer evidence retrieval failed: {type(error).__name__}: {error}",
            )

    def _fetch_addresses(self) -> SourceAdapterResult:
        request = Request(
            ONDO_ADDRESSES_URL,
            headers={"Accept": "text/markdown", "User-Agent": "ProofLayer/1.0"},
        )
        now = utc_now()
        try:
            with urlopen(request, timeout=self.config.timeout_seconds) as response:
                raw_content = response.read()
                content_text = raw_content.decode("utf-8")
        except Exception as error:
            return self._error_result(
                SourceAvailabilityState.OFFLINE,
                f"HTTP request to Ondo addresses failed: {error}",
            )

        content_hash = content_hash_bytes(raw_content)
        records: list[EvidenceRecord] = []

        address = self._parse_usdy_address(content_text)
        if address:
            records.append(EvidenceRecord(
                source_id="ondo-addresses-ethereum-usdy",
                source_type="issuer",
                root_source_id="ondo",
                asset="USDY",
                field="official_contract_address",
                value=address,
                unit=None,
                observed_at=now,
                retrieved_at=now,
                content_hash=content_hash,
                evidence_tier="B",
                simulation=False,
                metadata={
                    "root_source_id": "ondo",
                    "retrieved_at": now,
                    "content_hash": content_hash,
                    "evidence_tier": "B",
                    "source_url": ONDO_ADDRESSES_URL,
                    "cache_status": "live_official_evidence",
                    "content_type": "text/markdown",
                    "publisher": "Ondo Finance",
                },
            ))

        if not records:
            return self._error_result(
                SourceAvailabilityState.INVALID_RESPONSE,
                "Ondo addresses page returned no usable USDY data",
            )

        return self._ok_result(
            records,
            EvidenceCollectionMode.LIVE,
            content_hash=content_hash,
            source_timestamp=now,
            metadata={"source_url": ONDO_ADDRESSES_URL, "publisher": "Ondo Finance"},
        )

    @staticmethod
    def _parse_usdy_address(content: str) -> str | None:
        import re
        usdy_section = content.find("## USDY")
        if usdy_section < 0:
            return None
        ethereum_section = content.find("### Ethereum", usdy_section)
        if ethereum_section < 0:
            return None
        next_subsection = content.find("\n### ", ethereum_section + len("### Ethereum"))
        section_end = next_subsection if next_subsection >= 0 else len(content)
        ethereum_usdy_section = content[ethereum_section:section_end]
        match = re.search(
            r"(?m)^\|\s*USDY\s*\|\s*(?:\[\s*)?`?(0x[a-fA-F0-9]{40})(?![0-9a-fA-F])",
            ethereum_usdy_section,
        )
        if match:
            return match.group(1)
        return None


__all__ = ["IssuerEvidenceAdapter"]
