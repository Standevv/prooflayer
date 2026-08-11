import unittest
from copy import deepcopy
from datetime import datetime, timedelta

from services.evidence_commitment import EVIDENCE_COMMITMENT_VERSION, compute_evidence_commitment
from services.provenance.engine import analyze_provenance
from services.rvc.models import EvidenceRecord, VerificationResult
from services.rvc.treasury_backing import verify_treasury_backing


def _valid_usdy_development_fixture() -> list[EvidenceRecord]:
    return [
        EvidenceRecord(
            source_id="ondo-product",
            source_type="issuer",
            root_source_id="ondo",
            asset="USDY",
            field="asset_class",
            value="TOKENIZED_TREASURY",
        ),
        EvidenceRecord(
            source_id="ondo-underlying",
            source_type="issuer",
            root_source_id="ondo",
            asset="USDY",
            field="underlying_asset_value",
            value=2_160_000_000,
            unit="USD",
        ),
        EvidenceRecord(
            source_id="ondo-outstanding",
            source_type="issuer",
            root_source_id="ondo",
            asset="USDY",
            field="outstanding_token_value",
            value=2_130_000_000,
            unit="USD",
        ),
        EvidenceRecord(
            source_id="ondo-collateralization",
            source_type="issuer",
            root_source_id="ondo",
            asset="USDY",
            field="collateralization_ratio",
            value=1.014,
        ),
        EvidenceRecord(
            source_id="ondo-treasury-exposure",
            source_type="issuer",
            root_source_id="ondo",
            asset="USDY",
            field="treasury_exposure",
            value=0.99,
        ),
        EvidenceRecord(
            source_id="ondo-attestation",
            source_type="attestation",
            root_source_id="ondo-attestation",
            asset="USDY",
            field="attestation_timestamp",
            value=datetime(2026, 8, 10, 12, 0, 0),
        ),
        EvidenceRecord(
            source_id="ondo-contract",
            source_type="onchain",
            root_source_id="ethereum",
            asset="USDY",
            field="issuer_contract_verified",
            value=True,
        ),
        EvidenceRecord(
            source_id="usdy-total-supply",
            source_type="onchain",
            root_source_id="ethereum",
            asset="USDY",
            field="onchain_supply",
            value=2_130_000_000,
            unit="USD",
        ),
    ]


def _evidence_for(field: str, evidence: list[EvidenceRecord]) -> EvidenceRecord:
    return next(record for record in evidence if record.field == field)


class CommitmentAndTrustTests(unittest.TestCase):
    def test_order_independent_commitment_is_stable(self) -> None:
        evidence = _valid_usdy_development_fixture()
        first = compute_evidence_commitment("USDY", "TreasuryBacking", evidence)
        second = compute_evidence_commitment(
            "USDY",
            "TreasuryBacking",
            list(reversed(evidence)),
        )
        self.assertEqual(first, second)
        self.assertEqual(EVIDENCE_COMMITMENT_VERSION, "pl-evidence-v1")

    def test_asset_or_claim_change_changes_the_commitment(self) -> None:
        evidence = _valid_usdy_development_fixture()
        treasury = compute_evidence_commitment("USDY", "TreasuryBacking", evidence)
        gold = compute_evidence_commitment("PAXG", "GoldBacking", evidence)
        self.assertNotEqual(treasury, gold)

    def test_root_spoofing_does_not_create_independent_root_count(self) -> None:
        evidence = [
            EvidenceRecord(
                source_id="malicious-source",
                source_type="issuer",
                root_source_id="not-ondo",
                asset="USDY",
                field="asset_class",
                value="TOKENIZED_TREASURY",
            )
        ]
        result = analyze_provenance(evidence)
        self.assertEqual(0, result.independent_root_count)
        self.assertEqual([], result.independent_root_ids)
        self.assertEqual(1, result.unknown_root_count)
        self.assertEqual(["malicious-source"], result.unknown_root_ids)

    def test_commitment_regression_matrix_stays_stable_and_changes_only_for_material_inputs(self) -> None:
        evidence = _valid_usdy_development_fixture()
        base = compute_evidence_commitment("USDY", "TreasuryBacking", evidence)

        shuffled = list(reversed(evidence))
        self.assertEqual(
            base,
            compute_evidence_commitment("USDY", "TreasuryBacking", shuffled),
        )

        dependency_reordered = deepcopy(evidence)
        dependency_reordered[0].dependency_parent_ids = ["ethereum", "ondo"]
        dependency_reordered[1].dependency_parent_ids = ["ondo"]
        self.assertEqual(
            base,
            compute_evidence_commitment("USDY", "TreasuryBacking", dependency_reordered),
        )

        material = deepcopy(evidence)
        material[1].value = 2_160_000_001
        self.assertNotEqual(
            base,
            compute_evidence_commitment("USDY", "TreasuryBacking", material),
        )

        timestamp = deepcopy(evidence)
        timestamp[5].value = datetime(2026, 8, 10, 12, 30)
        self.assertNotEqual(
            base,
            compute_evidence_commitment("USDY", "TreasuryBacking", timestamp),
        )

        asset_change = deepcopy(evidence)
        asset_change[0].asset = "PAXG"
        self.assertNotEqual(
            base,
            compute_evidence_commitment("USDY", "TreasuryBacking", asset_change),
        )

        claim_change = deepcopy(evidence)
        claim_one = compute_evidence_commitment("USDY", "TreasuryBacking", claim_change)
        claim_two = compute_evidence_commitment("USDY", "GoldBacking", claim_change)
        self.assertNotEqual(claim_one, claim_two)

        changed_root = deepcopy(evidence)
        changed_root[1].root_source_id = "ethereum"
        self.assertNotEqual(
            base,
            compute_evidence_commitment("USDY", "TreasuryBacking", changed_root),
        )

        added = list(evidence) + [
            EvidenceRecord(
                source_id="new-onchain", source_type="onchain",
                root_source_id="ethereum", asset="USDY", field="additional_supply",
                value=123,
            )
        ]
        self.assertNotEqual(
            base,
            compute_evidence_commitment("USDY", "TreasuryBacking", added),
        )

        metadata_only = deepcopy(evidence)
        metadata_only[0].metadata = {"display_only": "irrelevant"}
        self.assertEqual(
            base,
            compute_evidence_commitment("USDY", "TreasuryBacking", metadata_only),
        )


class TreasuryBackingTests(unittest.TestCase):
    def test_passes_with_valid_usdy_development_fixture(self) -> None:
        certificate = verify_treasury_backing(
            "USDY", _valid_usdy_development_fixture()
        )

        self.assertEqual(VerificationResult.PASS, certificate.result)
        self.assertEqual([], certificate.reason_codes)

    def test_fails_when_undercollateralized(self) -> None:
        evidence = _valid_usdy_development_fixture()
        _evidence_for("underlying_asset_value", evidence).value = 2_120_000_000

        certificate = verify_treasury_backing("USDY", evidence)

        self.assertEqual(VerificationResult.FAIL, certificate.result)
        self.assertEqual(["UNDERCOLLATERALIZED"], certificate.reason_codes)

    def test_fails_with_stale_attestation(self) -> None:
        evidence = _valid_usdy_development_fixture()
        _evidence_for("attestation_timestamp", evidence).value = (
            datetime.utcnow() - timedelta(hours=25)
        )

        certificate = verify_treasury_backing("USDY", evidence)

        self.assertEqual(VerificationResult.FAIL, certificate.result)
        self.assertEqual(["STALE_ATTESTATION"], certificate.reason_codes)

    def test_is_indeterminate_without_mandatory_evidence(self) -> None:
        evidence = [
            record
            for record in _valid_usdy_development_fixture()
            if record.field != "onchain_supply"
        ]

        certificate = verify_treasury_backing("USDY", evidence)

        self.assertEqual(VerificationResult.INDETERMINATE, certificate.result)
        self.assertEqual(["MISSING_EVIDENCE"], certificate.reason_codes)
        self.assertEqual("onchain_supply exists", certificate.predicate_results[0].predicate)
        self.assertIsNone(certificate.predicate_results[0].passed)

    def test_usdy_cannot_use_evidence_labeled_for_paxg(self) -> None:
        evidence = _valid_usdy_development_fixture()
        _evidence_for("onchain_supply", evidence).asset = "PAXG"

        certificate = verify_treasury_backing("USDY", evidence)

        self.assertEqual(VerificationResult.INDETERMINATE, certificate.result)
        self.assertEqual(["MISSING_EVIDENCE"], certificate.reason_codes)
        self.assertEqual("onchain_supply exists", certificate.predicate_results[0].predicate)

    def test_treasury_backing_rejects_unrelated_claim_evidence(self) -> None:
        evidence = _valid_usdy_development_fixture()
        _evidence_for("treasury_exposure", evidence).metadata["claim"] = "GoldBacking"

        certificate = verify_treasury_backing("USDY", evidence)

        self.assertEqual(VerificationResult.INDETERMINATE, certificate.result)
        self.assertEqual(["MISSING_EVIDENCE"], certificate.reason_codes)
        self.assertEqual("treasury_exposure exists", certificate.predicate_results[0].predicate)

    def test_ambiguous_or_missing_asset_identity_does_not_count(self) -> None:
        evidence = _valid_usdy_development_fixture()
        _evidence_for("issuer_contract_verified", evidence).asset = ""

        certificate = verify_treasury_backing("USDY", evidence)

        self.assertEqual(VerificationResult.INDETERMINATE, certificate.result)
        self.assertEqual(["MISSING_EVIDENCE"], certificate.reason_codes)
        self.assertEqual(
            "issuer_contract_verified exists",
            certificate.predicate_results[0].predicate,
        )

    def test_future_observed_evidence_beyond_clock_skew_is_rejected(self) -> None:
        evaluation_time = datetime(2026, 8, 10, 12, 0, 0)
        evidence = _valid_usdy_development_fixture()
        _evidence_for("onchain_supply", evidence).observed_at = evaluation_time + timedelta(
            minutes=6
        )

        certificate = verify_treasury_backing(
            "USDY", evidence, verification_time=evaluation_time
        )

        self.assertEqual(VerificationResult.INDETERMINATE, certificate.result)
        self.assertEqual(["FUTURE_EVIDENCE"], certificate.reason_codes)

    def test_attestation_within_clock_skew_is_handled_deterministically(self) -> None:
        evaluation_time = datetime(2026, 8, 10, 12, 0, 0)
        evidence = _valid_usdy_development_fixture()
        _evidence_for("attestation_timestamp", evidence).value = evaluation_time + timedelta(
            minutes=4
        )

        certificate = verify_treasury_backing(
            "USDY", evidence, verification_time=evaluation_time
        )

        self.assertEqual(VerificationResult.PASS, certificate.result)
        self.assertEqual([], certificate.reason_codes)
        self.assertEqual("0.00 hours", certificate.predicate_results[4].observed)

    def test_future_attestation_cannot_produce_pass(self) -> None:
        evaluation_time = datetime(2026, 8, 10, 12, 0, 0)
        evidence = _valid_usdy_development_fixture()
        _evidence_for("attestation_timestamp", evidence).value = evaluation_time + timedelta(
            minutes=6
        )

        certificate = verify_treasury_backing(
            "USDY", evidence, verification_time=evaluation_time
        )

        self.assertEqual(VerificationResult.INDETERMINATE, certificate.result)
        self.assertEqual(["FUTURE_ATTESTATION"], certificate.reason_codes)
        self.assertIsNone(certificate.predicate_results[4].passed)


if __name__ == "__main__":
    unittest.main()
