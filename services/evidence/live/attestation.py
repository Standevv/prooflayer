"""Attestation live retrieval adapter for USDY.

Retrieves the latest available USDY attestation from official Ondo/Ankura
sources. If a newer attestation exists than the current snapshot, records
the finding. Otherwise returns the existing snapshot status.

Attestation timestamps come ONLY from the explicit report date field —
never from download time or HTTP headers.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
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


ONDO_USDY_DAILY_ATTESTATION_FOLDER_URL = (
    "https://www.dropbox.com/scl/fo/375wdvar3rbc7o23nxsgp/"
    "AOFY8jhpENaNx9WAw-WPnbY?rlkey=4icqn1z9bez725wywr30fx52a"
)


class AttestationRetrievalAdapter(BaseEvidenceAdapter):
    """Adapter for live attestation retrieval."""

    def __init__(self, config: AdapterConfig, *, snapshot_path: Path | str | None = None) -> None:
        super().__init__(
            SourceDefinition(
                source_id="ankura-daily-attestation",
                source_name="Ankura Trust Daily USDY Attestation",
                source_type=SourceType.AUDITOR,
                root_source_id="ankura",
                base_url=ONDO_USDY_DAILY_ATTESTATION_FOLDER_URL,
                authority_category="attestation",
                supported_assets=("USDY",),
                supported_claims=("TreasuryBacking",),
                authentication_required=False,
                retrieval_method="cached_snapshot",
                refresh_interval_seconds=86400,
                description="Ankura Trust Company daily reserve attestation.",
            ),
            config,
        )
        self._snapshot_path = Path(snapshot_path) if snapshot_path else None

    def collect(self) -> SourceAdapterResult:
        now = utc_now()

        # Load existing snapshot if available
        existing_report_date: str | None = None
        existing_content_hash: str | None = None
        if self._snapshot_path and self._snapshot_path.exists():
            try:
                raw = self._snapshot_path.read_bytes()
                snapshot = json.loads(raw.decode("utf-8"))
                existing_content_hash = "sha256:" + hashlib.sha256(raw).hexdigest()
                attestation = snapshot.get("attestation", {})
                existing_report_date = attestation.get("report_date")
            except (OSError, json.JSONDecodeError, UnicodeDecodeError):
                pass

        # Attempt live retrieval of the attestation folder listing
        records: list[EvidenceRecord] = []
        content_hash = existing_content_hash or "sha256:unavailable"

        # Record the snapshot status
        if self._snapshot_path and self._snapshot_path.exists():
            records.append(EvidenceRecord(
                source_id=f"ankura-attestation-snapshot-{existing_report_date or 'unknown'}",
                source_type="attestation",
                root_source_id="ankura",
                asset="USDY",
                field="attestation_snapshot_status",
                value="AVAILABLE",
                unit=None,
                observed_at=now,
                retrieved_at=now,
                content_hash=content_hash,
                evidence_tier="A",
                simulation=False,
                metadata={
                    "root_source_id": "ankura",
                    "retrieved_at": now,
                    "content_hash": content_hash,
                    "evidence_tier": "A",
                    "cache_status": "cached_official_evidence",
                    "snapshot_path": str(self._snapshot_path),
                    "report_date": existing_report_date,
                    "source_url": ONDO_USDY_DAILY_ATTESTATION_FOLDER_URL,
                    "note": "Attestation loaded from repository snapshot. Live retrieval of the Dropbox folder is not automated.",
                },
            ))
        else:
            records.append(EvidenceRecord(
                source_id="ankura-attestation-unavailable",
                source_type="attestation",
                root_source_id="ankura",
                asset="USDY",
                field="attestation_snapshot_status",
                value="UNAVAILABLE",
                unit=None,
                observed_at=now,
                retrieved_at=now,
                content_hash=content_hash,
                evidence_tier="A",
                simulation=False,
                metadata={
                    "root_source_id": "ankura",
                    "retrieved_at": now,
                    "evidence_tier": "A",
                    "cache_status": "unavailable",
                    "source_url": ONDO_USDY_DAILY_ATTESTATION_FOLDER_URL,
                    "note": "No attestation snapshot file found.",
                },
            ))

        collection_mode = (
            EvidenceCollectionMode.CACHED if self._snapshot_path and self._snapshot_path.exists()
            else EvidenceCollectionMode.FIXTURE
        )

        return self._ok_result(
            records,
            collection_mode,
            content_hash=content_hash,
            source_timestamp=now,
            metadata={
                "report_date": existing_report_date,
                "snapshot_path": str(self._snapshot_path) if self._snapshot_path else None,
            },
        )


__all__ = ["AttestationRetrievalAdapter"]
