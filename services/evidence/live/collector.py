"""Evidence collection orchestrator for USDY TreasuryBacking V1.

Runs all configured adapters, composes the final evidence set,
and provides a single collect_usdy_evidence() entry point.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from services.evidence.live import (
    EvidenceCollectionMode,
    SourceAvailabilityState,
    get_source_availability,
)
from services.evidence.live.attestation import AttestationRetrievalAdapter
from services.evidence.live.base import AdapterConfig, SourceAdapterResult, utc_now
from services.evidence.live.cache import EvidenceCache
from services.evidence.live.chainlink import ChainlinkAdapter
from services.evidence.live.issuer import IssuerEvidenceAdapter
from services.evidence.live.ondo_live import OndoLiveAdapter
from services.evidence.live.rwa_xyz import RwaXyzAdapter
from services.rvc.models import EvidenceRecord


@dataclass
class EvidenceCollectionReport:
    """Full report of an evidence collection run."""
    collected_at: str
    total_records: int
    adapter_results: list[SourceAdapterResult]
    availability_summary: dict[str, str]
    collection_mode_summary: dict[str, str]
    independent_sources: list[str]
    source_modes: dict[str, EvidenceCollectionMode]
    errors: list[str]


@dataclass
class LiveEvidenceConfig:
    """Configuration for live evidence collection."""
    ethereum_rpc_url: str | None = None
    rwa_xyz_api_key: str | None = None
    attestation_snapshot_path: Path | str | None = None
    block_number: int | None = None
    timeout_seconds: float = 15.0
    cache_dir: Path | str | None = None
    enable_rwa_xyz: bool = True
    enable_chainlink: bool = True
    enable_ondo_live: bool = True
    enable_issuer: bool = True
    enable_attestation: bool = True


def collect_usdy_evidence(
    config: LiveEvidenceConfig | None = None,
) -> tuple[list[EvidenceRecord], EvidenceCollectionReport]:
    """Collect all available USDY evidence from configured adapters.

    Returns:
        Tuple of (evidence_records, collection_report)
    """
    if config is None:
        config = _default_config()

    adapter_config = AdapterConfig(
        rpc_url=config.ethereum_rpc_url,
        api_key=config.rwa_xyz_api_key,
        timeout_seconds=config.timeout_seconds,
        block_number=config.block_number,
    )

    adapters = []
    if config.enable_ondo_live:
        adapters.append(OndoLiveAdapter(adapter_config))
    if config.enable_issuer:
        adapters.append(IssuerEvidenceAdapter(adapter_config))
    if config.enable_attestation:
        adapters.append(AttestationRetrievalAdapter(
            adapter_config,
            snapshot_path=config.attestation_snapshot_path,
        ))
    if config.enable_rwa_xyz:
        adapters.append(RwaXyzAdapter(adapter_config))
    if config.enable_chainlink:
        adapters.append(ChainlinkAdapter(adapter_config))

    results: list[SourceAdapterResult] = []
    all_records: list[EvidenceRecord] = []
    errors: list[str] = []

    for adapter in adapters:
        try:
            result = adapter.collect()
            results.append(result)
            all_records.extend(result.evidence_records)
            if result.error:
                errors.append(f"{adapter.source_id}: {result.error}")
        except Exception as error:
            errors.append(f"{adapter.source_id}: UNHANDLED {type(error).__name__}: {error}")

    # Cache successful results
    if config.cache_dir:
        cache = EvidenceCache(config.cache_dir)
        for result in results:
            if result.evidence_records:
                try:
                    cache.store(result)
                except Exception:
                    pass  # cache failures are non-fatal

    availability_summary = {}
    collection_mode_summary = {}
    source_modes: dict[str, EvidenceCollectionMode] = {}
    independent_roots: list[str] = []

    for result in results:
        availability_summary[result.source_id] = result.availability.value
        collection_mode_summary[result.source_id] = result.collection_mode.value
        source_modes[result.source_id] = result.collection_mode
        if result.availability == SourceAvailabilityState.AVAILABLE and result.evidence_records:
            root = result.evidence_records[0].root_source_id
            if root not in independent_roots:
                independent_roots.append(root)

    report = EvidenceCollectionReport(
        collected_at=utc_now().isoformat(),
        total_records=len(all_records),
        adapter_results=results,
        availability_summary=availability_summary,
        collection_mode_summary=collection_mode_summary,
        independent_sources=independent_roots,
        source_modes=source_modes,
        errors=errors,
    )

    return all_records, report


def _default_config() -> LiveEvidenceConfig:
    return LiveEvidenceConfig(
        ethereum_rpc_url=os.environ.get("ETHEREUM_MAINNET_RPC_URL"),
        rwa_xyz_api_key=os.environ.get("RWA_XYZ_API_KEY"),
        attestation_snapshot_path=_default_attestation_path(),
        cache_dir=_default_cache_dir(),
    )


def _default_attestation_path() -> Path | None:
    from services.evidence.usdy_attestation import DEFAULT_USDY_ATTESTATION_SNAPSHOT
    path = Path(DEFAULT_USDY_ATTESTATION_SNAPSHOT)
    return path if path.exists() else None


def _default_cache_dir() -> Path:
    from pathlib import Path
    project_root = Path(__file__).resolve().parents[3]
    return project_root / "data" / "evidence_cache"


__all__ = [
    "EvidenceCollectionReport",
    "LiveEvidenceConfig",
    "collect_usdy_evidence",
]
