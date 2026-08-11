"""TreasuryBacking RVC verification for tokenized U.S. Treasury assets."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from services.evidence_commitment import compute_evidence_commitment
from services.provenance.engine import analyze_provenance

from .models import (
    EvidenceRecord,
    PredicateResult,
    VerificationCertificate,
    VerificationResult,
)


TREASURY_BACKING_CLAIM = "TreasuryBacking"
ALLOWED_FUTURE_CLOCK_SKEW = timedelta(minutes=5)
REQUIRED_FIELDS = (
    "asset_class",
    "underlying_asset_value",
    "outstanding_token_value",
    "collateralization_ratio",
    "treasury_exposure",
    "attestation_timestamp",
    "issuer_contract_verified",
    "onchain_supply",
)


def _hash_evidence(evidence: list[EvidenceRecord], asset_id: str = "USDY") -> str:
    return compute_evidence_commitment(asset_id, TREASURY_BACKING_CLAIM, evidence)


def _normalize_asset(value: Any) -> str:
    return value.strip().upper() if isinstance(value, str) else ""


def _as_utc_naive(value: Any) -> datetime | None:
    if isinstance(value, str) and value.strip():
        rendered = value.strip()
        if rendered.endswith("Z"):
            rendered = rendered[:-1] + "+00:00"
        try:
            value = datetime.fromisoformat(rendered)
        except ValueError:
            return None
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is None or value.utcoffset() is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _claim_labels(record: EvidenceRecord) -> tuple[bool, set[str]]:
    metadata = record.metadata if isinstance(record.metadata, Mapping) else {}
    labels: set[str] = set()
    explicit = False
    for key in ("claim", "claim_type"):
        if key not in metadata:
            continue
        explicit = True
        value = metadata[key]
        if not isinstance(value, str) or not value.strip():
            return True, set()
        labels.add(value.strip())
    if "claims" in metadata:
        explicit = True
        values = metadata["claims"]
        if not isinstance(values, Sequence) or isinstance(values, (str, bytes)):
            return True, set()
        normalized = {
            value.strip()
            for value in values
            if isinstance(value, str) and value.strip()
        }
        if len(normalized) != len(values):
            return True, set()
        labels.update(normalized)
    return explicit, labels


def _belongs_to_treasury_claim(record: EvidenceRecord, asset_id: str) -> bool:
    if _normalize_asset(record.asset) != asset_id:
        return False
    explicit_claim, labels = _claim_labels(record)
    if not explicit_claim:
        return True
    return labels == {TREASURY_BACKING_CLAIM}


def _is_future_observation(
    record: EvidenceRecord,
    now: datetime,
    allowed_clock_skew: timedelta,
) -> bool:
    observed_at = _as_utc_naive(record.observed_at)
    return observed_at is not None and observed_at > now + allowed_clock_skew


def _reason_codes(results: list[PredicateResult]) -> list[str]:
    return list(
        dict.fromkeys(
            result.reason_code
            for result in results
            if result.reason_code is not None
        )
    )


def _certificate(
    *,
    asset_id: str,
    evidence: list[EvidenceRecord],
    results: list[PredicateResult],
    now: datetime,
) -> VerificationCertificate:
    provenance = analyze_provenance(evidence)
    if any(result.passed is False for result in results):
        final_result = VerificationResult.FAIL
    elif any(result.passed is None for result in results):
        final_result = VerificationResult.INDETERMINATE
    else:
        final_result = VerificationResult.PASS
    return VerificationCertificate(
        certificate_id=str(uuid4()),
        asset_id=asset_id,
        claim_type=TREASURY_BACKING_CLAIM,
        claim_version="1.0",
        policy_id="default-treasury-policy",
        policy_version="1.0",
        result=final_result,
        predicate_results=results,
        reason_codes=_reason_codes(results),
        evidence_root=_hash_evidence(evidence, asset_id),
        independent_root_count=provenance.independent_root_count,
        observed_at=now,
        valid_until=now + timedelta(hours=1),
        simulation_flag=any(item.simulation for item in evidence),
    )


def verify_treasury_backing(
    asset_id: str,
    evidence: list[EvidenceRecord],
    min_treasury_exposure: float = 0.95,
    max_attestation_age_hours: int = 24,
    verification_time: datetime | None = None,
    allowed_future_clock_skew: timedelta = ALLOWED_FUTURE_CLOCK_SKEW,
) -> VerificationCertificate:
    """Verify USDY TreasuryBacking evidence with fail-closed claim boundaries.

    Asset-specific records without an explicit claim label remain valid for the
    asset's sole supported claim. Explicit claim labels must resolve exactly to
    ``TreasuryBacking``. Five minutes is the maximum accepted future clock skew.
    """

    now = _as_utc_naive(verification_time) if verification_time is not None else None
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    normalized_asset_id = _normalize_asset(asset_id)
    claim_evidence = [
        item
        for item in evidence
        if _belongs_to_treasury_claim(item, normalized_asset_id)
    ]
    future_fields = {
        item.field
        for item in claim_evidence
        if _is_future_observation(item, now, allowed_future_clock_skew)
    }
    usable_evidence = [
        item
        for item in claim_evidence
        if item.field not in future_fields
    ]
    evidence_map = {item.field: item for item in usable_evidence}
    missing = [field for field in REQUIRED_FIELDS if field not in evidence_map]
    if missing:
        results = [
            PredicateResult(
                predicate=f"{field} exists",
                passed=None,
                reason_code=("FUTURE_EVIDENCE" if field in future_fields else "MISSING_EVIDENCE"),
            )
            for field in missing
        ]
        return _certificate(
            asset_id=asset_id,
            evidence=usable_evidence,
            results=results,
            now=now,
        )

    results: list[PredicateResult] = []

    def add_check(
        predicate: str,
        passed: bool | None,
        expected: Any,
        observed: Any,
        reason: str,
    ) -> None:
        results.append(
            PredicateResult(
                predicate=predicate,
                passed=passed,
                expected=expected,
                observed=observed,
                reason_code=None if passed is True else reason,
            )
        )

    add_check(
        "asset_class == TOKENIZED_TREASURY",
        evidence_map["asset_class"].value == "TOKENIZED_TREASURY",
        "TOKENIZED_TREASURY",
        evidence_map["asset_class"].value,
        "WRONG_ASSET_CLASS",
    )
    add_check(
        "underlying_asset_value >= outstanding_token_value",
        evidence_map["underlying_asset_value"].value
        >= evidence_map["outstanding_token_value"].value,
        evidence_map["outstanding_token_value"].value,
        evidence_map["underlying_asset_value"].value,
        "UNDERCOLLATERALIZED",
    )
    add_check(
        "collateralization_ratio >= 1.00",
        evidence_map["collateralization_ratio"].value >= 1.0,
        1.0,
        evidence_map["collateralization_ratio"].value,
        "LOW_COLLATERALIZATION_RATIO",
    )
    add_check(
        "treasury_exposure >= policy.minimum",
        evidence_map["treasury_exposure"].value >= min_treasury_exposure,
        min_treasury_exposure,
        evidence_map["treasury_exposure"].value,
        "INSUFFICIENT_TREASURY_EXPOSURE",
    )

    attestation_record = evidence_map["attestation_timestamp"]
    attestation_time = _as_utc_naive(attestation_record.value)
    if attestation_time is None:
        add_check(
            "attestation.age <= policy.max_age",
            None,
            f"{max_attestation_age_hours} hours",
            attestation_record.value,
            "INVALID_ATTESTATION_TIMESTAMP",
        )
    elif attestation_time > now + allowed_future_clock_skew:
        add_check(
            "attestation.age <= policy.max_age",
            None,
            f"{max_attestation_age_hours} hours",
            f"future timestamp: {attestation_time.isoformat()}",
            "FUTURE_ATTESTATION",
        )
    else:
        age = max(now - attestation_time, timedelta(0))
        add_check(
            "attestation.age <= policy.max_age",
            age <= timedelta(hours=max_attestation_age_hours),
            f"{max_attestation_age_hours} hours",
            f"{age.total_seconds() / 3600:.2f} hours",
            "STALE_ATTESTATION",
        )

    add_check(
        "issuer_contract == VERIFIED",
        evidence_map["issuer_contract_verified"].value is True,
        True,
        evidence_map["issuer_contract_verified"].value,
        "UNVERIFIED_ISSUER_CONTRACT",
    )
    add_check(
        "onchain_supply exists",
        evidence_map["onchain_supply"].value is not None,
        "non-null",
        evidence_map["onchain_supply"].value,
        "MISSING_ONCHAIN_SUPPLY",
    )
    return _certificate(
        asset_id=asset_id,
        evidence=usable_evidence,
        results=results,
        now=now,
    )
