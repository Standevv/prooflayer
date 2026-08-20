"""Tests for the xStocks discovery adapter and framework evidence."""

from __future__ import annotations

import unittest

from services.evidence.xstocks import (
    OKX_TICKER_MAP,
    XStockDeployment,
    XStocksDiscoveryResult,
    discover_xstocks_on_xlayer,
    get_xstocks_framework_evidence,
    get_xstock_evidence,
    XLAYER_CHAIN_ID,
)
from services.verification.registry import (
    get_asset_by_symbol,
    get_registry,
    get_xlayer_deployed_assets,
    asset_summary,
)


class XStocksDiscoveryTests(unittest.TestCase):
    """Test xStocks discovery adapter."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.result = discover_xstocks_on_xlayer(verify_bytecode=True)

    def test_discovery_returns_result(self) -> None:
        self.assertIsInstance(self.result, XStocksDiscoveryResult)
        self.assertGreater(len(self.result.assets), 0)

    def test_discovery_finds_xlayer_assets(self) -> None:
        self.assertGreater(self.result.xlayer_discovered, 0)
        self.assertGreater(self.result.xlayer_bytecode_verified, 0)

    def test_all_assets_have_required_fields(self) -> None:
        for dep in self.result.assets:
            self.assertIsInstance(dep, XStockDeployment)
            self.assertTrue(dep.xstock_symbol)
            self.assertTrue(dep.canonical_name)
            self.assertTrue(dep.xlayer_address.startswith("0x"))
            self.assertEqual(dep.decimals, 18)
            self.assertEqual(dep.issuer, "Backed Assets GmbH")
            self.assertIn("xStocks", dep.framework)

    def test_bytecode_verified_assets_have_supply(self) -> None:
        verified = [d for d in self.result.assets if d.bytecode_verified]
        self.assertGreater(len(verified), 0)
        for dep in verified:
            self.assertGreater(dep.bytecode_length, 0)

    def test_snapshot_has_known_assets(self) -> None:
        from services.evidence.xstocks import _XSTOCKS_SNAPSHOT
        symbols = {e["sym"] for e in _XSTOCKS_SNAPSHOT}
        for expected in ("AAPLx", "TSLAx", "NVDAx", "SPYx", "JAAAx", "YLDEx"):
            self.assertIn(expected, symbols)

    def test_okx_ticker_map(self) -> None:
        self.assertEqual(OKX_TICKER_MAP["XAAPL"], "AAPLx")
        self.assertEqual(OKX_TICKER_MAP["XTSLA"], "TSLAx")
        self.assertEqual(OKX_TICKER_MAP["XNVDA"], "NVDAx")


class XStocksFrameworkEvidenceTests(unittest.TestCase):
    """Test framework-level evidence."""

    def test_framework_evidence_has_required_fields(self) -> None:
        evidence = get_xstocks_framework_evidence()
        for key in ("issuer", "framework", "backing_model", "deployment_model",
                     "token_standard", "limitations"):
            self.assertIn(key, evidence)

    def test_issuer_is_backed_assets(self) -> None:
        evidence = get_xstocks_framework_evidence()
        self.assertEqual(evidence["issuer"]["name"], "Backed Assets GmbH")

    def test_backing_model_is_1_1(self) -> None:
        evidence = get_xstocks_framework_evidence()
        self.assertEqual(evidence["backing_model"]["type"], "1:1_fully_collateralized")

    def test_framework_evidence_has_source_urls(self) -> None:
        evidence = get_xstocks_framework_evidence()
        self.assertGreater(len(evidence["source_urls"]), 0)

    def test_per_token_evidence(self) -> None:
        result = discover_xstocks_on_xlayer(verify_bytecode=True)
        verified = [d for d in result.assets if d.bytecode_verified and d.xstock_symbol == "AAPLx"]
        if verified:
            evidence = get_xstock_evidence("AAPLx", verified[0])
            self.assertEqual(evidence["asset"], "AAPLx")
            self.assertIn("on_chain", evidence)
            self.assertIn("off_chain", evidence)
            self.assertEqual(evidence["on_chain"]["chain_id"], XLAYER_CHAIN_ID)


class XStocksRegistryIntegrationTests(unittest.TestCase):
    """Test xStocks integration with the registry."""

    def test_xstocks_in_registry(self) -> None:
        registry = get_registry()
        symbols = [a.symbol for a in registry]
        self.assertIn("AAPLx", symbols)
        self.assertIn("TSLAx", symbols)

    def test_xstocks_in_xlayer_deployed(self) -> None:
        deployed = get_xlayer_deployed_assets()
        symbols = [a.symbol for a in deployed]
        self.assertIn("AAPLx", symbols)

    def test_xstocks_are_framework_verified(self) -> None:
        aapl = get_asset_by_symbol("AAPLx")
        self.assertIsNotNone(aapl)
        self.assertEqual(aapl.verification_support.value, "PARTIALLY_SUPPORTED")
        self.assertTrue(aapl.deployed_on_xlayer)

    def test_dynamic_summary(self) -> None:
        summary = asset_summary()
        self.assertGreater(summary["confirmed_xlayer_deployments"], 0)
        self.assertGreater(summary["partially_supported"], 0)
        self.assertEqual(summary["chain_id"], 196)

    def test_reference_assets_preserved(self) -> None:
        usdy = get_asset_by_symbol("USDY")
        paxg = get_asset_by_symbol("PAXG")
        self.assertIsNotNone(usdy)
        self.assertIsNotNone(paxg)
        self.assertFalse(usdy.deployed_on_xlayer)
        self.assertFalse(paxg.deployed_on_xlayer)


class XStocksDeeperVerificationTests(unittest.TestCase):
    """Deeper verification for representative subset."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.result = discover_xstocks_on_xlayer(verify_bytecode=True)
        cls.by_symbol = {d.xstock_symbol: d for d in cls.result.assets}

    def _assert_verified(self, symbol: str) -> None:
        dep = self.by_symbol.get(symbol)
        self.assertIsNotNone(dep, f"{symbol} not found in discovery")
        self.assertTrue(dep.bytecode_verified, f"{symbol} bytecode not verified")
        self.assertGreater(dep.bytecode_length, 0, f"{symbol} has no bytecode")
        self.assertTrue(dep.xlayer_address.startswith("0x"))

    def test_aaplx_verified(self) -> None:
        self._assert_verified("AAPLx")

    def test_tslax_verified(self) -> None:
        self._assert_verified("TSLAx")

    def test_nvdax_verified(self) -> None:
        self._assert_verified("NVDAx")

    def test_spyx_verified(self) -> None:
        self._assert_verified("SPYx")

    def test_jaaax_verified(self) -> None:
        self._assert_verified("JAAAx")

    def test_yldex_verified(self) -> None:
        self._assert_verified("YLDEx")

    def test_aaplx_correct_address(self) -> None:
        dep = self.by_symbol["AAPLx"]
        self.assertEqual(dep.xlayer_address.lower(), "0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a")

    def test_tslax_correct_address(self) -> None:
        dep = self.by_symbol["TSLAx"]
        self.assertEqual(dep.xlayer_address.lower(), "0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0")

    def test_spyx_correct_address(self) -> None:
        dep = self.by_symbol["SPYx"]
        self.assertEqual(dep.xlayer_address.lower(), "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48")

    def test_yldex_is_yield(self) -> None:
        dep = self.by_symbol["YLDEx"]
        self.assertEqual(dep.asset_class, "TOKENIZED_YIELD")

    def test_jaaax_is_yield(self) -> None:
        dep = self.by_symbol["JAAAx"]
        self.assertEqual(dep.asset_class, "TOKENIZED_YIELD")

    def test_spyx_is_etf(self) -> None:
        dep = self.by_symbol["SPYx"]
        self.assertEqual(dep.asset_class, "TOKENIZED_ETF")


if __name__ == "__main__":
    unittest.main()
