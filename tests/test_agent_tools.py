import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from apps.api.main import app
from services.agent.models import AgentResponse
from services.agent.verification_agent import (
    ground_agent_response,
    is_agent_configured,
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
        with patch.dict(os.environ, {"OPENAI_API_KEY": "", "OPENAI_BASE_URL": ""}):
            self.assertFalse(is_agent_configured())
            response = TestClient(app).post(
                "/agent/verify", json={"query": "Investigate USDY TreasuryBacking"}
            )
        self.assertEqual(response.status_code, 503)
        self.assertFalse(response.json()["available"])
        self.assertIn("unavailable", response.json()["error"].lower())

    def test_gateway_configuration_alone_enables_the_agent(self) -> None:
        with patch.dict(os.environ, {"OPENAI_API_KEY": "", "OPENAI_BASE_URL": "http://localhost:5000/v1"}):
            self.assertTrue(is_agent_configured())

    def test_api_accepts_documented_message_request_shape(self) -> None:
        with patch.dict(os.environ, {"OPENAI_API_KEY": "", "OPENAI_BASE_URL": ""}):
            response = TestClient(app).post(
                "/agent/verify", json={"message": "Investigate PAXG GoldBacking"}
            )
        self.assertEqual(response.status_code, 503)


if __name__ == "__main__":
    unittest.main()
