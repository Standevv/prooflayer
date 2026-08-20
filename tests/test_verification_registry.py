"""Tests for the mainnet RWA asset registry, AI answer sanitization, and registry endpoint."""

from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from services.verification.registry import (
    RwaAsset,
    RwaDiscoveryStatus,
    RwaVerificationSupport,
    asset_summary,
    get_asset_by_address,
    get_asset_by_symbol,
    get_discoverable_assets,
    get_registry,
    get_supported_assets,
    get_xlayer_deployed_assets,
    register_asset,
)
from services.agent.verification_agent import (
    _build_fallback_from_data,
    _sanitize_answer,
)


class RegistryModelTests(unittest.TestCase):
    """Test the RWA registry model and lookup functions."""

    def test_registry_contains_usdy_and_paxg(self) -> None:
        registry = get_registry()
        symbols = [a.symbol for a in registry]
        self.assertIn("USDY", symbols)
        self.assertIn("PAXG", symbols)

    def test_registry_contains_xstocks_family(self) -> None:
        """xStocks are now discovered dynamically as individual assets."""
        registry = get_registry()
        symbols = [a.symbol for a in registry]
        # Should contain individual xStocks, not a single XSTOCKS placeholder
        self.assertNotIn("XSTOCKS", symbols)
        # Should contain known xStocks from the verified snapshot
        self.assertIn("AAPLx", symbols)
        self.assertIn("TSLAx", symbols)
        self.assertIn("NVDAx", symbols)

    def test_usdy_is_fully_supported(self) -> None:
        asset = get_asset_by_symbol("USDY")
        self.assertIsNotNone(asset)
        self.assertEqual(asset.verification_support, RwaVerificationSupport.FULLY_SUPPORTED)

    def test_paxg_is_fully_supported(self) -> None:
        asset = get_asset_by_symbol("PAXG")
        self.assertIsNotNone(asset)
        self.assertEqual(asset.verification_support, RwaVerificationSupport.FULLY_SUPPORTED)

    def test_xstocks_are_framework_verified(self) -> None:
        """Bytecode-verified xStocks are PARTIALLY_SUPPORTED (framework-level)."""
        asset = get_asset_by_symbol("AAPLx")
        self.assertIsNotNone(asset)
        self.assertEqual(asset.verification_support, RwaVerificationSupport.PARTIALLY_SUPPORTED)
        self.assertTrue(asset.deployed_on_xlayer)

    def test_lookup_by_ethereum_address(self) -> None:
        asset = get_asset_by_address("0x96F6eF951840721AdBF46Ac996b59E0235CB985C")
        self.assertIsNotNone(asset)
        self.assertEqual(asset.symbol, "USDY")
        self.assertFalse(asset.deployed_on_xlayer)

    def test_lookup_case_insensitive(self) -> None:
        asset = get_asset_by_symbol("usdy")
        self.assertIsNotNone(asset)
        self.assertEqual(asset.symbol, "USDY")

    def test_unknown_asset_returns_none(self) -> None:
        self.assertIsNone(get_asset_by_symbol("FAKECOIN"))
        self.assertIsNone(get_asset_by_address("0x0000000000000000000000000000000000000001"))

    def test_supported_assets_includes_framework_verified(self) -> None:
        supported = get_supported_assets()
        symbols = [a.symbol for a in supported]
        self.assertIn("USDY", symbols)
        self.assertIn("PAXG", symbols)
        # Framework-verified xStocks should be in supported
        self.assertIn("AAPLx", symbols)

    def test_discoverable_includes_all(self) -> None:
        discoverable = get_discoverable_assets()
        symbols = [a.symbol for a in discoverable]
        self.assertIn("USDY", symbols)
        self.assertIn("PAXG", symbols)
        self.assertIn("AAPLx", symbols)

    def test_asset_summary(self) -> None:
        summary = asset_summary()
        self.assertEqual(summary["chain_id"], 196)
        self.assertEqual(summary["network"], "X Layer Mainnet")
        self.assertGreaterEqual(summary["total_candidates"], 3)
        self.assertGreaterEqual(summary["fully_supported"], 2)
        # xStocks are now discovered and bytecode-verified
        self.assertGreater(summary["confirmed_xlayer_deployments"], 0)
        self.assertGreater(summary["partially_supported"], 0)
        # Summary includes xStocks stats
        self.assertIn("xstocks_api_asset_count", summary)
        self.assertIn("xstocks_xlayer_discovered", summary)
        self.assertIn("xstocks_bytecode_verified", summary)

    def test_all_assets_have_required_fields(self) -> None:
        for asset in get_registry():
            self.assertTrue(asset.symbol, f"{asset} missing symbol")
            self.assertTrue(asset.canonical_name, f"{asset} missing name")
            self.assertTrue(asset.issuer, f"{asset} missing issuer")
            self.assertTrue(asset.asset_class, f"{asset} missing asset_class")
            self.assertEqual(asset.chain_id, 196, f"{asset} wrong chain_id")
            self.assertTrue(asset.deployment_source, f"{asset} missing deployment_source")
            self.assertTrue(asset.issuer_source, f"{asset} missing issuer_source")
            self.assertTrue(asset.evidence_adapter, f"{asset} missing evidence_adapter")
            self.assertTrue(asset.discovery_timestamp, f"{asset} missing discovery_timestamp")

    def test_usdy_claims_include_treasury_backing(self) -> None:
        asset = get_asset_by_symbol("USDY")
        self.assertIn("TreasuryBacking", asset.claims)

    def test_paxg_claims_include_gold_backing(self) -> None:
        asset = get_asset_by_symbol("PAXG")
        self.assertIn("GoldBacking", asset.claims)

    def test_xstocks_have_no_claims(self) -> None:
        """xStocks don't have per-token claims at framework level."""
        asset = get_asset_by_symbol("AAPLx")
        self.assertIsNotNone(asset)
        self.assertEqual(len(asset.claims), 0)

    def test_xstocks_are_deployed_on_xlayer(self) -> None:
        """Bytecode-verified xStocks have deployed_on_xlayer=True."""
        asset = get_asset_by_symbol("NVDAx")
        self.assertIsNotNone(asset)
        self.assertTrue(asset.deployed_on_xlayer)
        self.assertTrue(asset.contract_address.startswith("0x"))

    def test_register_asset(self) -> None:
        from services.verification.registry import _REFERENCE_ASSETS
    # register_asset now appends to _REFERENCE_ASSETS
        original_len = len(_REFERENCE_ASSETS)
        new_asset = RwaAsset(
            chain_id=196,
            contract_address="0xdead000000000000000000000000000000000001",
            symbol="TESTASSET",
            canonical_name="Test Asset",
            issuer="Test Issuer",
            asset_class="TOKENIZED_BOND",
            decimals=18,
            deployment_source="test",
            issuer_source="test",
            evidence_adapter="test",
            verification_support=RwaVerificationSupport.DISCOVERED_ONLY,
            current_status=RwaDiscoveryStatus.UNSUPPORTED,
            discovery_timestamp="2026-01-01T00:00:00Z",
            claims=(),
            deployed_on_xlayer=True,
        )
        register_asset(new_asset)
        found = get_asset_by_symbol("TESTASSET")
        self.assertIsNotNone(found)
        self.assertEqual(found.symbol, "TESTASSET")
        # Clean up
        _REFERENCE_ASSETS.remove(new_asset)

    def test_no_fake_pass_results(self) -> None:
        """Unsupported/discovered assets must NOT have VERIFIED status."""
        for asset in get_registry():
            if asset.verification_support in {
                RwaVerificationSupport.DISCOVERED_ONLY,
                RwaVerificationSupport.UNSUPPORTED,
            }:
                self.assertNotEqual(
                    asset.current_status,
                    RwaDiscoveryStatus.VERIFIED,
                    f"{asset.symbol} should not be VERIFIED when unsupported",
                )

    def test_chain_separation(self) -> None:
        """All registry entries target chain 196."""
        for asset in get_registry():
            self.assertEqual(asset.chain_id, 196, f"{asset.symbol} uses wrong chain")
        # xStocks ARE deployed on X Layer
        deployed = get_xlayer_deployed_assets()
        self.assertGreater(len(deployed), 0)

    def test_xstocks_use_correct_addresses(self) -> None:
        """xStock contract addresses match the verified snapshot."""
        aapl = get_asset_by_symbol("AAPLx")
        self.assertIsNotNone(aapl)
        self.assertEqual(aapl.contract_address.lower(), "0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a")

        tsla = get_asset_by_symbol("TSLAx")
        self.assertIsNotNone(tsla)
        self.assertEqual(tsla.contract_address.lower(), "0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0")

    def test_xstocks_okx_ticker_mapping(self) -> None:
        """xStocks have OKX unified ticker where known."""
        from services.evidence.xstocks import OKX_TICKER_MAP
        aapl = get_asset_by_symbol("AAPLx")
        self.assertIsNotNone(aapl)
        # AAPLx maps to XAAPL on OKX
        self.assertIn("AAPLx", OKX_TICKER_MAP.values())

    def test_xstocks_framework_evidence(self) -> None:
        """Framework-level evidence is available for xStocks."""
        from services.evidence.xstocks import get_xstocks_framework_evidence
        evidence = get_xstocks_framework_evidence()
        self.assertIn("issuer", evidence)
        self.assertIn("backing_model", evidence)
        self.assertIn("framework", evidence)
        self.assertEqual(evidence["issuer"]["name"], "Backed Assets GmbH")
        self.assertEqual(evidence["backing_model"]["type"], "1:1_fully_collateralized")


class AISanitizeTests(unittest.TestCase):
    """Test that the AI answer sanitizer prevents raw JSON leakage."""

    def test_bare_json_replaced(self) -> None:
        answer = '{"type": "tool_call", "tool": "verify_claim", "arguments": {"asset": "USDY"}}'
        sanitized = _sanitize_answer(answer, None, None, None)
        self.assertNotIn("{", sanitized)
        self.assertIn("ProofLayer", sanitized)

    def test_json_in_fences_replaced(self) -> None:
        answer = '```json\n{"verification_result": "PASS"}\n```'
        sanitized = _sanitize_answer(answer, None, None, None)
        self.assertNotIn("```", sanitized)

    def test_natural_language_preserved(self) -> None:
        answer = "ProofLayer's deterministic RVC returned FAIL for USDY TreasuryBacking."
        sanitized = _sanitize_answer(answer, None, None, None)
        self.assertEqual(sanitized, answer)

    def test_empty_answer_gets_fallback(self) -> None:
        verification = {
            "verification_result": "FAIL",
            "asset": "USDY",
            "claim": "TreasuryBacking",
            "reason_codes": ["STALE_ATTESTATION"],
        }
        sanitized = _sanitize_answer("", verification, None, None)
        self.assertIn("FAIL", sanitized)
        self.assertIn("USDY", sanitized)
        self.assertIn("attestation", sanitized.lower())

    def test_fallback_with_certificate(self) -> None:
        certificate = {"certificate_status": "REGISTERED_UNUSABLE", "result": "PASS"}
        sanitized = _sanitize_answer("", None, certificate, None)
        self.assertIn("certificate", sanitized.lower())

    def test_fallback_with_policygate(self) -> None:
        policygate = {"policygate_outcome": "BLOCKED"}
        sanitized = _sanitize_answer("", None, None, policygate)
        self.assertIn("BLOCKED", sanitized)

    def test_fallback_no_data(self) -> None:
        sanitized = _sanitize_answer("", None, None, None)
        self.assertIn("not return enough", sanitized)
        self.assertIn("fabricated", sanitized.lower())

    def test_tool_call_json_not_leaked(self) -> None:
        answer = '{"type": "final", "answer": "USDY fails"}'
        sanitized = _sanitize_answer(answer, None, None, None)
        self.assertNotIn('"type": "final"', sanitized)


class RegistryAPIEndpointTests(unittest.TestCase):
    """Test the /verification/registry API endpoint via FastAPI test client."""

    def setUp(self) -> None:
        from apps.api.main import app
        from fastapi.testclient import TestClient
        self.client = TestClient(app)

    def test_registry_endpoint_returns_200(self) -> None:
        response = self.client.get("/verification/registry")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("summary", data)
        self.assertIn("assets", data)

    def test_registry_summary_fields(self) -> None:
        response = self.client.get("/verification/registry")
        data = response.json()
        summary = data["summary"]
        self.assertEqual(summary["chain_id"], 196)
        self.assertGreaterEqual(summary["total_candidates"], 3)
        # xStocks are now discovered
        self.assertGreater(summary["confirmed_xlayer_deployments"], 0)

    def test_registry_assets_have_required_fields(self) -> None:
        response = self.client.get("/verification/registry")
        data = response.json()
        for asset in data["assets"]:
            self.assertIn("symbol", asset)
            self.assertIn("verification_support", asset)
            self.assertIn("current_status", asset)
            self.assertIn("claims", asset)

    def test_registry_asset_lookup(self) -> None:
        response = self.client.get("/verification/registry/USDY")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["symbol"], "USDY")
        self.assertEqual(data["verification_support"], "FULLY_SUPPORTED")

    def test_registry_xstock_lookup(self) -> None:
        """Individual xStocks are lookupable in the registry."""
        response = self.client.get("/verification/registry/AAPLx")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["symbol"], "AAPLx")
        self.assertEqual(data["verification_support"], "PARTIALLY_SUPPORTED")

    def test_registry_unknown_asset_404(self) -> None:
        response = self.client.get("/verification/registry/FAKECOIN")
        self.assertEqual(response.status_code, 404)

    def test_registry_case_insensitive(self) -> None:
        response = self.client.get("/verification/registry/usdy")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["symbol"], "USDY")


class AssetsEndpointTests(unittest.TestCase):
    """Test the /assets endpoint with filters."""

    def setUp(self) -> None:
        from apps.api.main import app
        from fastapi.testclient import TestClient
        self.client = TestClient(app)

    def test_assets_endpoint_returns_200(self) -> None:
        response = self.client.get("/assets")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("assets", data)
        self.assertIn("total", data)
        self.assertGreater(data["total"], 0)

    def test_assets_have_verification_depth_fields(self) -> None:
        response = self.client.get("/assets")
        data = response.json()
        for asset in data["assets"]:
            self.assertIn("asset_origin", asset)
            self.assertIn("deployment_verified", asset)
            self.assertIn("framework_verified", asset)
            self.assertIn("backing_verified", asset)
            self.assertIn("rvc_status", asset)

    def test_usdy_is_cross_chain_reference(self) -> None:
        response = self.client.get("/assets?origin=CROSS_CHAIN_REFERENCE")
        data = response.json()
        symbols = [a["symbol"] for a in data["assets"]]
        self.assertIn("USDY", symbols)
        self.assertIn("PAXG", symbols)

    def test_filter_by_origin(self) -> None:
        response = self.client.get("/assets?origin=X_LAYER_NATIVE")
        data = response.json()
        for asset in data["assets"]:
            self.assertEqual(asset["asset_origin"], "X_LAYER_NATIVE")

    def test_filter_by_support(self) -> None:
        response = self.client.get("/assets?support=FULLY_SUPPORTED")
        data = response.json()
        for asset in data["assets"]:
            self.assertEqual(asset["verification_support"], "FULLY_SUPPORTED")

    def test_filter_by_search(self) -> None:
        response = self.client.get("/assets?search=AAPL")
        data = response.json()
        self.assertGreater(data["total"], 0)
        symbols = [a["symbol"] for a in data["assets"]]
        self.assertIn("AAPLx", symbols)

    def test_asset_detail_returns_200(self) -> None:
        response = self.client.get("/assets/AAPLx")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["symbol"], "AAPLx")
        self.assertIn("deployment_verified", data)
        self.assertIn("framework_evidence", data)

    def test_asset_detail_usdy(self) -> None:
        response = self.client.get("/assets/USDY")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["asset_origin"], "CROSS_CHAIN_REFERENCE")
        self.assertFalse(data["deployed_on_xlayer"])

    def test_asset_detail_not_found(self) -> None:
        response = self.client.get("/assets/FAKECOIN")
        self.assertEqual(response.status_code, 404)


class VerificationDepthTests(unittest.TestCase):
    """Test verification depth fields on registry assets."""

    def test_usdy_verification_depth(self) -> None:
        usdy = get_asset_by_symbol("USDY")
        self.assertIsNotNone(usdy)
        self.assertEqual(usdy.asset_origin.value, "CROSS_CHAIN_REFERENCE")
        self.assertFalse(usdy.deployment_verified)
        self.assertTrue(usdy.framework_verified)
        self.assertFalse(usdy.backing_verified)
        self.assertEqual(usdy.rvc_status, "FAIL")

    def test_paxg_verification_depth(self) -> None:
        paxg = get_asset_by_symbol("PAXG")
        self.assertIsNotNone(paxg)
        self.assertEqual(paxg.asset_origin.value, "CROSS_CHAIN_REFERENCE")
        self.assertFalse(paxg.deployment_verified)
        self.assertTrue(paxg.framework_verified)
        self.assertFalse(paxg.backing_verified)
        self.assertEqual(paxg.rvc_status, "INDETERMINATE")

    def test_aaplx_verification_depth(self) -> None:
        aapl = get_asset_by_symbol("AAPLx")
        self.assertIsNotNone(aapl)
        self.assertEqual(aapl.asset_origin.value, "X_LAYER_NATIVE")
        self.assertTrue(aapl.deployment_verified)
        self.assertTrue(aapl.framework_verified)
        self.assertFalse(aapl.backing_verified)
        self.assertEqual(aapl.rvc_status, "INDETERMINATE")


if __name__ == "__main__":
    unittest.main()
