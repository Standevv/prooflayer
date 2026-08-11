import hashlib
import json
import unittest
from datetime import datetime
from decimal import Decimal

from services.evidence.ondo import get_usdy_evidence
from services.evidence.usdy_attestation import (
    ATTESTOR,
    AGREEMENT_DATE,
    DEFAULT_USDY_ATTESTATION_SNAPSHOT,
    UsdyAttestationError,
    load_usdy_attestation_snapshot,
    parse_usdy_attestation_snapshot,
)
from services.evidence_commitment import compute_evidence_commitment
from services.provenance.engine import analyze_provenance
from services.rvc.models import VerificationResult
from services.rvc.treasury_backing import verify_treasury_backing
from tests.test_agent_tools import FakeEthereumRpc


REPORT_TIMESTAMP = datetime(2026, 8, 6, 23, 59, 59)
RETRIEVED_AT = datetime(2026, 8, 11, 16, 35, 0)


def _snapshot() -> dict:
    return json.loads(DEFAULT_USDY_ATTESTATION_SNAPSHOT.read_text(encoding="utf-8"))


def _by_field(evidence) -> dict:
    return {item.field: item for item in evidence}


class UsdyAttestationAdapterTests(unittest.TestCase):
    def test_default_snapshot_normalizes_into_evidence_records(self) -> None:
        evidence = load_usdy_attestation_snapshot()

        self.assertEqual(4, len(evidence))
        self.assertEqual(
            {
                "attestation_timestamp",
                "attested_assets_value",
                "attested_token_principal_outstanding",
                "attested_collateralization_ratio",
            },
            {item.field for item in evidence},
        )

    def test_attestation_timestamp_comes_only_from_the_report_date(self) -> None:
        timestamp = _by_field(load_usdy_attestation_snapshot())["attestation_timestamp"]

        self.assertEqual(REPORT_TIMESTAMP, timestamp.value)
        self.assertEqual("attestation", timestamp.source_type)
        self.assertEqual("ankura", timestamp.root_source_id)
        self.assertEqual("A", timestamp.evidence_tier)
        self.assertEqual("cached_official_evidence", timestamp.metadata["cache_status"])
        self.assertEqual("2026-08-06", timestamp.metadata["report_date"])
        self.assertEqual("end_of_day", timestamp.metadata["report_date_semantics"])
        self.assertEqual(ATTESTOR, timestamp.metadata["attestor"])
        self.assertEqual(AGREEMENT_DATE, timestamp.metadata["agreement_date"])
        self.assertIn("Verification Agent", timestamp.metadata["attestor_role"])
        self.assertTrue(timestamp.metadata["independent_attestation"])
        self.assertFalse(timestamp.simulation)
        self.assertEqual(RETRIEVED_AT, timestamp.retrieved_at)
        self.assertTrue(timestamp.content_hash.startswith("sha256:"))

    def test_document_hash_matches_the_committed_report_pdf(self) -> None:
        pdf = (
            DEFAULT_USDY_ATTESTATION_SNAPSHOT.parent
            / "Ondo-USDY-LLC-ATCAttest-260806.pdf"
        )
        digest = "sha256:" + hashlib.sha256(pdf.read_bytes()).hexdigest()

        timestamp = _by_field(load_usdy_attestation_snapshot())["attestation_timestamp"]

        self.assertEqual(digest, timestamp.metadata["document_hash"])
        self.assertEqual(
            "Ondo-USDY-LLC-ATCAttest-260806.pdf",
            timestamp.metadata["document_file"],
        )

    def test_attested_facts_are_exact(self) -> None:
        records = _by_field(load_usdy_attestation_snapshot())

        self.assertEqual(
            Decimal("2143263821.31"), records["attested_assets_value"].value
        )
        self.assertEqual("USD", records["attested_assets_value"].unit)
        self.assertEqual(
            Decimal("2136672622.058660"),
            records["attested_token_principal_outstanding"].value,
        )
        self.assertEqual(
            Decimal("1.003085"), records["attested_collateralization_ratio"].value
        )
        for item in records.values():
            self.assertEqual("ankura", item.root_source_id)
            self.assertEqual("attestation", item.source_type)
            self.assertFalse(item.simulation)

    def test_attestation_creates_an_independent_third_root(self) -> None:
        evidence = get_usdy_evidence(
            rpc_call=FakeEthereumRpc(),
            attestation_path=DEFAULT_USDY_ATTESTATION_SNAPSHOT,
        )

        provenance = analyze_provenance(evidence)

        self.assertEqual(3, provenance.independent_root_count)
        self.assertEqual(["ankura", "ethereum", "ondo"], provenance.independent_root_ids)
        self.assertEqual(0, provenance.unknown_root_count)
        self.assertFalse(provenance.malformed)
        self.assertEqual([], provenance.validation_errors)

    def test_composed_evidence_reaches_rvc_but_stale_attestation_blocks_pass(
        self,
    ) -> None:
        evidence = get_usdy_evidence(
            rpc_call=FakeEthereumRpc(),
            attestation_path=DEFAULT_USDY_ATTESTATION_SNAPSHOT,
        )

        self.assertEqual(13, len(evidence))
        certificate = verify_treasury_backing("USDY", evidence)

        self.assertEqual(VerificationResult.FAIL, certificate.result)
        self.assertEqual(["STALE_ATTESTATION"], certificate.reason_codes)
        self.assertEqual(3, certificate.independent_root_count)
        self.assertFalse(certificate.simulation_flag)
        non_age = [
            item
            for item in certificate.predicate_results
            if item.predicate != "attestation.age <= policy.max_age"
        ]
        self.assertTrue(non_age)
        self.assertTrue(all(item.passed is True for item in non_age))

    def test_commitment_is_order_independent_and_changes_with_attestation(self) -> None:
        evidence = get_usdy_evidence(
            rpc_call=FakeEthereumRpc(),
            attestation_path=DEFAULT_USDY_ATTESTATION_SNAPSHOT,
        )
        without = get_usdy_evidence(rpc_call=FakeEthereumRpc())

        first = compute_evidence_commitment("USDY", "TreasuryBacking", evidence)
        second = compute_evidence_commitment(
            "USDY", "TreasuryBacking", list(reversed(evidence))
        )
        base = compute_evidence_commitment("USDY", "TreasuryBacking", without)

        self.assertEqual(first, second)
        self.assertNotEqual(first, base)

    def test_malformed_or_unofficial_snapshot_data_fails_safely(self) -> None:
        cases = []

        wrong_schema = _snapshot()
        wrong_schema["schema_version"] = 2
        cases.append(wrong_schema)

        unofficial_url = _snapshot()
        unofficial_url["attestation"]["source_url"] = "https://example.com/report.pdf"
        cases.append(unofficial_url)

        wrong_attestor = _snapshot()
        wrong_attestor["attestation"]["attestor"] = "Ondo Finance"
        cases.append(wrong_attestor)

        no_date = _snapshot()
        del no_date["attestation"]["report_date"]
        cases.append(no_date)

        bad_date = _snapshot()
        bad_date["attestation"]["report_date"] = "2026/08/06"
        cases.append(bad_date)

        wrong_semantics = _snapshot()
        wrong_semantics["attestation"]["report_date_semantics"] = "published_at"
        cases.append(wrong_semantics)

        bad_hash = _snapshot()
        bad_hash["attestation"]["document_hash"] = "md5:abc"
        cases.append(bad_hash)

        missing_fact = _snapshot()
        del missing_fact["attestation"]["facts"]["permitted_assets_market_value"]
        cases.append(missing_fact)

        for snapshot in cases:
            with self.subTest(snapshot=snapshot):
                with self.assertRaises(UsdyAttestationError):
                    parse_usdy_attestation_snapshot(snapshot)

    def test_no_timestamp_is_inferred_from_retrieval_time(self) -> None:
        snapshot = _snapshot()
        del snapshot["attestation"]["report_date"]

        with self.assertRaises(UsdyAttestationError):
            parse_usdy_attestation_snapshot(snapshot)


if __name__ == "__main__":
    unittest.main()
