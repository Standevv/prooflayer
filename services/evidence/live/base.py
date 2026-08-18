"""Base adapter interface for live evidence retrieval.

Every adapter must implement the collect() method, which returns a
SourceAdapterResult containing evidence records, availability state, and
provenance metadata. Adapters must never fabricate data.
"""

from __future__ import annotations

import hashlib
import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from services.evidence.live import (
    EvidenceCollectionMode,
    SourceAvailabilityState,
    SourceDefinition,
)
from services.rvc.models import EvidenceRecord


@dataclass(frozen=True)
class AdapterConfig:
    """Configuration passed to an adapter at initialization."""
    rpc_url: str | None = None
    api_key: str | None = None
    timeout_seconds: float = 15.0
    block_number: int | None = None
    retrieved_at: datetime | None = None
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class AdapterDiagnostics:
    """Per-adapter diagnostics for transparency."""
    source_id: str
    availability: SourceAvailabilityState
    collection_mode: EvidenceCollectionMode
    retrieved_at: datetime | None = None
    source_timestamp: datetime | None = None
    content_hash: str | None = None
    error: str | None = None
    record_count: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class SourceAdapterResult:
    """Result from a single evidence source adapter."""
    source_id: str
    availability: SourceAvailabilityState
    collection_mode: EvidenceCollectionMode
    evidence_records: list[EvidenceRecord]
    diagnostics: AdapterDiagnostics
    error: str | None = None


def content_hash_bytes(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def content_hash_json(obj: Any) -> str:
    payload = json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)
    return content_hash_bytes(payload.encode("utf-8"))


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class BaseEvidenceAdapter(ABC):
    """Abstract base for all evidence source adapters."""

    def __init__(self, source: SourceDefinition, config: AdapterConfig) -> None:
        self.source = source
        self.config = config

    @property
    def source_id(self) -> str:
        return self.source.source_id

    @abstractmethod
    def collect(self) -> SourceAdapterResult:
        """Retrieve evidence from this source.

        Must return a SourceAdapterResult. Never raise unhandled exceptions;
        instead return an OFFLINE or INVALID_RESPONSE state with the error.
        """

    def _make_diagnostics(
        self,
        availability: SourceAvailabilityState,
        collection_mode: EvidenceCollectionMode,
        *,
        record_count: int = 0,
        content_hash: str | None = None,
        source_timestamp: datetime | None = None,
        error: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AdapterDiagnostics:
        return AdapterDiagnostics(
            source_id=self.source_id,
            availability=availability,
            collection_mode=collection_mode,
            retrieved_at=utc_now(),
            source_timestamp=source_timestamp,
            content_hash=content_hash,
            error=error,
            record_count=record_count,
            metadata=metadata or {},
        )

    def _ok_result(
        self,
        records: list[EvidenceRecord],
        collection_mode: EvidenceCollectionMode,
        *,
        content_hash: str | None = None,
        source_timestamp: datetime | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> SourceAdapterResult:
        diagnostics = self._make_diagnostics(
            SourceAvailabilityState.AVAILABLE,
            collection_mode,
            record_count=len(records),
            content_hash=content_hash,
            source_timestamp=source_timestamp,
            metadata=metadata,
        )
        return SourceAdapterResult(
            source_id=self.source_id,
            availability=SourceAvailabilityState.AVAILABLE,
            collection_mode=collection_mode,
            evidence_records=records,
            diagnostics=diagnostics,
        )

    def _error_result(
        self,
        availability: SourceAvailabilityState,
        error: str,
        *,
        collection_mode: EvidenceCollectionMode = EvidenceCollectionMode.FIXTURE,
    ) -> SourceAdapterResult:
        diagnostics = self._make_diagnostics(
            availability,
            collection_mode,
            error=error,
        )
        return SourceAdapterResult(
            source_id=self.source_id,
            availability=availability,
            collection_mode=collection_mode,
            evidence_records=[],
            diagnostics=diagnostics,
            error=error,
        )


__all__ = [
    "AdapterConfig",
    "AdapterDiagnostics",
    "BaseEvidenceAdapter",
    "SourceAdapterResult",
    "content_hash_bytes",
    "content_hash_json",
    "utc_now",
]
