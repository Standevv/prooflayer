"""Deterministic state composition and comparison for continuous verification."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from services.evidence_explorer.lookup import EvidenceExplorerService
from services.mcp_server.tools import ProofLayerTools

from .models import (
    EvidenceFreshnessRecord,
    MonitoringAssetDetail,
    MonitoringAssetSummary,
    MonitoringCheckResult,
    MonitoringConfig,
    MonitoringOverview,
    TransitionCategory,
    TransitionSeverity,
    TransitionValue,
    TrustSnapshot,
    TrustTransition,
)
from .store import MonitoringStore


MONITORING_CONFIGS: dict[str, MonitoringConfig] = {
    "USDY": MonitoringConfig(
        asset="USDY",
        claim="TreasuryBacking",
        check_interval_seconds=300,
    ),
    "PAXG": MonitoringConfig(
        asset="PAXG",
        claim="GoldBacking",
        check_interval_seconds=600,
    ),
}


class MonitoringError(RuntimeError):
    """Raised for unsupported or inconsistent monitoring requests."""


def normalize_monitoring_asset(asset: str) -> str:
    normalized = asset.strip().upper() if isinstance(asset, str) else ""
    if normalized not in MONITORING_CONFIGS:
        raise MonitoringError(
            f"Unsupported monitoring asset {asset!r}; supported assets are USDY and PAXG."
        )
    return normalized


def monitoring_config(asset: str, claim: str | None = None) -> MonitoringConfig:
    config = MONITORING_CONFIGS[normalize_monitoring_asset(asset)]
    if claim is not None and claim != config.claim:
        raise MonitoringError(f"{config.asset} monitoring requires claim {config.claim}.")
    return config


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_error(label: str, error: Exception) -> str:
    message = " ".join(str(error).split())[:240]
    return f"{label}: {message or type(error).__name__}"


def _hash(payload: Mapping[str, Any]) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return "0x" + hashlib.sha256(encoded).hexdigest()


def _certificate_lifecycle(
    live: Mapping[str, Any],
    *,
    checked_at: datetime,
) -> str:
    if not bool(live.get("exists", live.get("registered"))):
        return "NONE"
    if bool(live.get("revoked")):
        return "REVOKED"
    result = str(live.get("result") or "UNKNOWN")
    if result not in {"PASS", "UNKNOWN"}:
        return "NON-PASS"
    valid_until = live.get("valid_until")
    if isinstance(valid_until, int) and valid_until <= int(checked_at.timestamp()):
        return "EXPIRED"
    if bool(live.get("usable")):
        return "ACTIVE"
    return "UNUSABLE"


def _freshness_records(detail: Any) -> list[EvidenceFreshnessRecord]:
    policy_max_age: str | None = None
    for predicate in detail.verification.predicates:
        if "attestation.age" in predicate.predicate.lower():
            policy_max_age = (
                str(predicate.expected) if predicate.expected is not None else None
            )
            break

    by_source: dict[str, EvidenceFreshnessRecord] = {}
    for record in detail.evidence_records:
        if record.source_type.strip().lower() != "attestation":
            continue
        by_source.setdefault(
            record.source_id,
            EvidenceFreshnessRecord(
                source_id=record.source_id,
                source_type=record.source_type,
                observed_at=record.observed_at,
                policy_max_age=policy_max_age,
                freshness=record.freshness,
                explanation=record.freshness_reason,
                authenticity_labels=list(record.authenticity_labels),
            ),
        )
    return [by_source[key] for key in sorted(by_source)]


def _verification_severity(previous: str, current: str) -> TransitionSeverity:
    if previous == "PASS" and current in {"FAIL", "INDETERMINATE", "UNAVAILABLE"}:
        return "CRITICAL"
    if current == "FAIL":
        return "CRITICAL"
    if current == "PASS":
        return "INFO"
    return "WARNING"


def _freshness_severity(previous: str | None, current: str | None) -> TransitionSeverity:
    if current == "STALE":
        return "WARNING"
    if previous == "STALE" and current == "CURRENT":
        return "INFO"
    return "WARNING"


def _transition(
    previous: TrustSnapshot,
    current: TrustSnapshot,
    *,
    category: TransitionCategory,
    previous_value: TransitionValue,
    current_value: TransitionValue,
    severity: TransitionSeverity,
    explanation: str,
) -> TrustTransition:
    transition_id = _hash(
        {
            "asset": current.asset,
            "claim": current.claim,
            "previous_snapshot_id": previous.snapshot_id,
            "current_snapshot_id": current.snapshot_id,
            "category": category,
            "previous_value": previous_value,
            "current_value": current_value,
        }
    )
    return TrustTransition(
        transition_id=transition_id,
        asset=current.asset,
        claim=current.claim,
        occurred_at=current.checked_at,
        previous_snapshot_id=previous.snapshot_id,
        current_snapshot_id=current.snapshot_id,
        category=category,
        previous_value=previous_value,
        current_value=current_value,
        severity=severity,
        explanation=explanation,
    )


def compare_snapshots(
    previous: TrustSnapshot | None,
    current: TrustSnapshot,
) -> list[TrustTransition]:
    """Return only genuine semantic differences in stable category order."""

    if previous is None:
        return []
    transitions: list[TrustTransition] = []

    if previous.verification_result != current.verification_result:
        transitions.append(
            _transition(
                previous,
                current,
                category="VERIFICATION_RESULT_CHANGED",
                previous_value=previous.verification_result,
                current_value=current.verification_result,
                severity=_verification_severity(
                    previous.verification_result, current.verification_result
                ),
                explanation=(
                    f"Deterministic verification changed from {previous.verification_result} "
                    f"to {current.verification_result}."
                ),
            )
        )

    if previous.evidence_freshness != current.evidence_freshness:
        transitions.append(
            _transition(
                previous,
                current,
                category="EVIDENCE_FRESHNESS_CHANGED",
                previous_value=previous.evidence_freshness,
                current_value=current.evidence_freshness,
                severity=_freshness_severity(
                    previous.evidence_freshness, current.evidence_freshness
                ),
                explanation=(
                    f"Evidence freshness changed from {previous.evidence_freshness or 'NOT CHECKED'} "
                    f"to {current.evidence_freshness or 'NOT CHECKED'}."
                ),
            )
        )

    if previous.evidence_root != current.evidence_root:
        transitions.append(
            _transition(
                previous,
                current,
                category="EVIDENCE_ROOT_CHANGED",
                previous_value=previous.evidence_root,
                current_value=current.evidence_root,
                severity="INFO",
                explanation="The deterministic evidence commitment changed.",
            )
        )

    if previous.independent_root_count != current.independent_root_count:
        decreased = (
            previous.independent_root_count is not None
            and current.independent_root_count is not None
            and current.independent_root_count < previous.independent_root_count
        )
        transitions.append(
            _transition(
                previous,
                current,
                category="INDEPENDENT_ROOT_COUNT_CHANGED",
                previous_value=previous.independent_root_count,
                current_value=current.independent_root_count,
                severity="WARNING" if decreased else "INFO",
                explanation=(
                    "The number of independent provenance roots decreased."
                    if decreased
                    else "The number of independent provenance roots changed."
                ),
            )
        )

    if previous.certificate_lifecycle_state != current.certificate_lifecycle_state:
        critical_states = {"EXPIRED", "REVOKED", "NON-PASS", "UNUSABLE"}
        severity: TransitionSeverity = (
            "CRITICAL"
            if previous.certificate_lifecycle_state == "ACTIVE"
            and current.certificate_lifecycle_state in critical_states
            else "INFO"
            if current.certificate_lifecycle_state == "ACTIVE"
            else "WARNING"
        )
        transitions.append(
            _transition(
                previous,
                current,
                category="CERTIFICATE_STATUS_CHANGED",
                previous_value=previous.certificate_lifecycle_state,
                current_value=current.certificate_lifecycle_state,
                severity=severity,
                explanation=(
                    f"Certificate lifecycle changed from {previous.certificate_lifecycle_state} "
                    f"to {current.certificate_lifecycle_state}."
                ),
            )
        )

    if previous.certificate_usable != current.certificate_usable:
        severity = (
            "CRITICAL"
            if previous.certificate_usable is True and current.certificate_usable is False
            else "INFO"
            if current.certificate_usable is True
            else "WARNING"
        )
        transitions.append(
            _transition(
                previous,
                current,
                category="CERTIFICATE_USABILITY_CHANGED",
                previous_value=previous.certificate_usable,
                current_value=current.certificate_usable,
                severity=severity,
                explanation=(
                    "Certificate usability changed from "
                    f"{previous.certificate_usable} to {current.certificate_usable}."
                ),
            )
        )

    if previous.policygate_outcome != current.policygate_outcome:
        severity = (
            "CRITICAL"
            if previous.policygate_outcome == "ALLOW"
            and current.policygate_outcome == "BLOCK"
            else "INFO"
            if current.policygate_outcome == "ALLOW"
            else "WARNING"
        )
        transitions.append(
            _transition(
                previous,
                current,
                category="POLICYGATE_OUTCOME_CHANGED",
                previous_value=previous.policygate_outcome,
                current_value=current.policygate_outcome,
                severity=severity,
                explanation=(
                    f"PolicyGate assessment changed from {previous.policygate_outcome} "
                    f"to {current.policygate_outcome}."
                ),
            )
        )

    previous_reasons = sorted(previous.reason_codes)
    current_reasons = sorted(current.reason_codes)
    if previous_reasons != current_reasons:
        new_reasons = sorted(set(current_reasons) - set(previous_reasons))
        transitions.append(
            _transition(
                previous,
                current,
                category="REASON_CODES_CHANGED",
                previous_value=previous_reasons,
                current_value=current_reasons,
                severity="WARNING" if new_reasons else "INFO",
                explanation=(
                    f"Verification reason codes changed; added: {', '.join(new_reasons)}."
                    if new_reasons
                    else "Verification reason codes changed and no new reason code was added."
                ),
            )
        )

    return transitions


class ContinuousVerificationEngine:
    """Run explicit checks, compare with history, and persist factual changes."""

    def __init__(
        self,
        tools: ProofLayerTools | Any | None = None,
        *,
        evidence: EvidenceExplorerService | Any | None = None,
        store: MonitoringStore | None = None,
        clock: Callable[[], datetime] = _utc_now,
    ) -> None:
        self.tools = tools or ProofLayerTools()
        self.evidence = evidence or EvidenceExplorerService(tools=self.tools)
        self.store = store or MonitoringStore()
        self._clock = clock

    def _build_snapshot(self, config: MonitoringConfig) -> TrustSnapshot:
        checked_at = self._clock().astimezone(timezone.utc)
        errors: list[str] = []
        authenticity: list[str] = ["DERIVED"]
        certificate_id: str | None = None
        policy_id: str | None = None

        try:
            detail = self.evidence.get_asset(config.asset, include_certificate=False)
            verification = getattr(detail, "verification", None)
            evidence_commitment = getattr(detail, "evidence_commitment", None)
            provenance = getattr(detail, "provenance", None)
            certificate_linkage = getattr(detail, "certificate_linkage", None)

            verification_result = getattr(verification, "result", "UNAVAILABLE")
            reason_codes = sorted(set(getattr(verification, "reason_codes", []) or []))
            evidence_root = getattr(evidence_commitment, "value", None)
            commitment_version = getattr(evidence_commitment, "version", None) or "pl-evidence-v1"
            independent_roots = getattr(provenance, "independent_root_count", None)
            canonical_roots = getattr(provenance, "canonical_root_count", None)
            independent_trust_domain_count = getattr(
                provenance,
                "independent_trust_domain_count",
                None,
            )
            observed_source_count = getattr(provenance, "observed_source_count", None)
            unknown_root_count = getattr(provenance, "unknown_root_count", None)
            freshness = getattr(detail, "freshness_summary", None)
            freshness_records = _freshness_records(detail)
            certificate_id = getattr(certificate_linkage, "certificate_id", None)
            policy_id = getattr(verification, "policy_id", None)
            authenticity.extend(["DETERMINISTIC RVC", "CACHED OFFICIAL EVIDENCE"])
        except Exception as error:
            verification_result = "UNAVAILABLE"
            reason_codes = []
            evidence_root = None
            commitment_version = "pl-evidence-v1"
            independent_roots = None
            canonical_roots = None
            independent_trust_domain_count = None
            observed_source_count = None
            unknown_root_count = None
            freshness = None
            freshness_records = []
            errors.append(_safe_error("Deterministic verification unavailable", error))
            try:
                metadata = self.tools.get_asset_metadata(config.asset)
                if isinstance(metadata, Mapping):
                    certificate_id = (
                        str(metadata["known_live_certificate_id"])
                        if metadata.get("known_live_certificate_id")
                        else None
                    )
                    policy_id = str(metadata.get("policy") or "") or None
            except Exception as metadata_error:
                errors.append(_safe_error("Asset metadata unavailable", metadata_error))

        certificate_exists: bool | None = None
        certificate_usable: bool | None = None
        certificate_status = "NOT_CHECKED"
        certificate_lifecycle = "NOT CHECKED"
        certificate_historical_result: str | None = None
        certificate_valid_until: int | None = None
        certificate_read_available = False

        if config.monitor_certificate and certificate_id:
            authenticity.append("DEMO FIXTURE")
            try:
                candidate = self.tools.get_certificate_state(certificate_id)
                if not isinstance(candidate, Mapping):
                    raise TypeError("certificate state reader returned an invalid response")
                certificate_read_available = True
                certificate_exists = bool(
                    candidate.get("exists", candidate.get("registered"))
                )
                certificate_usable = bool(candidate.get("usable"))
                certificate_status = str(
                    candidate.get("certificate_status")
                    or ("REGISTERED_USABLE" if certificate_usable else "REGISTERED_UNUSABLE")
                )
                certificate_lifecycle = _certificate_lifecycle(
                    candidate, checked_at=checked_at
                )
                certificate_historical_result = (
                    str(candidate["result"]) if candidate.get("result") else None
                )
                valid_until = candidate.get("valid_until")
                certificate_valid_until = (
                    int(valid_until) if isinstance(valid_until, int) else None
                )
                authenticity.append("LIVE ON-CHAIN")
            except Exception as error:
                certificate_status = "LIVE_READ_UNAVAILABLE"
                certificate_lifecycle = "LIVE READ UNAVAILABLE"
                errors.append(_safe_error("Certificate live read unavailable", error))
        elif config.monitor_certificate:
            certificate_status = "NO_CERTIFICATE_FIXTURE"
            certificate_lifecycle = "NONE"

        policygate_outcome = "NOT CHECKED"
        if (
            config.monitor_policygate
            and certificate_id
            and certificate_read_available
            and certificate_exists
        ):
            try:
                candidate = self.tools.get_policygate_state(
                    certificate_id,
                    config.asset,
                    config.claim,
                    policy_id or "",
                )
                if not isinstance(candidate, Mapping):
                    raise TypeError("PolicyGate reader returned an invalid response")
                raw_outcome = str(candidate.get("policygate_outcome") or "")
                policygate_outcome = {
                    "ALLOWED": "ALLOW",
                    "BLOCKED": "BLOCK",
                }.get(raw_outcome, "UNAVAILABLE")
                authenticity.append("LIVE ON-CHAIN")
            except Exception as error:
                policygate_outcome = "UNAVAILABLE"
                errors.append(_safe_error("PolicyGate live read unavailable", error))

        authenticity = list(dict.fromkeys(authenticity))
        if errors:
            authenticity.append("UNAVAILABLE")
        if verification_result == "UNAVAILABLE" and not certificate_read_available:
            source_status = "UNAVAILABLE"
        elif errors:
            source_status = "PARTIAL"
        else:
            source_status = "COMPLETE"

        snapshot_payload = {
            "asset": config.asset,
            "claim": config.claim,
            "checked_at": checked_at.isoformat().replace("+00:00", "Z"),
            "verification_result": verification_result,
            "reason_codes": reason_codes,
            "evidence_root": evidence_root,
            "commitment_version": commitment_version,
            "independent_root_count": independent_roots,
            "canonical_root_count": canonical_roots,
            "independent_trust_domain_count": independent_trust_domain_count,
            "observed_source_count": observed_source_count,
            "unknown_root_count": unknown_root_count,
            "evidence_freshness": freshness,
            "certificate_id": certificate_id,
            "certificate_exists": certificate_exists,
            "certificate_usable": certificate_usable,
            "certificate_status": certificate_status,
            "certificate_lifecycle_state": certificate_lifecycle,
            "policygate_outcome": policygate_outcome,
            "source_status": source_status,
        }
        return TrustSnapshot(
            snapshot_id=_hash(snapshot_payload),
            asset=config.asset,
            claim=config.claim,
            checked_at=checked_at,
            verification_result=verification_result,
            reason_codes=reason_codes,
            evidence_root=evidence_root,
            commitment_version=commitment_version,
            independent_root_count=independent_roots,
            canonical_root_count=canonical_roots,
            independent_trust_domain_count=independent_trust_domain_count,
            observed_source_count=observed_source_count,
            unknown_root_count=unknown_root_count,
            evidence_freshness=freshness,
            evidence_freshness_records=freshness_records,
            certificate_id=certificate_id,
            certificate_exists=certificate_exists,
            certificate_usable=certificate_usable,
            certificate_status=certificate_status,
            certificate_lifecycle_state=certificate_lifecycle,
            certificate_historical_result=certificate_historical_result,
            certificate_valid_until=certificate_valid_until,
            policygate_outcome=policygate_outcome,
            source_status=source_status,
            authenticity_sources=authenticity,
            source_errors=errors,
        )

    def run_monitoring_check(self, asset: str, claim: str) -> MonitoringCheckResult:
        config = monitoring_config(asset, claim)
        previous = self.store.latest_snapshot(config.asset)
        current = self._build_snapshot(config)
        transitions = compare_snapshots(previous, current)
        snapshot_persisted = self.store.append_snapshot(current)
        transition_count = self.store.append_transitions(transitions)
        return MonitoringCheckResult(
            current_snapshot=current,
            previous_snapshot=previous,
            transitions=transitions,
            snapshot_persisted=snapshot_persisted,
            transition_count_persisted=transition_count,
            next_recommended_check=current.checked_at
            + timedelta(seconds=config.check_interval_seconds),
        )

    def inspect_current_state(self, asset: str, claim: str) -> TrustSnapshot:
        """Compose current trust state without persisting monitoring history."""

        return self._build_snapshot(monitoring_config(asset, claim))

    def overview(self) -> MonitoringOverview:
        assets: list[MonitoringAssetSummary] = []
        for config in MONITORING_CONFIGS.values():
            snapshots = self.store.snapshots(config.asset)
            transitions = self.store.transitions(config.asset)
            assets.append(
                MonitoringAssetSummary(
                    asset=config.asset,
                    claim=config.claim,
                    config=config,
                    current_snapshot=snapshots[-1] if snapshots else None,
                    snapshot_count=len(snapshots),
                    transition_count=len(transitions),
                    href=f"/monitoring/{config.asset.lower()}",
                )
            )
        return MonitoringOverview(assets=assets)

    def asset_detail(self, asset: str, *, limit: int = 50) -> MonitoringAssetDetail:
        config = monitoring_config(asset)
        snapshots = self.store.snapshots(config.asset)
        transitions = self.store.transitions(config.asset)
        return MonitoringAssetDetail(
            asset=config.asset,
            claim=config.claim,
            config=config,
            current_snapshot=snapshots[-1] if snapshots else None,
            recent_snapshots=snapshots[-limit:],
            recent_transitions=transitions[-limit:],
        )


def run_monitoring_check(asset: str, claim: str) -> MonitoringCheckResult:
    """Convenience boundary for explicit local/manual checks."""

    return ContinuousVerificationEngine().run_monitoring_check(asset, claim)


__all__ = [
    "ContinuousVerificationEngine",
    "MONITORING_CONFIGS",
    "MonitoringError",
    "compare_snapshots",
    "monitoring_config",
    "normalize_monitoring_asset",
    "run_monitoring_check",
]
