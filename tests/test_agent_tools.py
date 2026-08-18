import asyncio
import os
import unittest
from unittest.mock import patch

import httpx
import openai
from fastapi.testclient import TestClient

from apps.api.main import app
from services.agent.models import AgentResponse
from services.evidence.usdy_attestation import DEFAULT_USDY_ATTESTATION_SNAPSHOT
from services.agent.verification_agent import (
    AgentExecutionError,
    classify_openai_error,
    detect_investigation_mode,
    ground_agent_response,
    is_agent_configured,
    probe_agent_connectivity,
    reset_agent_probe_cache,
    run_verification_agent,
    tool_route_hint,
)
from services.mcp_server.tools import (
    CERTIFICATE_EXISTS_SELECTOR,
    CERTIFICATE_USABLE_SELECTOR,
    DECISION_COUNT_SELECTOR,
    EXECUTED_ACTION_COUNT_SELECTOR,
    GET_CERTIFICATE_SELECTOR,
    POLICY_GATE_DECISION_LOG_SELECTOR,
    POLICY_GATE_REGISTRY_SELECTOR,
    DECISION_LOG_ADDRESS,
    REGISTRY_ADDRESS,
    ProofLayerToolError,
    ProofLayerTools,
)


CERTIFICATE_ID = "0x" + "11" * 32


def _word(value: int) -> str:
    return f"{value:064x}"


def _bytes_word(value: str) -> str:
    return value.removeprefix("0x").lower().rjust(64, "0")


class FakeChain:
    def __init__(self, *, exists: bool = True, usable: bool = False) -> None:
        self.exists = exists
        self.usable = usable
        self.assertions = 0

    def assert_chain(self) -> int:
        self.assertions += 1
        return 1952

    def latest_block(self) -> int:
        return 37_752_710

    def batch(self, calls):
        results = []
        for method, params in calls:
            if method == "eth_getLogs":
                results.append([])
            elif method == "eth_chainId":
                results.append(hex(1952))
            elif method == "eth_blockNumber":
                results.append(hex(self.latest_block()))
            elif method == "eth_call":
                request = params[0]
                results.append(self.eth_call(request["to"], request["data"]))
            else:
                raise AssertionError(f"unexpected batch method {method}")
        return results

    def eth_call(self, address: str, data: str) -> str:
        selector = data[2:10]
        if selector == CERTIFICATE_EXISTS_SELECTOR:
            return "0x" + _word(int(self.exists))
        if selector == CERTIFICATE_USABLE_SELECTOR:
            return "0x" + _word(int(self.usable))
        if selector == GET_CERTIFICATE_SELECTOR:
            values = [
                _bytes_word(CERTIFICATE_ID),
                "22" * 32,
                "33" * 32,
                "44" * 32,
                "55" * 32,
                _word(1_786_212_110),
                _word(1_786_215_710),
                _word(2),
                _word(1),
                _bytes_word("0x" + "66" * 20),
                _word(0),
            ]
            return "0x" + "".join(values)
        if selector == POLICY_GATE_REGISTRY_SELECTOR:
            return "0x" + _bytes_word(REGISTRY_ADDRESS)
        if selector == POLICY_GATE_DECISION_LOG_SELECTOR:
            return "0x" + _bytes_word(DECISION_LOG_ADDRESS)
        if selector == EXECUTED_ACTION_COUNT_SELECTOR:
            return "0x" + _word(1)
        if selector == DECISION_COUNT_SELECTOR:
            return "0x" + _word(1)
        raise AssertionError(f"unexpected selector {selector} for {address}")


class FakeEthereumRpc:
    """Deterministic Ethereum mainnet responses for offline live-read tests."""

    block_tag = "0x1884e5e"
    raw_total_supply = 971_535_697_170_034_516_449_071_459

    def __call__(self, method: str, params: list):
        if method == "eth_chainId":
            return "0x1"
        if method == "eth_blockNumber":
            return self.block_tag
        if method == "eth_getBlockByNumber":
            return {"number": self.block_tag, "timestamp": "0x6a771dab"}
        if method == "eth_getCode":
            return "0x6001600055"
        if method == "eth_call" and params[0]["data"] == "0x18160ddd":
            return "0x" + format(self.raw_total_supply, "064x")
        raise AssertionError(f"unexpected RPC call: {method} {params}")


class ProofLayerAgentToolTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tools = ProofLayerTools(chain=FakeChain())

    def test_discovers_only_existing_deterministic_integrations(self) -> None:
        result = self.tools.discover_assets()
        self.assertEqual([item["asset"] for item in result["assets"]], ["USDY", "PAXG"])
        self.assertEqual(result["assets"][0]["supported_claims"], ["TreasuryBacking"])
        self.assertEqual(result["assets"][1]["supported_claims"], ["GoldBacking"])

    def test_usdy_metadata_uses_existing_exported_certificate_fixture(self) -> None:
        result = self.tools.get_asset_metadata("usdy")
        self.assertEqual(result["claim"], "TreasuryBacking")
        self.assertTrue(result["fixture_available"])
        self.assertTrue(result["evidence_snapshot_available"])
        self.assertTrue(result["live_certificate_mapping_available"])
        self.assertRegex(result["known_live_certificate_id"], r"^0x[0-9a-f]{64}$")

    def test_unsupported_asset_is_rejected(self) -> None:
        with self.assertRaisesRegex(ProofLayerToolError, "unsupported asset"):
            self.tools.get_asset_metadata("SOLAR")

    def test_unsupported_claim_is_rejected(self) -> None:
        with self.assertRaisesRegex(ProofLayerToolError, "unsupported claim"):
            self.tools.get_evidence("USDY", "GoldBacking")

    def test_usdy_evidence_is_loaded_from_existing_adapter(self) -> None:
        result = self.tools.get_evidence("USDY", "TreasuryBacking")
        self.assertEqual(result["source_mode"], "repository official snapshot")
        self.assertIn("treasury_exposure", result["available_fields"])
        self.assertNotIn("onchain_supply", result["available_fields"])
        self.assertTrue(all(item["simulation"] is False for item in result["evidence"]))

    def test_default_tools_do_not_enable_live_ethereum_reads(self) -> None:
        result = self.tools.get_evidence("USDY", "TreasuryBacking")
        self.assertFalse(result["live_ethereum_read_enabled"])
        self.assertFalse(result["live_ethereum_read_failed"])
        self.assertEqual(result["source_mode"], "repository official snapshot")
        self.assertEqual(
            self.tools.get_asset_metadata("USDY")["live_evidence_fetch_enabled"],
            False,
        )

    def test_usdy_live_ethereum_reads_augment_evidence(self) -> None:
        tools = ProofLayerTools(chain=FakeChain(), ethereum_rpc_call=FakeEthereumRpc())

        evidence = tools.get_evidence("USDY", "TreasuryBacking")
        self.assertEqual(
            evidence["source_mode"],
            "repository official snapshot + live Ethereum read",
        )
        self.assertTrue(evidence["live_ethereum_read_enabled"])
        self.assertFalse(evidence["live_ethereum_read_failed"])
        self.assertIn("onchain_supply", evidence["available_fields"])
        self.assertIn("issuer_contract_verified", evidence["available_fields"])
        self.assertEqual(9, evidence["evidence_count"])
        onchain = next(
            item for item in evidence["evidence"] if item["field"] == "onchain_supply"
        )
        self.assertEqual(onchain["source_type"], "onchain")
        self.assertIsNone(onchain["cache_status"])
        self.assertTrue(onchain["rpc_source"])
        self.assertFalse(onchain["simulation"])

        verification = tools.verify_claim("USDY", "TreasuryBacking")
        self.assertEqual(verification["verification_result"], "INDETERMINATE")
        self.assertEqual(verification["reason_codes"], ["MISSING_EVIDENCE"])
        self.assertEqual(
            [item["predicate"] for item in verification["predicates"]],
            ["attestation_timestamp exists"],
        )
        self.assertEqual(verification["evidence_root_count"], 2)
        self.assertFalse(verification["simulation"])

        provenance = tools.analyze_provenance("USDY", "TreasuryBacking")
        self.assertEqual(provenance["independent_root_count"], 2)
        self.assertEqual(
            set(provenance["independent_root_ids"]), {"ondo", "ethereum"}
        )

    def test_usdy_live_read_failure_degrades_to_cached_evidence(self) -> None:
        def broken_rpc(method: str, params: list):
            raise RuntimeError("network down")

        tools = ProofLayerTools(chain=FakeChain(), ethereum_rpc_call=broken_rpc)
        evidence = tools.get_evidence("USDY", "TreasuryBacking")

        self.assertEqual(evidence["source_mode"], "repository official snapshot")
        self.assertTrue(evidence["live_ethereum_read_enabled"])
        self.assertTrue(evidence["live_ethereum_read_failed"])
        self.assertNotIn("onchain_supply", evidence["available_fields"])
        self.assertEqual(7, evidence["evidence_count"])

    def test_usdy_attestation_composes_into_verify_claim(self) -> None:
        tools = ProofLayerTools(
            chain=FakeChain(),
            ethereum_rpc_call=FakeEthereumRpc(),
            usdy_attestation_path=DEFAULT_USDY_ATTESTATION_SNAPSHOT,
        )

        evidence = tools.get_evidence("USDY", "TreasuryBacking")
        self.assertEqual(13, evidence["evidence_count"])
        self.assertTrue(evidence["attestation_available"])
        self.assertFalse(evidence["attestation_read_failed"])
        self.assertIn("attestation_timestamp", evidence["available_fields"])
        self.assertIn("attested_assets_value", evidence["available_fields"])
        attestation = next(
            item
            for item in evidence["evidence"]
            if item["field"] == "attestation_timestamp"
        )
        self.assertEqual(attestation["source_type"], "attestation")
        self.assertEqual(attestation["cache_status"], "cached_official_evidence")
        self.assertFalse(attestation["simulation"])

        verification = tools.verify_claim("USDY", "TreasuryBacking")
        self.assertEqual(verification["verification_result"], "FAIL")
        self.assertEqual(verification["reason_codes"], ["STALE_ATTESTATION"])
        self.assertEqual(verification["evidence_root_count"], 3)
        self.assertFalse(verification["simulation"])

        provenance = tools.analyze_provenance("USDY", "TreasuryBacking")
        self.assertEqual(provenance["independent_root_count"], 3)
        self.assertEqual(
            provenance["independent_root_ids"], ["ankura", "ethereum", "ondo"]
        )

    def test_default_tools_do_not_enable_attestation(self) -> None:
        result = self.tools.get_evidence("USDY", "TreasuryBacking")
        self.assertFalse(result["attestation_available"])
        self.assertNotIn("attestation_timestamp", result["available_fields"])

    def test_provenance_uses_existing_engine(self) -> None:
        result = self.tools.analyze_provenance("PAXG", "GoldBacking")
        self.assertGreaterEqual(result["independent_root_count"], 1)
        self.assertEqual(
            result["independent_root_count"], len(result["independent_root_ids"])
        )

    def test_usdy_verification_is_deterministic_and_does_not_fabricate_pass(self) -> None:
        result = self.tools.verify_claim("USDY", "TreasuryBacking")
        self.assertEqual(result["verification_result"], "INDETERMINATE")
        self.assertIn("MISSING_EVIDENCE", result["reason_codes"])
        self.assertEqual(result["authority"], "ProofLayer deterministic RVC")

    def test_paxg_surfaces_stale_and_missing_evidence(self) -> None:
        result = self.tools.verify_claim("PAXG", "GoldBacking")
        self.assertEqual(result["verification_result"], "INDETERMINATE")
        self.assertIn("STALE_ATTESTATION", result["reason_codes"])
        self.assertIn("MISSING_EVIDENCE", result["reason_codes"])

    def test_certificate_state_distinguishes_registration_from_usability(self) -> None:
        result = self.tools.get_certificate_state(CERTIFICATE_ID)
        self.assertTrue(result["registered"])
        self.assertTrue(result["exists"])
        self.assertEqual(result["result"], "PASS")
        self.assertFalse(result["usable"])
        self.assertEqual(result["certificate_status"], "REGISTERED_UNUSABLE")

    def test_absent_certificate_is_not_registered(self) -> None:
        result = ProofLayerTools(chain=FakeChain(exists=False)).get_certificate_state(
            CERTIFICATE_ID
        )
        self.assertEqual(result["certificate_status"], "NOT_REGISTERED")
        self.assertFalse(result["usable"])

    def test_policygate_read_is_blocked_without_executing_action(self) -> None:
        result = self.tools.get_policygate_state(
            CERTIFICATE_ID,
            "USDY",
            "TreasuryBacking",
            "default-treasury-policy",
        )
        self.assertEqual(result["policygate_outcome"], "BLOCKED")
        self.assertTrue(result["read_only_assessment"])
        self.assertFalse(result["action_executed"])

    def test_decision_history_never_invents_rejected_entries(self) -> None:
        result = self.tools.get_decision_history(CERTIFICATE_ID)
        self.assertEqual(result["matching_decisions"], [])
        self.assertIn("successful", result["note"])


class ProofLayerAgentRuntimeTests(unittest.TestCase):
    def test_tool_route_differs_for_coverage_comparison_and_chain_queries(self) -> None:
        coverage = tool_route_hint("What can ProofLayer verify?")
        comparison = tool_route_hint("Compare USDY and PAXG evidence")
        chain = tool_route_hint("Why is the USDY certificate blocked by PolicyGate?")
        self.assertIn("discover_assets", coverage)
        self.assertIn("both USDY and PAXG", comparison)
        self.assertIn("DecisionLog", chain)
        self.assertEqual(len({coverage, comparison, chain}), 3)

    def test_grounding_overrides_a_model_verdict_that_conflicts_with_rvc(self) -> None:
        model = AgentResponse(
            answer="The asset passes and is safe.",
            asset="USDY",
            claim="TreasuryBacking",
            verification_result="PASS",
        )
        records = [
            {
                "tool": "verify_claim",
                "is_error": False,
                "result": {
                    "asset": "USDY",
                    "claim": "TreasuryBacking",
                    "verification_result": "INDETERMINATE",
                    "reason_codes": ["MISSING_EVIDENCE"],
                    "evidence_root_count": 1,
                },
            }
        ]
        grounded = ground_agent_response(model, records)
        self.assertEqual(grounded.verification_result, "INDETERMINATE")
        self.assertNotIn("is safe", grounded.answer.lower())
        self.assertEqual(grounded.reason_codes, ["MISSING_EVIDENCE"])
        self.assertEqual(grounded.tools_used, ["verify_claim"])

    def test_public_trace_has_no_reasoning_or_thought_fields(self) -> None:
        fields = AgentResponse.model_fields
        self.assertNotIn("reasoning", fields)
        self.assertNotIn("thoughts", fields)

    def test_missing_api_key_and_gateway_disables_agent_without_fake_fallback(
        self,
    ) -> None:
        with patch.dict(
            os.environ,
            {
                "AI_API_KEY": "",
                "OPENAI_API_KEY": "",
                "OPENAI_BASE_URL": "",
                "NVIDIA_API_KEY": "",
            },
        ):
            self.assertFalse(is_agent_configured())
            response = TestClient(app).post(
                "/agent/verify", json={"query": "Investigate USDY TreasuryBacking"}
            )
        self.assertEqual(response.status_code, 503)
        self.assertFalse(response.json()["available"])
        self.assertIn("unavailable", response.json()["error"].lower())

    def test_base_url_alone_does_not_enable_the_agent(self) -> None:
        with patch.dict(
            os.environ,
            {
                "AI_API_KEY": "",
                "OPENAI_API_KEY": "",
                "OPENAI_BASE_URL": "http://localhost:5000/v1",
                "NVIDIA_API_KEY": "",
            },
        ):
            self.assertFalse(is_agent_configured())

    def test_placeholder_key_does_not_enable_the_agent(self) -> None:
        with patch.dict(
            os.environ,
            {
                "AI_API_KEY": "",
                "OPENAI_API_KEY": "any-value",
                "OPENAI_BASE_URL": "",
                "NVIDIA_API_KEY": "",
            },
        ):
            self.assertFalse(is_agent_configured())

    def test_real_key_enables_the_agent(self) -> None:
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-real-key-value", "OPENAI_BASE_URL": ""}):
            self.assertTrue(is_agent_configured())

    def test_ai_api_key_enables_the_agent(self) -> None:
        with patch.dict(os.environ, {"AI_API_KEY": "sk-or-v1-real-key", "AI_BASE_URL": "https://openrouter.ai/api/v1"}):
            self.assertTrue(is_agent_configured())

    def test_ai_api_key_takes_precedence_over_openai(self) -> None:
        with patch.dict(
            os.environ,
            {"AI_API_KEY": "sk-or-v1-priority", "OPENAI_API_KEY": "sk-old", "NVIDIA_API_KEY": ""},
        ):
            from services.agent.verification_agent import configured_api_key
            self.assertEqual(configured_api_key(), "sk-or-v1-priority")

    def test_ai_model_takes_precedence_over_openai(self) -> None:
        with patch.dict(os.environ, {"AI_MODEL": "deepseek/deepseek-chat-v3-0324:free", "OPENAI_MODEL": "gpt-4o"}):
            from services.agent.verification_agent import configured_model
            self.assertEqual(configured_model(), "deepseek/deepseek-chat-v3-0324:free")

    def test_ai_base_url_takes_precedence_over_openai(self) -> None:
        with patch.dict(os.environ, {"AI_BASE_URL": "https://openrouter.ai/api/v1", "OPENAI_BASE_URL": "https://api.openai.com/v1"}):
            from services.agent.verification_agent import configured_base_url
            self.assertEqual(configured_base_url(), "https://openrouter.ai/api/v1")

    def test_configured_provider_name_from_env(self) -> None:
        with patch.dict(os.environ, {"AI_PROVIDER": "openrouter"}):
            from services.agent.verification_agent import configured_provider_name
            self.assertEqual(configured_provider_name(), "openrouter")

    def test_configured_provider_name_from_url(self) -> None:
        with patch.dict(os.environ, {"AI_PROVIDER": "", "AI_BASE_URL": "https://openrouter.ai/api/v1"}):
            from services.agent.verification_agent import configured_provider_name
            self.assertEqual(configured_provider_name(), "openrouter")

    def test_configured_provider_name_from_nvidia_url(self) -> None:
        with patch.dict(
            os.environ,
            {"AI_PROVIDER": "", "AI_BASE_URL": "https://integrate.api.nvidia.com/v1"},
        ):
            from services.agent.verification_agent import configured_provider_name
            self.assertEqual(configured_provider_name(), "nvidia")

    def test_configured_provider_name_from_gemini_url(self) -> None:
        with patch.dict(
            os.environ,
            {"AI_PROVIDER": "", "AI_BASE_URL": "https://generativelanguage.googleapis.com/v1beta/openai/"},
        ):
            from services.agent.verification_agent import configured_provider_name
            self.assertEqual(configured_provider_name(), "gemini")

    def test_nvidia_api_key_enables_the_agent(self) -> None:
        with patch.dict(
            os.environ,
            {
                "AI_PROVIDER": "nvidia",
                "NVIDIA_API_KEY": "nvapi-real-key-value",
                "AI_API_KEY": "",
                "OPENAI_API_KEY": "",
            },
        ):
            self.assertTrue(is_agent_configured())

    def test_gemini_api_key_enables_the_agent(self) -> None:
        with patch.dict(
            os.environ,
            {
                "AI_PROVIDER": "gemini",
                "GEMINI_API_KEY": "AIzaSy-real-key-value",
                "AI_API_KEY": "",
                "OPENAI_API_KEY": "",
                "NVIDIA_API_KEY": "",
            },
        ):
            self.assertTrue(is_agent_configured())

    def test_placeholder_nvidia_key_does_not_enable_the_agent(self) -> None:
        with patch.dict(
            os.environ,
            {
                "AI_PROVIDER": "nvidia",
                "NVIDIA_API_KEY": "any-value",
                "AI_API_KEY": "",
                "OPENAI_API_KEY": "",
            },
        ):
            self.assertFalse(is_agent_configured())

    def test_nvidia_provider_key_takes_precedence_over_generic_key(self) -> None:
        with patch.dict(
            os.environ,
            {
                "AI_PROVIDER": "nvidia",
                "NVIDIA_API_KEY": "nvapi-priority",
                "AI_API_KEY": "sk-generic-key",
                "OPENAI_API_KEY": "",
            },
        ):
            from services.agent.verification_agent import configured_api_key
            self.assertEqual(configured_api_key(), "nvapi-priority")

    def test_gemini_provider_key_takes_precedence_over_generic_key(self) -> None:
        with patch.dict(
            os.environ,
            {
                "AI_PROVIDER": "gemini",
                "GEMINI_API_KEY": "AIza-sy-priority",
                "AI_API_KEY": "sk-generic-key",
                "OPENAI_API_KEY": "",
                "NVIDIA_API_KEY": "",
            },
        ):
            from services.agent.verification_agent import configured_api_key
            self.assertEqual(configured_api_key(), "AIza-sy-priority")

    def test_generic_ai_key_is_used_when_provider_key_missing(self) -> None:
        with patch.dict(
            os.environ,
            {
                "AI_PROVIDER": "nvidia",
                "NVIDIA_API_KEY": "",
                "AI_API_KEY": "sk-generic-key",
                "OPENAI_API_KEY": "",
            },
        ):
            from services.agent.verification_agent import configured_api_key
            self.assertEqual(configured_api_key(), "sk-generic-key")

    def test_gemini_model_is_the_code_fallback_when_unset(self) -> None:
        with patch.dict(
            os.environ,
            {"AI_MODEL": "", "OPENAI_MODEL": ""},
        ):
            from services.agent.verification_agent import configured_model
            self.assertEqual(configured_model(), "gemini-3.5-flash-lite")

    def test_gemini_base_url_is_the_code_fallback_when_unset(self) -> None:
        with patch.dict(
            os.environ,
            {"AI_BASE_URL": "", "OPENAI_BASE_URL": ""},
        ):
            from services.agent.verification_agent import configured_base_url
            self.assertEqual(configured_base_url(), "https://generativelanguage.googleapis.com/v1beta/openai/")

    def test_api_accepts_documented_message_request_shape(self) -> None:
        with patch.dict(
            os.environ,
            {
                "AI_API_KEY": "",
                "OPENAI_API_KEY": "",
                "OPENAI_BASE_URL": "",
                "NVIDIA_API_KEY": "",
            },
        ):
            response = TestClient(app).post(
                "/agent/verify", json={"message": "Investigate PAXG GoldBacking"}
            )
        self.assertEqual(response.status_code, 503)


class ProofLayerMultiAssetTests(unittest.TestCase):
    """Tests for the investigation-intent/response defect fix."""

    def test_comparison_mode_detected_for_two_assets(self) -> None:
        records = [
            {"tool": "verify_claim", "is_error": False, "result": {"asset": "USDY", "claim": "TreasuryBacking", "verification_result": "FAIL"}},
            {"tool": "verify_claim", "is_error": False, "result": {"asset": "PAXG", "claim": "GoldBacking", "verification_result": "INDETERMINATE"}},
        ]
        mode = detect_investigation_mode("Compare USDY and PAXG", records)
        self.assertEqual(mode, "COMPARISON")

    def test_single_verification_mode_for_one_asset(self) -> None:
        records = [
            {"tool": "verify_claim", "is_error": False, "result": {"asset": "USDY", "claim": "TreasuryBacking", "verification_result": "FAIL"}},
        ]
        mode = detect_investigation_mode("Investigate USDY TreasuryBacking", records)
        self.assertEqual(mode, "SINGLE_VERIFICATION")

    def test_capability_discovery_mode(self) -> None:
        mode = detect_investigation_mode("What assets can ProofLayer verify?", [])
        self.assertEqual(mode, "CAPABILITY_DISCOVERY")

    def test_certificate_explanation_mode(self) -> None:
        records = [
            {"tool": "verify_claim", "is_error": False, "result": {"asset": "USDY", "claim": "TreasuryBacking", "verification_result": "FAIL"}},
        ]
        mode = detect_investigation_mode("Why is the USDY certificate blocked by PolicyGate?", records)
        self.assertEqual(mode, "CERTIFICATE_EXPLANATION")

    def test_comparison_preserves_both_assets_in_authoritative_results(self) -> None:
        model = AgentResponse(answer="")
        records = [
            {"tool": "verify_claim", "is_error": False, "result": {
                "asset": "USDY", "claim": "TreasuryBacking",
                "verification_result": "FAIL", "reason_codes": ["STALE_ATTESTATION"],
                "evidence_root_count": 3,
            }},
            {"tool": "verify_claim", "is_error": False, "result": {
                "asset": "PAXG", "claim": "GoldBacking",
                "verification_result": "INDETERMINATE", "reason_codes": ["MISSING_EVIDENCE"],
                "evidence_root_count": 2,
            }},
        ]
        grounded = ground_agent_response(model, records, query="Compare USDY and PAXG")
        self.assertEqual(grounded.mode, "COMPARISON")
        self.assertEqual(len(grounded.authoritative_results), 2)
        usdy = next(ar for ar in grounded.authoritative_results if ar.asset == "USDY")
        paxg = next(ar for ar in grounded.authoritative_results if ar.asset == "PAXG")
        self.assertEqual(usdy.verification_result, "FAIL")
        self.assertEqual(usdy.claim, "TreasuryBacking")
        self.assertEqual(usdy.reason_codes, ["STALE_ATTESTATION"])
        self.assertEqual(paxg.verification_result, "INDETERMINATE")
        self.assertEqual(paxg.claim, "GoldBacking")
        self.assertEqual(paxg.reason_codes, ["MISSING_EVIDENCE"])
        self.assertIn("USDY", grounded.answer)
        self.assertIn("PAXG", grounded.answer)

    def test_single_verification_populates_one_authoritative_result(self) -> None:
        model = AgentResponse(answer="")
        records = [
            {"tool": "verify_claim", "is_error": False, "result": {
                "asset": "USDY", "claim": "TreasuryBacking",
                "verification_result": "FAIL", "reason_codes": ["STALE_ATTESTATION"],
                "evidence_root_count": 3,
            }},
        ]
        grounded = ground_agent_response(model, records, query="Investigate USDY TreasuryBacking")
        self.assertEqual(grounded.mode, "SINGLE_VERIFICATION")
        self.assertEqual(len(grounded.authoritative_results), 1)
        self.assertEqual(grounded.authoritative_results[0].asset, "USDY")
        self.assertEqual(grounded.asset, "USDY")
        self.assertEqual(grounded.claim, "TreasuryBacking")

    def test_capability_discovery_returns_empty_authoritative_results(self) -> None:
        model = AgentResponse(answer="")
        records = [
            {"tool": "discover_assets", "is_error": False, "result": {
                "assets": [
                    {"asset": "USDY", "supported_claims": ["TreasuryBacking"]},
                    {"asset": "PAXG", "supported_claims": ["GoldBacking"]},
                ]
            }},
        ]
        grounded = ground_agent_response(model, records, query="What assets can ProofLayer verify?")
        self.assertEqual(grounded.mode, "CAPABILITY_DISCOVERY")
        self.assertEqual(len(grounded.authoritative_results), 0)
        self.assertIn("USDY", grounded.answer)
        self.assertIn("PAXG", grounded.answer)

    def test_comparison_answer_is_rendered_from_authoritative_results(self) -> None:
        model = AgentResponse(answer="USDY fails due to stale attestation while PAXG is indeterminate due to missing evidence.")
        records = [
            {"tool": "verify_claim", "is_error": False, "result": {
                "asset": "USDY", "claim": "TreasuryBacking",
                "verification_result": "FAIL", "reason_codes": ["STALE_ATTESTATION"],
                "evidence_root_count": 3,
            }},
            {"tool": "verify_claim", "is_error": False, "result": {
                "asset": "PAXG", "claim": "GoldBacking",
                "verification_result": "INDETERMINATE", "reason_codes": ["MISSING_EVIDENCE"],
                "evidence_root_count": 2,
            }},
        ]
        grounded = ground_agent_response(model, records, query="Compare USDY and PAXG")
        self.assertEqual(grounded.mode, "COMPARISON")
        self.assertEqual(len(grounded.authoritative_results), 2)
        self.assertNotEqual(grounded.answer, model.answer)
        self.assertIn("USDY TreasuryBacking: deterministic RVC returned FAIL", grounded.answer)
        self.assertIn(
            "PAXG GoldBacking: deterministic RVC returned INDETERMINATE",
            grounded.answer,
        )


class ProofLayerAgentErrorClassificationTests(unittest.TestCase):
    def _status_error(
        self,
        cls: type,
        status_code: int,
        body: dict,
    ) -> openai.APIStatusError:
        request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
        response = httpx.Response(status_code, request=request)
        return cls(
            "provider rejected the request",
            response=response,
            body=body,
        )

    def test_authentication_error_is_classified(self) -> None:
        error = self._status_error(
            openai.AuthenticationError, 401, {"error": {"message": "Incorrect API key"}}
        )
        self.assertEqual(classify_openai_error(error), "AUTHENTICATION_ERROR")

    def test_model_not_found_is_classified(self) -> None:
        error = self._status_error(
            openai.NotFoundError, 404, {"error": {"message": "model does not exist"}}
        )
        self.assertEqual(classify_openai_error(error), "MODEL_NOT_FOUND")

    def test_quota_error_is_classified(self) -> None:
        error = self._status_error(
            openai.RateLimitError,
            429,
            {"error": {"message": "You exceeded your current quota", "code": "insufficient_quota"}},
        )
        self.assertEqual(classify_openai_error(error), "INSUFFICIENT_QUOTA")

    def test_plain_rate_limit_is_classified(self) -> None:
        error = self._status_error(
            openai.RateLimitError, 429, {"error": {"message": "Rate limit reached"}}
        )
        self.assertEqual(classify_openai_error(error), "RATE_LIMIT")

    def test_payment_required_is_classified_as_quota(self) -> None:
        error = self._status_error(
            openai.APIStatusError,
            402,
            {
                "error": {
                    "message": "Payment required to access this resource. Visit your billing tab.",
                    "type": "payment_required_error",
                    "param": "quota",
                    "code": "payment_required",
                }
            },
        )
        self.assertEqual(classify_openai_error(error), "INSUFFICIENT_QUOTA")

    def test_network_and_timeout_are_classified(self) -> None:
        self.assertEqual(
            classify_openai_error(openai.APIConnectionError(request=httpx.Request("POST", "https://api.openai.com/v1"))),
            "NETWORK_ERROR",
        )


class _FakeMessage:
    content = "ping"


class _FakeChoice:
    message = _FakeMessage()


class _FakeCompletion:
    choices = [_FakeChoice()]


class ProofLayerAgentConnectivityTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_agent_probe_cache()
        self.env_patch = patch.dict(
            os.environ,
            {"OPENAI_API_KEY": "sk-real-key-value", "OPENAI_BASE_URL": ""},
        )
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)

    def tearDown(self) -> None:
        reset_agent_probe_cache()

    async def _run_probe(self) -> tuple[bool, str | None]:
        return await probe_agent_connectivity()

    def test_probe_reports_authentication_failure_without_secrets(self) -> None:
        async def _raise_auth(*_args, **_kwargs):
            request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
            response = httpx.Response(401, request=request)
            raise openai.AuthenticationError(
                "Incorrect API key provided", response=response, body={}
            )

        fake_provider = type(
            "FakeProvider",
            (),
            {"chat": type("FakeChat", (), {"completions": type("FakeCompletions", (), {"create": _raise_auth})()})()},
        )
        with patch(
            "services.agent.verification_agent.AsyncOpenAI",
            return_value=fake_provider,
        ):
            ready, category = asyncio.run(self._run_probe())
        self.assertFalse(ready)
        self.assertEqual(category, "AUTHENTICATION_ERROR")

    def test_probe_reports_ready_on_success(self) -> None:
        async def _ok(*_args, **_kwargs):
            return _FakeCompletion()

        fake_provider = type(
            "FakeProvider",
            (),
            {"chat": type("FakeChat", (), {"completions": type("FakeCompletions", (), {"create": _ok})()})()},
        )
        with patch(
            "services.agent.verification_agent.AsyncOpenAI",
            return_value=fake_provider,
        ):
            ready, category = asyncio.run(self._run_probe())
        self.assertTrue(ready)
        self.assertIsNone(category)

    def test_run_verification_agent_surfaces_sanitized_provider_category(self) -> None:
        verification_calls: list[tuple[str, str]] = []

        class OfflineTools:
            def __init__(self, **_kwargs):
                pass

            def verify_claim(self, asset: str, claim: str) -> dict:
                verification_calls.append((asset, claim))
                return {
                    "asset": asset,
                    "claim": claim,
                    "verification_result": "FAIL",
                    "reason_codes": ["STALE_ATTESTATION"],
                    "evidence_root_count": 3,
                }

        async def _raise_auth(*_args, **_kwargs):
            request = httpx.Request("POST", "https://api.openai.com/v1/chat/completions")
            response = httpx.Response(401, request=request)
            raise openai.AuthenticationError(
                "Incorrect API key provided", response=response, body={}
            )

        fake_provider = type(
            "FakeProvider",
            (),
            {"chat": type("FakeChat", (), {"completions": type("FakeCompletions", (), {"create": _raise_auth})()})()},
        )
        with (
            patch(
                "services.agent.verification_agent.AsyncOpenAI",
                return_value=fake_provider,
            ),
            patch(
                "services.agent.verification_agent.ProofLayerTools",
                OfflineTools,
            ),
        ):
            with self.assertRaises(AgentExecutionError) as raised:
                asyncio.run(run_verification_agent("Investigate USDY TreasuryBacking"))
        message = str(raised.exception)
        self.assertIn("AUTHENTICATION_ERROR", message)
        self.assertIn("No verification result was fabricated", message)
        self.assertNotIn("sk-", message)
        self.assertEqual(verification_calls, [("USDY", "TreasuryBacking")])

    def test_health_reports_agent_configured_false_for_placeholder_key(self) -> None:
        with patch.dict(
            os.environ,
            {
                "AI_API_KEY": "",
                "OPENAI_API_KEY": "any-value",
                "OPENAI_BASE_URL": "",
                "NVIDIA_API_KEY": "",
            },
        ):
            reset_agent_probe_cache()
            response = TestClient(app).get("/health")
        payload = response.json()
        self.assertFalse(payload["agent_configured"])
        self.assertEqual(payload["backend_status"], "ONLINE")


if __name__ == "__main__":
    unittest.main()
