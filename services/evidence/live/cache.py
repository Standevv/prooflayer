"""Evidence cache for live retrievals.

Caches successful adapter results with retrieval metadata for reproducibility.
Never overwrites historical evidence silently.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from services.evidence.live.base import AdapterDiagnostics, SourceAdapterResult


@dataclass
class CachedEvidenceEntry:
    source_id: str
    collection_mode: str
    retrieved_at: str
    source_timestamp: str | None
    content_hash: str | None
    adapter_version: str
    request_params: dict[str, Any]
    record_count: int
    diagnostics: dict[str, Any]
    evidence_records_json: str


class EvidenceCache:
    """Append-only JSONL cache of evidence retrievals."""

    def __init__(self, cache_dir: Path | str, *, adapter_version: str = "1.0.0") -> None:
        self.cache_dir = Path(cache_dir)
        self.adapter_version = adapter_version
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _cache_path(self, source_id: str) -> Path:
        safe_id = source_id.replace("/", "-").replace("\\", "-")
        return self.cache_dir / f"{safe_id}.jsonl"

    def store(self, result: SourceAdapterResult, *, request_params: dict[str, Any] | None = None) -> None:
        if not result.evidence_records:
            return

        entry = CachedEvidenceEntry(
            source_id=result.source_id,
            collection_mode=result.collection_mode.value,
            retrieved_at=result.diagnostics.retrieved_at.isoformat() if result.diagnostics.retrieved_at else "",
            source_timestamp=result.diagnostics.source_timestamp.isoformat() if result.diagnostics.source_timestamp else None,
            content_hash=result.diagnostics.content_hash,
            adapter_version=self.adapter_version,
            request_params=request_params or {},
            record_count=result.diagnostics.record_count,
            diagnostics=self._serialize_diagnostics(result.diagnostics),
            evidence_records_json=json.dumps(
                [self._serialize_record(r) for r in result.evidence_records],
                default=str,
            ),
        )
        path = self._cache_path(result.source_id)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(self._serialize_entry(entry), default=str) + "\n")

    def get_latest(self, source_id: str) -> CachedEvidenceEntry | None:
        path = self._cache_path(source_id)
        if not path.exists():
            return None
        last_entry = None
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        last_entry = CachedEvidenceEntry(**json.loads(line))
                    except (json.JSONDecodeError, TypeError):
                        continue
        return last_entry

    def get_entries(self, source_id: str, *, limit: int = 10) -> list[CachedEvidenceEntry]:
        path = self._cache_path(source_id)
        if not path.exists():
            return []
        entries: list[CachedEvidenceEntry] = []
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        entries.append(CachedEvidenceEntry(**json.loads(line)))
                    except (json.JSONDecodeError, TypeError):
                        continue
        return entries[-limit:]

    @staticmethod
    def _serialize_record(record: Any) -> dict[str, Any]:
        return {
            "source_id": record.source_id,
            "source_type": record.source_type,
            "root_source_id": record.root_source_id,
            "asset": record.asset,
            "field": record.field,
            "value": str(record.value) if record.value is not None else None,
            "unit": record.unit,
            "observed_at": record.observed_at.isoformat() if hasattr(record.observed_at, "isoformat") else str(record.observed_at),
            "retrieved_at": record.retrieved_at.isoformat() if record.retrieved_at and hasattr(record.retrieved_at, "isoformat") else str(record.retrieved_at) if record.retrieved_at else None,
            "content_hash": record.content_hash,
            "evidence_tier": record.evidence_tier,
            "simulation": record.simulation,
        }

    @staticmethod
    def _serialize_diagnostics(diag: AdapterDiagnostics) -> dict[str, Any]:
        return {
            "source_id": diag.source_id,
            "availability": diag.availability.value,
            "collection_mode": diag.collection_mode.value,
            "retrieved_at": diag.retrieved_at.isoformat() if diag.retrieved_at else None,
            "source_timestamp": diag.source_timestamp.isoformat() if diag.source_timestamp else None,
            "content_hash": diag.content_hash,
            "error": diag.error,
            "record_count": diag.record_count,
            "metadata": diag.metadata,
        }

    @staticmethod
    def _serialize_entry(entry: CachedEvidenceEntry) -> dict[str, Any]:
        return {
            "source_id": entry.source_id,
            "collection_mode": entry.collection_mode,
            "retrieved_at": entry.retrieved_at,
            "source_timestamp": entry.source_timestamp,
            "content_hash": entry.content_hash,
            "adapter_version": entry.adapter_version,
            "request_params": entry.request_params,
            "record_count": entry.record_count,
            "diagnostics": entry.diagnostics,
            "evidence_records_json": entry.evidence_records_json,
        }


__all__ = ["CachedEvidenceEntry", "EvidenceCache"]
