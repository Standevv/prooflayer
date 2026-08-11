import copy
import json
import unittest
from datetime import datetime, timezone
from decimal import Decimal
from unittest import mock

from services.evidence.paxos import (
    DEFAULT_PAXG_SNAPSHOT,
    ETHEREUM_PAXG_ADDRESS,
    KPMG_PAXG_JUNE_2026_REPORT_SHA256,
    PAXG_DECIMALS,
    PAXOS_PAXG_MAINNET_URL,
    PAXOS_PAXG_MAINNET_SHA256,
    PAXOS_PAXG_PRODUCT_URL,
    PaxosAdapterError,
    get_paxg_evidence,
    parse_paxg_official_snapshot,
    read_paxg_onchain_evidence,
    read_paxg_onchain_supply,
)
from services.provenance.engine import analyze_provenance
from services.rvc.gold_backing import verify_gold_backing
from services.rvc.models import EvidenceRecord, VerificationResult


WRONG_ADDRESS = "0x0000000000000000000000000000000000000001"
RPC_RETRIEVED_AT = datetime(2026, 8, 8, 13, 11, 31, tzinfo=timezone.utc)


def _snapshot() -> dict:
    return json.loads(DEFAULT_PAXG_SNAPSHOT.read_text(encoding="utf-8"))


def _by_field(evidence: list[EvidenceRecord]) -> dict[str, EvidenceRecord]:
    return {item.field: item for item in evidence}


class MockEthereumRpc:
    """Deterministic JSON-RPC responses; no unit test touches the network."""

    block_number = 25_710_174
    block_tag = hex(block_number)
    block_timestamp = 1_786_190_075
    raw_total_supply = 452_151_123_456_789_012_345_678

    def __init__(self, *, code: str = "0x6001600055", chain_id: int = 1) -> None:
        self.code = code
        self.chain_id = chain_id
        self.calls: list[tuple[str, list]] = []

    def __call__(self, method: str, params: list):
        self.calls.append((method, params))
        if method == "eth_chainId":
            return hex(self.chain_id)
        if method == "eth_blockNumber":
            return self.block_tag
        if method == "eth_getBlockByNumber":
            return {
                "number": self.block_tag,
                "timestamp": hex(self.block_timestamp),
                "hash": "0x" + "ab" * 32,
            }
        if method == "eth_getCode":
            return self.code
        if method == "eth_call" and params[0]["data"] == "0x18160ddd":
            return "0x" + format(self.raw_total_supply, "064x")
        raise AssertionError(f"unexpected RPC call: {method} {params}")


class PaxosAdapterTests(unittest.TestCase):
    def test_official_snapshot_normalizes_into_evidence_records(self) -> None:
        evidence = get_paxg_evidence()

        self.assertEqual(12, len(evidence))
        self.assertTrue(all(isinstance(item, EvidenceRecord) for item in evidence))
        self.assertEqual(
            {
                "asset_class",
                "reserve_asset",
                "fine_troy_ounces_per_token",
                "official_contract_address",
                "allocated_gold_oz",
                "attested_total_redeemable_supply",
                "circulating_token_supply",
                "attested_ethereum_token_supply",
                "attested_solana_token_supply",
                "reported_surplus_deficit_oz",
                "backing_ratio",
                "reserve_attestation_timestamp",
            },
            {item.field for item in evidence},
        )

    def test_snapshot_records_preserve_official_provenance(self) -> None:
        evidence = get_paxg_evidence()

        for item in evidence:
            with self.subTest(field=item.field):
                self.assertEqual("PAXG", item.asset)
                self.assertIn(item.source_type, {"issuer", "attestation"})
                self.assertIn(item.root_source_id, {"paxos", "kpmg"})
                self.assertIsNotNone(item.observed_at)
                self.assertEqual(RPC_RETRIEVED_AT, item.retrieved_at)
                self.assertEqual(
                    "cached_official_evidence", item.metadata["cache_status"]
                )
                self.assertTrue(item.metadata["source_url"].startswith("https://"))
                self.assertFalse(item.simulation)

        records = _by_field(evidence)
        self.assertEqual(
            PAXOS_PAXG_PRODUCT_URL,
            records["fine_troy_ounces_per_token"].metadata["source_url"],
        )
        self.assertEqual(
            PAXOS_PAXG_MAINNET_URL,
            records["official_contract_address"].metadata["source_url"],
        )
        self.assertEqual(
            PAXOS_PAXG_MAINNET_SHA256,
            records["official_contract_address"].content_hash,
        )
        self.assertEqual(
            KPMG_PAXG_JUNE_2026_REPORT_SHA256,
            records["allocated_gold_oz"].content_hash,
        )

    def test_multiple_paxos_pages_collapse_to_one_paxos_root(self) -> None:
        evidence = [item for item in get_paxg_evidence() if item.root_source_id == "paxos"]
        provenance = analyze_provenance(evidence)

        self.assertEqual(1, provenance.independent_root_count)
        self.assertEqual(["paxos"], provenance.independent_root_ids)
        self.assertEqual(
            [
                "paxos-paxg-contract-address-snapshot",
                "paxos-paxg-product-snapshot",
            ],
            provenance.dependency_groups["paxos"],
        )

    def test_kpmg_report_values_are_parsed_exactly(self) -> None:
        records = _by_field(get_paxg_evidence())

        self.assertEqual(Decimal("452355"), records["allocated_gold_oz"].value)
        self.assertEqual(
            Decimal("452355"),
            records["attested_total_redeemable_supply"].value,
        )
        self.assertEqual(
            Decimal("452355"), records["circulating_token_supply"].value
        )
        self.assertEqual(
            "global_ethereum_and_solana",
            records["circulating_token_supply"].metadata["chain_scope"],
        )
        self.assertEqual(
            Decimal("452151"), records["attested_ethereum_token_supply"].value
        )
        self.assertEqual(
            Decimal("204"), records["attested_solana_token_supply"].value
        )
        self.assertEqual(Decimal("1"), records["backing_ratio"].value)
        self.assertEqual(
            datetime(2026, 6, 30, 21, 0, tzinfo=timezone.utc),
            records["reserve_attestation_timestamp"].value,
        )
        self.assertEqual(
            "2026-07-24", records["allocated_gold_oz"].metadata["issued_on"]
        )
        self.assertEqual(
            "day",
            records["allocated_gold_oz"].metadata["issued_on_precision"],
        )
        self.assertNotIn("issued_at", records["allocated_gold_oz"].metadata)
        self.assertEqual(
            records["attested_total_redeemable_supply"].value,
            records["attested_ethereum_token_supply"].value
            + records["attested_solana_token_supply"].value,
        )

    def test_attestation_is_independently_identified_as_kpmg(self) -> None:
        report_records = [
            item for item in get_paxg_evidence() if item.root_source_id == "kpmg"
        ]

        self.assertTrue(report_records)
        self.assertTrue(all(item.source_type == "attestation" for item in report_records))
        self.assertTrue(
            all(
                item.metadata["evidence_role"] == "independent_auditor_examination"
                for item in report_records
            )
        )
        self.assertTrue(
            all(item.metadata["auditor"] == "KPMG LLP" for item in report_records)
        )
        backing_ratio = _by_field(report_records)["backing_ratio"]
        self.assertEqual(
            ["paxos-paxg-product-snapshot"],
            backing_ratio.dependency_parent_ids,
        )
        self.assertEqual(
            backing_ratio.dependency_parent_ids,
            backing_ratio.metadata["dependency_parent_ids"],
        )

    def test_canonical_address_is_exact_and_listing_alone_is_not_verification(self) -> None:
        records = _by_field(get_paxg_evidence())

        self.assertEqual(
            "0x45804880De22913dAFE09f4980848ECE6EcbAf78",
            ETHEREUM_PAXG_ADDRESS,
        )
        self.assertEqual(
            ETHEREUM_PAXG_ADDRESS,
            records["official_contract_address"].value,
        )
        self.assertEqual(18, PAXG_DECIMALS)
        self.assertNotIn("issuer_contract_verified", records)
        self.assertNotIn("onchain_supply", records)

    def test_cached_evidence_is_visibly_identifiable(self) -> None:
        snapshot = _snapshot()
        evidence = get_paxg_evidence()

        self.assertEqual("cached_official_evidence", snapshot["cache_status"])
        self.assertIn("Cached official evidence", snapshot["snapshot_note"])
        self.assertTrue(all("snapshot" in item.source_id or item.root_source_id == "kpmg" for item in evidence))
        self.assertTrue(all(item.retrieved_at is not None for item in evidence))
        self.assertTrue(all(item.content_hash is not None for item in evidence))

    def test_malformed_or_unofficial_snapshot_data_fails_safely(self) -> None:
        malformed_cases: list[dict] = []

        unofficial_url = _snapshot()
        unofficial_url["product_claims"]["source_url"] = "https://example.com/paxg"
        malformed_cases.append(unofficial_url)

        truncated_address = _snapshot()
        truncated_address["contract_listing"]["contract_address"] = "0x4580...Af78"
        malformed_cases.append(truncated_address)

        wrong_report_digest = _snapshot()
        wrong_report_digest["reserve_attestation"]["artifact_sha256"] = (
            "sha256:" + "00" * 32
        )
        malformed_cases.append(wrong_report_digest)

        different_framer_report = _snapshot()
        different_framer_report["reserve_attestation"]["artifact_url"] = (
            "https://framerusercontent.com/assets/DifferentOfficialLookingReport.pdf"
        )
        malformed_cases.append(different_framer_report)

        malformed_reserves = _snapshot()
        malformed_reserves["reserve_attestation"]["allocated_gold_oz"] = "unknown"
        malformed_cases.append(malformed_reserves)

        altered_report_fact = _snapshot()
        altered_report_fact["reserve_attestation"]["allocated_gold_oz"] = "452356"
        malformed_cases.append(altered_report_fact)

        altered_report_value = _snapshot()
        altered_report_value["reserve_attestation"]["allocated_gold_oz"] = "452354"
        malformed_cases.append(altered_report_value)

        unsupported_auditor = _snapshot()
        unsupported_auditor["reserve_attestation"]["auditor"] = "Paxos"
        malformed_cases.append(unsupported_auditor)

        for snapshot in malformed_cases:
            with self.subTest(snapshot=snapshot):
                with self.assertRaises(PaxosAdapterError):
                    parse_paxg_official_snapshot(snapshot)

    def test_adapter_never_fabricates_absent_reserve_fields(self) -> None:
        snapshot = copy.deepcopy(_snapshot())
        del snapshot["reserve_attestation"]["allocated_gold_oz"]
        del snapshot["reserve_attestation"]["attested_total_redeemable_supply"]

        fields = {item.field for item in parse_paxg_official_snapshot(snapshot)}

        self.assertNotIn("allocated_gold_oz", fields)
        self.assertNotIn("backing_ratio", fields)
        self.assertNotIn("circulating_token_supply", fields)
        self.assertNotIn("issuer_contract_verified", fields)

    def test_backing_ratio_is_not_derived_without_explicit_one_to_one_evidence(self) -> None:
        snapshot = copy.deepcopy(_snapshot())
        del snapshot["product_claims"]["fine_troy_ounces_per_token"]

        fields = {item.field for item in parse_paxg_official_snapshot(snapshot)}

        self.assertNotIn("fine_troy_ounces_per_token", fields)
        self.assertNotIn("backing_ratio", fields)

    def test_canonical_address_plus_bytecode_is_verified(self) -> None:
        records = _by_field(
            read_paxg_onchain_evidence(
                MockEthereumRpc(),
                retrieved_at=RPC_RETRIEVED_AT,
            )
        )

        verification = records["issuer_contract_verified"]
        self.assertTrue(verification.value)
        self.assertEqual("paxos", verification.root_source_id)
        self.assertEqual(
            ["paxos-paxg-contract-address-snapshot"],
            verification.dependency_parent_ids,
        )
        self.assertTrue(verification.metadata["official_address_match"])
        self.assertTrue(verification.metadata["deployed_bytecode"])
        self.assertEqual(
            PAXOS_PAXG_MAINNET_SHA256,
            verification.metadata["official_content_hash"],
        )

    def test_wrong_address_is_not_verified_or_misattributed_as_paxg_supply(self) -> None:
        records = _by_field(
            read_paxg_onchain_evidence(
                MockEthereumRpc(),
                token_address=WRONG_ADDRESS,
                retrieved_at=RPC_RETRIEVED_AT,
            )
        )

        self.assertFalse(records["issuer_contract_verified"].value)
        self.assertNotIn("onchain_supply", records)

    def test_total_supply_normalization_is_exact_and_ethereum_scoped(self) -> None:
        rpc = MockEthereumRpc()
        supply = read_paxg_onchain_supply(rpc, retrieved_at=RPC_RETRIEVED_AT)

        self.assertEqual("onchain_supply", supply.field)
        self.assertEqual(Decimal("452151.123456789012345678"), supply.value)
        self.assertEqual("PAXG", supply.unit)
        self.assertEqual("onchain", supply.source_type)
        self.assertEqual("ethereum", supply.root_source_id)
        self.assertEqual("ethereum", supply.metadata["chain_scope"])
        self.assertFalse(supply.metadata["global_supply"])
        self.assertEqual(18, supply.metadata["decimals"])
        self.assertEqual(
            ETHEREUM_PAXG_ADDRESS, supply.metadata["contract_address"]
        )
        self.assertEqual(1, supply.metadata["chain_id"])

    def test_no_bytecode_produces_false_verification_and_no_supply(self) -> None:
        rpc = MockEthereumRpc(code="0x")
        records = _by_field(
            read_paxg_onchain_evidence(rpc, retrieved_at=RPC_RETRIEVED_AT)
        )

        self.assertFalse(records["issuer_contract_verified"].value)
        self.assertNotIn("onchain_supply", records)
        self.assertFalse(any(method == "eth_call" for method, _ in rpc.calls))
        with self.assertRaises(PaxosAdapterError):
            read_paxg_onchain_supply(
                MockEthereumRpc(code="0x"), retrieved_at=RPC_RETRIEVED_AT
            )

    def test_malformed_rpc_data_fails_safely(self) -> None:
        class MalformedSupplyRpc(MockEthereumRpc):
            def __call__(self, method: str, params: list):
                if method == "eth_call":
                    return "0x1234"
                return super().__call__(method, params)

        for rpc in (MockEthereumRpc(chain_id=2), MalformedSupplyRpc()):
            with self.subTest(rpc=rpc):
                with self.assertRaises(PaxosAdapterError):
                    read_paxg_onchain_supply(rpc)

    def test_augmented_provenance_distinguishes_three_roots(self) -> None:
        evidence = get_paxg_evidence(
            rpc_call=MockEthereumRpc(),
            rpc_retrieved_at=RPC_RETRIEVED_AT,
        )
        provenance = analyze_provenance(evidence)

        self.assertEqual(3, provenance.independent_root_count)
        self.assertEqual(["ethereum", "kpmg", "paxos"], provenance.independent_root_ids)
        self.assertIn("ethereum", provenance.dependency_groups)
        self.assertIn("kpmg", provenance.dependency_groups)
        self.assertIn("paxos", provenance.dependency_groups)

    def test_normalized_output_can_be_passed_directly_to_gold_verifier(self) -> None:
        cached_certificate = verify_gold_backing("PAXG", get_paxg_evidence())
        augmented = get_paxg_evidence(
            rpc_call=MockEthereumRpc(),
            rpc_retrieved_at=RPC_RETRIEVED_AT,
        )
        stale_augmented_certificate = verify_gold_backing("PAXG", augmented)
        augmented_certificate = verify_gold_backing(
            "PAXG", augmented, max_attestation_age_days=1_000_000
        )

        self.assertEqual(VerificationResult.INDETERMINATE, cached_certificate.result)
        self.assertIn("MISSING_EVIDENCE", cached_certificate.reason_codes)
        self.assertIn("STALE_ATTESTATION", cached_certificate.reason_codes)
        self.assertEqual(
            VerificationResult.INDETERMINATE,
            stale_augmented_certificate.result,
        )
        self.assertEqual(
            ["STALE_ATTESTATION"], stale_augmented_certificate.reason_codes
        )
        self.assertEqual(VerificationResult.PASS, augmented_certificate.result)
        self.assertEqual(3, augmented_certificate.independent_root_count)

    def test_rpc_augmentation_requires_address_evidence_from_snapshot(self) -> None:
        snapshot = _snapshot()
        del snapshot["contract_listing"]
        temporary_path = DEFAULT_PAXG_SNAPSHOT.parent / "missing-address-test.json"

        # Exercise the public path without creating a second persistent fixture.
        with mock.patch(
            "services.evidence.paxos._load_paxg_snapshot_document",
            return_value=(snapshot, "sha256:" + "ab" * 32),
        ):
            with self.assertRaisesRegex(PaxosAdapterError, "official PAXG contract"):
                get_paxg_evidence(
                    temporary_path,
                    rpc_call=MockEthereumRpc(),
                    rpc_retrieved_at=RPC_RETRIEVED_AT,
                )


if __name__ == "__main__":
    unittest.main()
