import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from services.rvc.gold_backing import verify_gold_backing
from services.rvc.models import EvidenceRecord, VerificationResult


def _record(
    field: str,
    value: object,
    *,
    source_id: str = "paxos-product",
    source_type: str = "issuer",
    root_source_id: str = "paxos",
    unit: str | None = None,
) -> EvidenceRecord:
    return EvidenceRecord(
        source_id=source_id,
        source_type=source_type,
        root_source_id=root_source_id,
        asset="PAXG",
        field=field,
        value=value,
        unit=unit,
    )


def _valid_paxg_fixture() -> list[EvidenceRecord]:
    return [
        _record("asset_class", "TOKENIZED_GOLD"),
        _record("reserve_asset", "LBMA_GOOD_DELIVERY_GOLD"),
        _record(
            "fine_troy_ounces_per_token",
            Decimal("1"),
            unit="fine_troy_ounce/PAXG",
        ),
        _record(
            "allocated_gold_oz",
            Decimal("452355"),
            source_id="kpmg-paxg-reserves",
            source_type="attestation",
            root_source_id="kpmg",
            unit="fine_troy_ounce",
        ),
        _record(
            "circulating_token_supply",
            Decimal("452151.125"),
            source_id="ethereum-paxg-total-supply",
            source_type="onchain",
            root_source_id="ethereum",
            unit="PAXG",
        ),
        _record(
            "backing_ratio",
            Decimal("1.00045"),
            source_id="kpmg-paxg-reserves",
            source_type="attestation",
            root_source_id="kpmg",
        ),
        _record(
            "reserve_attestation_timestamp",
            datetime.now(timezone.utc) - timedelta(days=1),
            source_id="kpmg-paxg-reserves",
            source_type="attestation",
            root_source_id="kpmg",
        ),
        _record(
            "issuer_contract_verified",
            True,
            source_id="ethereum-paxg-contract-verification",
            source_type="onchain",
            root_source_id="paxos",
        ),
    ]


def _evidence_for(
    field: str, evidence: list[EvidenceRecord]
) -> EvidenceRecord:
    return next(record for record in evidence if record.field == field)


class GoldBackingTests(unittest.TestCase):
    def test_passes_with_complete_valid_fixture(self) -> None:
        certificate = verify_gold_backing("PAXG", _valid_paxg_fixture())

        self.assertEqual(VerificationResult.PASS, certificate.result)
        self.assertEqual([], certificate.reason_codes)
        self.assertEqual("GoldBacking", certificate.claim_type)
        self.assertEqual(7, len(certificate.predicate_results))
        self.assertEqual(3, certificate.independent_root_count)

    def test_fails_when_allocated_gold_is_less_than_supply(self) -> None:
        evidence = _valid_paxg_fixture()
        _evidence_for("allocated_gold_oz", evidence).value = Decimal("452000")

        certificate = verify_gold_backing("PAXG", evidence)

        self.assertEqual(VerificationResult.FAIL, certificate.result)
        self.assertIn("INSUFFICIENT_ALLOCATED_GOLD", certificate.reason_codes)

    def test_fails_when_backing_ratio_is_below_one(self) -> None:
        evidence = _valid_paxg_fixture()
        _evidence_for("backing_ratio", evidence).value = Decimal("0.9999")

        certificate = verify_gold_backing("PAXG", evidence)

        self.assertEqual(VerificationResult.FAIL, certificate.result)
        self.assertIn("LOW_BACKING_RATIO", certificate.reason_codes)

    def test_is_indeterminate_when_reserve_amount_is_missing(self) -> None:
        evidence = [
            record
            for record in _valid_paxg_fixture()
            if record.field != "allocated_gold_oz"
        ]

        certificate = verify_gold_backing("PAXG", evidence)

        self.assertEqual(VerificationResult.INDETERMINATE, certificate.result)
        comparison = certificate.predicate_results[2]
        self.assertIsNone(comparison.passed)
        self.assertEqual("MISSING_EVIDENCE", comparison.reason_code)

    def test_is_indeterminate_when_attestation_is_missing(self) -> None:
        evidence = [
            record
            for record in _valid_paxg_fixture()
            if record.field != "reserve_attestation_timestamp"
        ]

        certificate = verify_gold_backing("PAXG", evidence)

        self.assertEqual(VerificationResult.INDETERMINATE, certificate.result)
        self.assertIsNone(certificate.predicate_results[4].passed)
        self.assertIsNone(certificate.predicate_results[5].passed)
        self.assertEqual(["MISSING_EVIDENCE"], certificate.reason_codes)

    def test_stale_attestation_is_indeterminate(self) -> None:
        evidence = _valid_paxg_fixture()
        _evidence_for("reserve_attestation_timestamp", evidence).value = (
            datetime.now(timezone.utc) - timedelta(days=32)
        )

        certificate = verify_gold_backing("PAXG", evidence)

        self.assertEqual(VerificationResult.INDETERMINATE, certificate.result)
        self.assertIn("STALE_ATTESTATION", certificate.reason_codes)
        self.assertIsNone(certificate.predicate_results[5].passed)

    def test_missing_explicit_one_to_one_relationship_is_indeterminate(self) -> None:
        evidence = [
            record
            for record in _valid_paxg_fixture()
            if record.field != "fine_troy_ounces_per_token"
        ]

        certificate = verify_gold_backing("PAXG", evidence)

        self.assertEqual(VerificationResult.INDETERMINATE, certificate.result)
        self.assertIsNone(certificate.predicate_results[2].passed)

    def test_explicit_contradiction_takes_precedence_over_missing_evidence(self) -> None:
        evidence = [
            record
            for record in _valid_paxg_fixture()
            if record.field != "reserve_attestation_timestamp"
        ]
        _evidence_for("backing_ratio", evidence).value = Decimal("0.9")

        certificate = verify_gold_backing("PAXG", evidence)

        self.assertEqual(VerificationResult.FAIL, certificate.result)
        self.assertIn("LOW_BACKING_RATIO", certificate.reason_codes)
        self.assertIn("MISSING_EVIDENCE", certificate.reason_codes)

    def test_malformed_numeric_evidence_is_indeterminate(self) -> None:
        evidence = _valid_paxg_fixture()
        _evidence_for("allocated_gold_oz", evidence).value = "not-a-number"

        certificate = verify_gold_backing("PAXG", evidence)

        self.assertEqual(VerificationResult.INDETERMINATE, certificate.result)
        self.assertIn("INVALID_EVIDENCE", certificate.reason_codes)

    def test_explicit_non_one_relationship_is_a_contradiction(self) -> None:
        evidence = _valid_paxg_fixture()
        _evidence_for("fine_troy_ounces_per_token", evidence).value = Decimal("0")

        certificate = verify_gold_backing("PAXG", evidence)

        self.assertEqual(VerificationResult.FAIL, certificate.result)
        self.assertIn(
            "INVALID_GOLD_TOKEN_RELATIONSHIP", certificate.reason_codes
        )

    def test_negative_backing_ratio_is_a_low_ratio_contradiction(self) -> None:
        evidence = _valid_paxg_fixture()
        _evidence_for("backing_ratio", evidence).value = Decimal("-1")

        certificate = verify_gold_backing("PAXG", evidence)

        self.assertEqual(VerificationResult.FAIL, certificate.result)
        self.assertIn("LOW_BACKING_RATIO", certificate.reason_codes)

    def test_malformed_attestation_does_not_establish_its_existence(self) -> None:
        evidence = _valid_paxg_fixture()
        _evidence_for("reserve_attestation_timestamp", evidence).value = "not-a-date"

        certificate = verify_gold_backing("PAXG", evidence)

        self.assertEqual(VerificationResult.INDETERMINATE, certificate.result)
        self.assertIsNone(certificate.predicate_results[4].passed)
        self.assertIsNone(certificate.predicate_results[5].passed)
        self.assertEqual(
            ["INVALID_ATTESTATION_TIMESTAMP"], certificate.reason_codes
        )

    def test_cross_asset_evidence_is_not_used_for_the_claim(self) -> None:
        evidence = _valid_paxg_fixture()
        for record in evidence:
            record.asset = "USDY"

        certificate = verify_gold_backing("PAXG", evidence)

        self.assertEqual(VerificationResult.INDETERMINATE, certificate.result)
        self.assertEqual(0, certificate.independent_root_count)
        self.assertEqual(["MISSING_EVIDENCE"], certificate.reason_codes)

    def test_iso_timestamp_with_z_is_supported(self) -> None:
        evidence = _valid_paxg_fixture()
        _evidence_for("reserve_attestation_timestamp", evidence).value = (
            datetime.now(timezone.utc) - timedelta(days=1)
        ).isoformat().replace("+00:00", "Z")

        certificate = verify_gold_backing("PAXG", evidence)

        self.assertEqual(VerificationResult.PASS, certificate.result)


if __name__ == "__main__":
    unittest.main()
