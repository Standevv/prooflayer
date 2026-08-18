"""Monitoring hook for live evidence refresh.

Provides a safe read-only refresh command that:
1. Retrieves current evidence
2. Normalizes it
3. Runs provenance
4. Executes RVC
5. Compares with the previous result
6. Reports whether the decision changed

Does not issue certificates or write to X Layer automatically.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from services.evidence.live.collector import (
    EvidenceCollectionReport,
    LiveEvidenceConfig,
    collect_usdy_evidence,
)
from services.evidence.live.base import utc_now
from services.provenance.engine import analyze_provenance
from services.rvc.models import EvidenceRecord
from services.rvc.treasury_backing import verify_treasury_backing


@dataclass
class RefreshResult:
    """Result of an evidence refresh run."""
    collected_at: str
    total_records: int
    verification_result: str
    reason_codes: list[str]
    independent_root_count: int
    evidence_root: str
    previous_result: str | None
    decision_changed: bool
    adapter_availability: dict[str, str]
    errors: list[str]
    collection_report: EvidenceCollectionReport


def run_evidence_refresh(
    config: LiveEvidenceConfig | None = None,
    previous_result: str | None = None,
) -> RefreshResult:
    """Run a full evidence refresh cycle.

    Args:
        config: Live evidence collection configuration.
        previous_result: The previous verification result to compare against.

    Returns:
        RefreshResult with the current state and whether the decision changed.
    """
    evidence_records, collection_report = collect_usdy_evidence(config)

    # Run provenance analysis
    provenance = analyze_provenance(evidence_records)

    # Run deterministic RVC
    certificate = verify_treasury_backing("USDY", evidence_records)

    current_result = certificate.result.value
    decision_changed = (
        previous_result is not None and current_result != previous_result
    )

    return RefreshResult(
        collected_at=utc_now().isoformat(),
        total_records=len(evidence_records),
        verification_result=current_result,
        reason_codes=list(certificate.reason_codes),
        independent_root_count=certificate.independent_root_count,
        evidence_root=certificate.evidence_root,
        previous_result=previous_result,
        decision_changed=decision_changed,
        adapter_availability=collection_report.availability_summary,
        errors=collection_report.errors,
        collection_report=collection_report,
    )


__all__ = ["RefreshResult", "run_evidence_refresh"]
