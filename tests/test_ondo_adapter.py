import copy
import json
import unittest
from datetime import datetime, timezone
from decimal import Decimal

from services.evidence.ondo import (
    DEFAULT_USDY_SNAPSHOT,
    ETHEREUM_USDY_ADDRESS,
    ONDO_ADDRESSES_URL,
    OndoAdapterError,
    get_live_usdy_contract_address,
    get_live_usdy_contract_evidence,
    get_usdy_evidence,
    parse_official_usdy_ethereum_address,
    parse_usdy_official_snapshot,
    read_usdy_onchain_evidence,
    read_usdy_onchain_supply,
)
from services.provenance.engine import analyze_provenance
from services.rvc.models import EvidenceRecord, VerificationResult
from services.rvc.treasury_backing import verify_treasury_backing


OFFICIAL_ADDRESSES_MARKDOWN = f"""
## USDY

### Ethereum

| Contract/address name | Address | Source code | Description |
| :-- | :-- | :-- | :-- |
| USDY | [`{ETHEREUM_USDY_ADDRESS}`](https://etherscan.io/token/{ETHEREUM_USDY_ADDRESS}) | Etherscan | The USDY token on Ethereum |
| rUSDY | `0xaf37c1167910ebC994e266949387d2c7C326b879` | Etherscan | Rebasing USDY |

### BNB Chain
"""

RPC_RETRIEVED_AT = datetime(2026, 8, 8, 12, 17, 26, tzinfo=timezone.utc)


def _snapshot() -> dict:
    return json.loads(DEFAULT_USDY_SNAPSHOT.read_text(encoding="utf-8"))


def _by_field(evidence: list[EvidenceRecord]) -> dict[str, EvidenceRecord]:
    return {item.field: item for item in evidence}


class CapturedEthereumRpc:
    """Deterministic Ethereum responses captured for offline unit tests."""

    block_tag = "0x1884e5e"
    block_timestamp = "0x6a771dab"
    raw_total_supply = 971_535_697_170_034_516_449_071_459

    def __init__(self, *, code: str = "0x6001600055") -> None:
        self.code = code
        self.calls: list[tuple[str, list]] = []

    def __call__(self, method: str, params: list):
        self.calls.append((method, params))
        if method == "eth_chainId":
            return "0x1"
        if method == "eth_blockNumber":
            return self.block_tag
        if method == "eth_getBlockByNumber":
            return {"number": self.block_tag, "timestamp": self.block_timestamp}
        if method == "eth_getCode":
            return self.code
        if method == "eth_call" and params[0]["data"] == "0x18160ddd":
            return "0x" + format(self.raw_total_supply, "064x")
        raise AssertionError(f"unexpected RPC call: {method} {params}")


class OndoAdapterTests(unittest.TestCase):
    def test_official_snapshot_normalizes_into_evidence_records(self) -> None:
        evidence = get_usdy_evidence()

        self.assertEqual(7, len(evidence))
        self.assertTrue(all(isinstance(item, EvidenceRecord) for item in evidence))
        self.assertEqual(
            {
                "asset_class",
                "underlying_asset_value",
                "outstanding_token_value",
                "collateralization_ratio",
                "treasury_exposure",
                "portfolio_observation_timestamp",
                "official_contract_address",
            },
            {item.field for item in evidence},
        )
        self.assertNotIn("attestation_timestamp", _by_field(evidence))
        self.assertNotIn("issuer_contract_verified", _by_field(evidence))

    def test_all_snapshot_records_preserve_source_provenance(self) -> None:
        evidence = get_usdy_evidence()

        for item in evidence:
            with self.subTest(field=item.field):
                self.assertEqual("USDY", item.asset)
                self.assertEqual("issuer", item.source_type)
                self.assertEqual("ondo", item.root_source_id)
                self.assertTrue(item.source_id.endswith("-snapshot"))
                self.assertIsNotNone(item.observed_at)
                self.assertEqual(RPC_RETRIEVED_AT, item.retrieved_at)
                self.assertRegex(item.content_hash or "", r"^sha256:[0-9a-f]{64}$")
                self.assertEqual(
                    "cached_official_evidence", item.metadata["cache_status"]
                )
                expected_url = (
                    ONDO_ADDRESSES_URL
                    if item.field == "official_contract_address"
                    else "https://ondo.finance/usdy"
                )
                self.assertEqual(expected_url, item.metadata["source_url"])
                self.assertFalse(item.simulation)

        records = _by_field(evidence)
        self.assertEqual("USD", records["underlying_asset_value"].unit)
        self.assertEqual("USD", records["outstanding_token_value"].unit)

    def test_multiple_ondo_observations_collapse_to_one_root(self) -> None:
        provenance = analyze_provenance(get_usdy_evidence())

        self.assertEqual(1, provenance.independent_root_count)
        self.assertEqual(["ondo"], provenance.independent_root_ids)
        self.assertEqual(
            ["ondo-contract-addresses-snapshot", "ondo-usdy-product-snapshot"],
            provenance.dependency_groups["ondo"],
        )

    def test_numeric_financial_fields_are_parsed_without_rounding(self) -> None:
        records = _by_field(get_usdy_evidence())

        underlying = Decimal("2152385078.71")
        treasury_value = Decimal("2140779319.43")
        self.assertEqual(underlying, records["underlying_asset_value"].value)
        self.assertEqual(
            Decimal("2136672622.05866"),
            records["outstanding_token_value"].value,
        )
        self.assertEqual(Decimal("1.044"), records["collateralization_ratio"].value)
        self.assertEqual(
            treasury_value / underlying,
            records["treasury_exposure"].value,
        )
        observation = records["portfolio_observation_timestamp"]
        self.assertEqual(datetime(2026, 8, 6, 23, 59, 59), observation.value)
        self.assertEqual(
            "issuer_portfolio_observation",
            observation.metadata["timestamp_semantics"],
        )
        self.assertFalse(observation.metadata["independent_attestation"])

    def test_published_ratio_is_not_recomputed_from_portfolio_totals(self) -> None:
        snapshot = _snapshot()
        snapshot["portfolio"]["underlying_asset_value"] = "200"
        snapshot["portfolio"]["outstanding_token_value"] = "100"
        snapshot["portfolio"]["positions"] = []

        ratio = _by_field(parse_usdy_official_snapshot(snapshot))[
            "collateralization_ratio"
        ]

        self.assertEqual(Decimal("1.044"), ratio.value)

    def test_malformed_or_unofficial_snapshot_data_fails_safely(self) -> None:
        malformed_cases = []

        malformed_number = _snapshot()
        malformed_number["portfolio"]["underlying_asset_value"] = "not-a-number"
        malformed_cases.append(malformed_number)

        unofficial_url = _snapshot()
        unofficial_url["portfolio"]["source_url"] = "https://example.com/usdy"
        malformed_cases.append(unofficial_url)

        truncated_contract = _snapshot()
        truncated_contract["contract_listing"]["contract_address"] = "0x96F6...985C"
        malformed_cases.append(truncated_contract)

        malformed_position = _snapshot()
        malformed_position["portfolio"]["positions"].append("not-an-object")
        malformed_cases.append(malformed_position)

        for snapshot in malformed_cases:
            with self.subTest(snapshot=snapshot):
                with self.assertRaises(OndoAdapterError):
                    parse_usdy_official_snapshot(snapshot)

        overlong_address = OFFICIAL_ADDRESSES_MARKDOWN.replace(
            ETHEREUM_USDY_ADDRESS,
            ETHEREUM_USDY_ADDRESS + "ff",
            1,
        )
        with self.assertRaises(OndoAdapterError):
            parse_official_usdy_ethereum_address(overlong_address)

        with self.assertRaisesRegex(
            OndoAdapterError, "addresses_retrieved_at requires"
        ):
            get_usdy_evidence(addresses_retrieved_at="not-a-timestamp")

    def test_adapter_never_fabricates_absent_fields(self) -> None:
        snapshot = copy.deepcopy(_snapshot())
        del snapshot["portfolio"]["outstanding_token_value"]
        del snapshot["portfolio"]["collateralization_ratio_percent"]
        del snapshot["portfolio"]["positions"]
        del snapshot["contract_listing"]

        fields = {item.field for item in parse_usdy_official_snapshot(snapshot)}

        self.assertNotIn("outstanding_token_value", fields)
        self.assertNotIn("collateralization_ratio", fields)
        self.assertNotIn("treasury_exposure", fields)
        self.assertNotIn("issuer_contract_verified", fields)
        self.assertNotIn("official_contract_address", fields)
        self.assertNotIn("attestation_timestamp", fields)
        self.assertNotIn("onchain_supply", fields)

    def test_snapshot_output_can_be_passed_directly_to_verifier(self) -> None:
        certificate = verify_treasury_backing("USDY", get_usdy_evidence())

        self.assertEqual(VerificationResult.INDETERMINATE, certificate.result)
        self.assertEqual(["MISSING_EVIDENCE"], certificate.reason_codes)
        self.assertEqual(
            [
                "attestation_timestamp exists",
                "issuer_contract_verified exists",
                "onchain_supply exists",
            ],
            [result.predicate for result in certificate.predicate_results],
        )

    def test_cached_evidence_is_visibly_identifiable(self) -> None:
        snapshot = _snapshot()
        evidence = get_usdy_evidence()

        self.assertEqual("cached_official_evidence", snapshot["cache_status"])
        self.assertTrue(all("snapshot" in item.source_id for item in evidence))
        self.assertTrue(all(item.retrieved_at is not None for item in evidence))
        self.assertTrue(all(item.content_hash is not None for item in evidence))

    def test_official_markdown_yields_address_but_not_verification(self) -> None:
        requested_urls: list[str] = []

        def fake_http_get(url: str) -> str:
            requested_urls.append(url)
            return OFFICIAL_ADDRESSES_MARKDOWN

        parsed_address = parse_official_usdy_ethereum_address(
            OFFICIAL_ADDRESSES_MARKDOWN
        )
        fetched_address = get_live_usdy_contract_address(http_get=fake_http_get)
        listing_only = get_usdy_evidence(
            addresses_markdown=OFFICIAL_ADDRESSES_MARKDOWN,
            addresses_retrieved_at=RPC_RETRIEVED_AT,
        )

        self.assertEqual(ETHEREUM_USDY_ADDRESS, parsed_address)
        self.assertEqual(ETHEREUM_USDY_ADDRESS, fetched_address)
        self.assertEqual([ONDO_ADDRESSES_URL], requested_urls)
        self.assertNotIn("issuer_contract_verified", _by_field(listing_only))
        self.assertEqual(
            ETHEREUM_USDY_ADDRESS,
            _by_field(listing_only)["official_contract_address"].value,
        )

        with self.assertRaisesRegex(OndoAdapterError, "RPC deployed-code check"):
            get_live_usdy_contract_evidence(http_get=fake_http_get)

    def test_live_address_and_rpc_provenance_are_consistent(self) -> None:
        evidence = get_live_usdy_contract_evidence(
            http_get=lambda url: OFFICIAL_ADDRESSES_MARKDOWN,
            rpc_call=CapturedEthereumRpc(),
            retrieved_at=RPC_RETRIEVED_AT,
        )

        self.assertTrue(evidence.value)
        self.assertEqual("ondo", evidence.root_source_id)
        self.assertEqual(["ondo-contract-addresses"], evidence.dependency_parent_ids)
        self.assertEqual(
            evidence.dependency_parent_ids,
            evidence.metadata["dependency_parent_ids"],
        )
        self.assertEqual(
            "ondo-contract-addresses", evidence.metadata["official_source_id"]
        )
        self.assertEqual(
            "live_official_evidence",
            evidence.metadata["official_address_cache_status"],
        )

    def test_provided_address_and_rpc_dependency_ids_are_consistent(self) -> None:
        records = _by_field(
            get_usdy_evidence(
                addresses_markdown=OFFICIAL_ADDRESSES_MARKDOWN,
                addresses_retrieved_at=RPC_RETRIEVED_AT,
                rpc_call=CapturedEthereumRpc(),
                rpc_retrieved_at=RPC_RETRIEVED_AT,
            )
        )
        address = records["official_contract_address"]
        verification = records["issuer_contract_verified"]

        self.assertEqual("ondo-contract-addresses-provided", address.source_id)
        self.assertEqual(
            "provided_official_evidence", address.metadata["cache_status"]
        )
        self.assertEqual(
            [address.source_id], verification.dependency_parent_ids
        )
        self.assertEqual(
            verification.dependency_parent_ids,
            verification.metadata["dependency_parent_ids"],
        )
        self.assertEqual(
            verification.metadata["official_address_content_hash"],
            verification.metadata["official_content_hash"],
        )

    def test_onchain_supply_uses_pinned_block_and_exact_decimals(self) -> None:
        rpc = CapturedEthereumRpc()

        evidence = read_usdy_onchain_supply(
            rpc,
            retrieved_at=RPC_RETRIEVED_AT,
        )

        self.assertEqual("onchain_supply", evidence.field)
        self.assertEqual(Decimal("971535697.170034516449071459"), evidence.value)
        self.assertEqual("USDY", evidence.unit)
        self.assertEqual("onchain", evidence.source_type)
        self.assertEqual("ethereum", evidence.root_source_id)
        self.assertEqual(
            datetime(2026, 8, 8, 12, 14, 35, tzinfo=timezone.utc),
            evidence.observed_at,
        )
        self.assertEqual(int(rpc.block_tag, 16), evidence.metadata["block_number"])
        self.assertEqual(ETHEREUM_USDY_ADDRESS, evidence.metadata["contract_address"])
        self.assertEqual(1, evidence.metadata["chain_id"])
        self.assertEqual("injected-ethereum-rpc", evidence.metadata["rpc_source"])

        eth_calls = [params for method, params in rpc.calls if method == "eth_call"]
        code_calls = [params for method, params in rpc.calls if method == "eth_getCode"]
        self.assertEqual(1, len(eth_calls))
        self.assertEqual(1, len(code_calls))
        self.assertEqual(rpc.block_tag, eth_calls[0][1])
        self.assertEqual(rpc.block_tag, code_calls[0][1])

    def test_contract_verification_requires_deployed_bytecode(self) -> None:
        cached_only = _by_field(get_usdy_evidence())
        no_code_rpc = CapturedEthereumRpc(code="0x")
        no_code = _by_field(
            get_usdy_evidence(
                rpc_call=no_code_rpc,
                rpc_retrieved_at=RPC_RETRIEVED_AT,
            )
        )
        deployed = _by_field(
            read_usdy_onchain_evidence(
                CapturedEthereumRpc(code="0x6000"),
                retrieved_at=RPC_RETRIEVED_AT,
            )
        )

        self.assertNotIn("issuer_contract_verified", cached_only)
        self.assertFalse(no_code["issuer_contract_verified"].value)
        self.assertNotIn("onchain_supply", no_code)
        self.assertTrue(deployed["issuer_contract_verified"].value)
        self.assertFalse(any(method == "eth_call" for method, _ in no_code_rpc.calls))

    def test_malformed_rpc_data_fails_safely(self) -> None:
        def wrong_chain(method: str, params: list):
            if method == "eth_chainId":
                return "0x2"
            raise AssertionError("wrong-chain adapter should stop immediately")

        class MalformedSupplyRpc(CapturedEthereumRpc):
            def __call__(self, method: str, params: list):
                if method == "eth_call" and params[0]["data"] == "0x18160ddd":
                    return "0x1234"
                return super().__call__(method, params)

        for rpc in (wrong_chain, MalformedSupplyRpc()):
            with self.subTest(rpc=rpc):
                with self.assertRaises(OndoAdapterError):
                    read_usdy_onchain_supply(rpc)

    def test_onchain_augmentation_remains_indeterminate_without_attestation(self) -> None:
        evidence = get_usdy_evidence(
            rpc_call=CapturedEthereumRpc(),
            rpc_retrieved_at=RPC_RETRIEVED_AT,
        )
        records = _by_field(evidence)
        certificate = verify_treasury_backing("USDY", evidence)

        self.assertEqual(9, len(evidence))
        self.assertTrue(records["issuer_contract_verified"].value)
        self.assertIn("onchain_supply", records)
        self.assertIn("portfolio_observation_timestamp", records)
        self.assertNotIn("attestation_timestamp", records)
        self.assertEqual(VerificationResult.INDETERMINATE, certificate.result)
        self.assertEqual(
            ["attestation_timestamp exists"],
            [result.predicate for result in certificate.predicate_results],
        )
        self.assertEqual(2, certificate.independent_root_count)
        self.assertEqual(
            ["ondo-contract-addresses-snapshot"],
            records["issuer_contract_verified"].dependency_parent_ids,
        )


if __name__ == "__main__":
    unittest.main()
