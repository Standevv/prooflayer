"""GoldBacking RVC verification for allocated physical-gold tokens."""

from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable
from uuid import uuid4

from services.evidence_commitment import compute_evidence_commitment
from services.provenance.engine import analyze_provenance

from .models import (
    EvidenceRecord,
    PredicateResult,
    VerificationCertificate,
    VerificationResult,
)


_ONE_TO_ONE_FIELDS = (
    "fine_troy_ounces_per_token",
    "gold_ounces_per_token",
    "gold_oz_per_token",
)


def _hash_evidence(evidence: list[EvidenceRecord], asset_id: str = "PAXG") -> str:
    return compute_evidence_commitment(asset_id, "GoldBacking", evidence)


def _as_decimal(value: Any) -> Decimal | None:
    """Convert normalized numeric evidence without inheriting float error."""
    if isinstance(value, bool) or value is None:
        return None
    try:
        result = Decimal(str(value).strip())
    except (InvalidOperation, ValueError, AttributeError):
        return None
    return result if result.is_finite() else None


def _as_utc_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        timestamp = value
    elif isinstance(value, str) and value.strip():
        raw_timestamp = value.strip()
        if raw_timestamp.endswith("Z"):
            raw_timestamp = raw_timestamp[:-1] + "+00:00"
        try:
            timestamp = datetime.fromisoformat(raw_timestamp)
        except ValueError:
            return None
    else:
        return None

    if timestamp.tzinfo is None:
        return timestamp.replace(tzinfo=timezone.utc)
    return timestamp.astimezone(timezone.utc)


def _first_record(
    evidence_map: dict[str, EvidenceRecord], fields: Iterable[str]
) -> EvidenceRecord | None:
    return next(
        (evidence_map[field] for field in fields if field in evidence_map),
        None,
    )


def _result(
    predicate: str,
    passed: bool | None,
    *,
    expected: Any,
    observed: Any,
    reason_code: str | None,
) -> PredicateResult:
    return PredicateResult(
        predicate=predicate,
        passed=passed,
        expected=expected,
        observed=observed,
        reason_code=None if passed is True else reason_code,
    )


def _equality_predicate(
    evidence_map: dict[str, EvidenceRecord],
    *,
    field: str,
    predicate: str,
    expected: str,
    contradiction_reason: str,
) -> PredicateResult:
    record = evidence_map.get(field)
    if record is None or record.value is None:
        return _result(
            predicate,
            None,
            expected=expected,
            observed=None,
            reason_code="MISSING_EVIDENCE",
        )
    return _result(
        predicate,
        record.value == expected,
        expected=expected,
        observed=record.value,
        reason_code=contradiction_reason,
    )


def _allocated_gold_predicate(
    evidence_map: dict[str, EvidenceRecord],
) -> PredicateResult:
    predicate = "allocated_gold_oz >= circulating_token_supply"
    allocated_record = evidence_map.get("allocated_gold_oz")
    supply_record = evidence_map.get("circulating_token_supply")
    relationship_record = _first_record(evidence_map, _ONE_TO_ONE_FIELDS)

    if (
        allocated_record is None
        or allocated_record.value is None
        or supply_record is None
        or supply_record.value is None
        or relationship_record is None
        or relationship_record.value is None
    ):
        return _result(
            predicate,
            None,
            expected="allocated ounces cover supply with 1 fine troy ounce per token",
            observed={
                "allocated_gold_oz": (
                    None if allocated_record is None else allocated_record.value
                ),
                "circulating_token_supply": (
                    None if supply_record is None else supply_record.value
                ),
                "fine_troy_ounces_per_token": (
                    None
                    if relationship_record is None
                    else relationship_record.value
                ),
            },
            reason_code="MISSING_EVIDENCE",
        )

    allocated_gold = _as_decimal(allocated_record.value)
    circulating_supply = _as_decimal(supply_record.value)
    ounces_per_token = _as_decimal(relationship_record.value)
    observed = {
        "allocated_gold_oz": allocated_record.value,
        "circulating_token_supply": supply_record.value,
        "fine_troy_ounces_per_token": relationship_record.value,
    }

    if (
        allocated_gold is None
        or circulating_supply is None
        or ounces_per_token is None
        or allocated_gold < 0
        or circulating_supply < 0
    ):
        return _result(
            predicate,
            None,
            expected="finite non-negative values and a positive relationship",
            observed=observed,
            reason_code="INVALID_EVIDENCE",
        )

    if ounces_per_token != Decimal("1"):
        return _result(
            predicate,
            False,
            expected="1 fine troy ounce per token",
            observed=relationship_record.value,
            reason_code="INVALID_GOLD_TOKEN_RELATIONSHIP",
        )

    return _result(
        predicate,
        allocated_gold >= circulating_supply,
        expected=supply_record.value,
        observed=allocated_record.value,
        reason_code="INSUFFICIENT_ALLOCATED_GOLD",
    )


def _backing_ratio_predicate(
    evidence_map: dict[str, EvidenceRecord],
) -> PredicateResult:
    predicate = "backing_ratio >= 1.00"
    record = evidence_map.get("backing_ratio")
    if record is None or record.value is None:
        return _result(
            predicate,
            None,
            expected=Decimal("1.00"),
            observed=None,
            reason_code="MISSING_EVIDENCE",
        )

    ratio = _as_decimal(record.value)
    if ratio is None:
        return _result(
            predicate,
            None,
            expected=Decimal("1.00"),
            observed=record.value,
            reason_code="INVALID_EVIDENCE",
        )

    return _result(
        predicate,
        ratio >= Decimal("1.00"),
        expected=Decimal("1.00"),
        observed=record.value,
        reason_code="LOW_BACKING_RATIO",
    )


def _attestation_predicates(
    evidence_map: dict[str, EvidenceRecord],
    *,
    now: datetime,
    max_attestation_age_days: Decimal,
) -> tuple[PredicateResult, PredicateResult]:
    timestamp_record = evidence_map.get("reserve_attestation_timestamp")
    exists_predicate = "reserve_attestation exists"
    age_predicate = "reserve_attestation.age <= policy.max_age"

    if timestamp_record is None or timestamp_record.value is None:
        missing = _result(
            exists_predicate,
            None,
            expected="non-null reserve attestation timestamp",
            observed=None,
            reason_code="MISSING_EVIDENCE",
        )
        age = _result(
            age_predicate,
            None,
            expected=f"<= {max_attestation_age_days} days",
            observed=None,
            reason_code="MISSING_EVIDENCE",
        )
        return missing, age

    timestamp = _as_utc_datetime(timestamp_record.value)
    if timestamp is None:
        invalid = _result(
            exists_predicate,
            None,
            expected="valid reserve attestation timestamp",
            observed=timestamp_record.value,
            reason_code="INVALID_ATTESTATION_TIMESTAMP",
        )
        invalid_age = _result(
            age_predicate,
            None,
            expected=f"<= {max_attestation_age_days} days",
            observed=timestamp_record.value,
            reason_code="INVALID_ATTESTATION_TIMESTAMP",
        )
        return invalid, invalid_age

    exists = _result(
        exists_predicate,
        True,
        expected="non-null reserve attestation timestamp",
        observed=timestamp_record.value,
        reason_code=None,
    )

    age = now - timestamp
    if age < timedelta(0):
        return exists, _result(
            age_predicate,
            None,
            expected=f"<= {max_attestation_age_days} days",
            observed=f"future timestamp: {timestamp.isoformat()}",
            reason_code="INVALID_ATTESTATION_TIMESTAMP",
        )

    maximum_age = timedelta(days=float(max_attestation_age_days))
    if age > maximum_age:
        return exists, _result(
            age_predicate,
            None,
            expected=f"<= {max_attestation_age_days} days",
            observed=f"{Decimal(str(age.total_seconds() / 86400)):.2f} days",
            reason_code="STALE_ATTESTATION",
        )

    return exists, _result(
        age_predicate,
        True,
        expected=f"<= {max_attestation_age_days} days",
        observed=f"{Decimal(str(age.total_seconds() / 86400)):.2f} days",
        reason_code=None,
    )


def _contract_predicate(
    evidence_map: dict[str, EvidenceRecord],
) -> PredicateResult:
    predicate = "issuer_contract_verified == True"
    record = evidence_map.get("issuer_contract_verified")
    if record is None or record.value is None:
        return _result(
            predicate,
            None,
            expected=True,
            observed=None,
            reason_code="MISSING_EVIDENCE",
        )
    if not isinstance(record.value, bool):
        return _result(
            predicate,
            None,
            expected=True,
            observed=record.value,
            reason_code="INVALID_EVIDENCE",
        )
    return _result(
        predicate,
        record.value,
        expected=True,
        observed=record.value,
        reason_code="UNVERIFIED_ISSUER_CONTRACT",
    )


def _policy_age(value: Any) -> Decimal:
    parsed = _as_decimal(value)
    if parsed is None or parsed < 0 or parsed > Decimal("999999998"):
        raise ValueError(
            "max_attestation_age_days must be a supported non-negative number"
        )
    return parsed


def verify_gold_backing(
    asset_id: str,
    evidence: list[EvidenceRecord],
    max_attestation_age_days: int = 31,
) -> VerificationCertificate:
    """Verify allocated-gold backing using three-valued RVC semantics.

    An explicit contradiction produces ``FAIL``. Missing, malformed, future,
    or stale evidence produces ``INDETERMINATE`` unless another predicate is
    explicitly contradicted. The ounce/supply comparison is only made when an
    evidence record explicitly establishes one fine troy ounce per token.
    """

    policy_age = _policy_age(max_attestation_age_days)
    now = datetime.now(timezone.utc)
    normalized_asset_id = asset_id.strip().upper() if isinstance(asset_id, str) else ""
    claim_evidence = [
        item
        for item in evidence
        if isinstance(item.asset, str)
        and item.asset.strip().upper() == normalized_asset_id
    ]
    provenance = analyze_provenance(claim_evidence)
    evidence_map = {item.field: item for item in claim_evidence}

    attestation_exists, attestation_age = _attestation_predicates(
        evidence_map,
        now=now,
        max_attestation_age_days=policy_age,
    )
    predicate_results = [
        _equality_predicate(
            evidence_map,
            field="asset_class",
            predicate="asset_class == TOKENIZED_GOLD",
            expected="TOKENIZED_GOLD",
            contradiction_reason="WRONG_ASSET_CLASS",
        ),
        _equality_predicate(
            evidence_map,
            field="reserve_asset",
            predicate="reserve_asset == LBMA_GOOD_DELIVERY_GOLD",
            expected="LBMA_GOOD_DELIVERY_GOLD",
            contradiction_reason="WRONG_RESERVE_ASSET",
        ),
        _allocated_gold_predicate(evidence_map),
        _backing_ratio_predicate(evidence_map),
        attestation_exists,
        attestation_age,
        _contract_predicate(evidence_map),
    ]

    if any(item.passed is False for item in predicate_results):
        verification_result = VerificationResult.FAIL
    elif any(item.passed is None for item in predicate_results):
        verification_result = VerificationResult.INDETERMINATE
    else:
        verification_result = VerificationResult.PASS

    reason_codes = list(
        dict.fromkeys(
            item.reason_code
            for item in predicate_results
            if item.reason_code is not None
        )
    )
    return VerificationCertificate(
        certificate_id=str(uuid4()),
        asset_id=asset_id,
        claim_type="GoldBacking",
        claim_version="1.0",
        policy_id="default-gold-policy",
        policy_version="1.0",
        result=verification_result,
        predicate_results=predicate_results,
        reason_codes=reason_codes,
        evidence_root=_hash_evidence(claim_evidence, asset_id),
        independent_root_count=provenance.independent_root_count,
        observed_at=now,
        valid_until=now + timedelta(hours=1),
        simulation_flag=any(item.simulation for item in claim_evidence),
    )


__all__ = ["verify_gold_backing"]
