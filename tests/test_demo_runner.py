import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError

from apps.api.main import app
from services.agent.demo_models import DemoRunnerRequest
from services.agent.demo_runner import DemoRunnerError, DeterministicDemoRunner
from services.mcp_server.tools import ProofLayerToolError


CERTIFICATE_ID = "0x" + "ab" * 32


class RecordingTools:
    def __init__(self, *, fail_live: bool = False) -> None:
        self.calls: list[str] = []
        self.fail_live = fail_live

    def _record(self, tool: str) -> None:
        self.calls.append(tool)

    @staticmethod
    def _resolve(asset: str, claim: str | None = None) -> tuple[str, str]:
        normalized = asset.upper()
        if normalized not in {"USDY", "PAXG"}:
            raise ProofLayerToolError(f"unsupported asset {asset!r}")
        expected = "TreasuryBacking" if normalized == "USDY" else "GoldBacking"
        if claim is not None and claim.lower() != expected.lower():
            raise ProofLayerToolError(f"unsupported claim {claim!r}")
        return normalized, expected

    def get_asset_metadata(self, asset: str):
        self._record("get_asset_metadata")
        normalized, claim = self._resolve(asset)
        return {
            "asset": normalized,
            "claim": claim,
            "known_live_certificate_id": (
                CERTIFICATE_ID if normalized == "USDY" else None
            ),
            "policy": (
                "default-treasury-policy"
                if normalized == "USDY"
                else "default-gold-policy"
            ),
        }

    def get_evidence(self, asset: str, claim: str):
        self._record("get_evidence")
        normalized, expected = self._resolve(asset, claim)
        return {
            "asset": normalized,
            "claim": expected,
            "evidence_count": 7 if normalized == "USDY" else 6,
        }

    def analyze_provenance(self, asset: str, claim: str):
        self._record("analyze_provenance")
        normalized, expected = self._resolve(asset, claim)
        return {
            "asset": normalized,
            "claim": expected,
            "independent_root_count": 2 if normalized == "USDY" else 1,
        }

    def verify_claim(self, asset: str, claim: str):
        self._record("verify_claim")
        normalized, expected = self._resolve(asset, claim)
        return {
            "asset": normalized,
            "claim": expected,
            "verification_result": "INDETERMINATE",
            "reason_codes": (
                ["MISSING_EVIDENCE"]
                if normalized == "USDY"
                else ["STALE_ATTESTATION", "MISSING_EVIDENCE"]
            ),
            "known_live_certificate_id": (
                CERTIFICATE_ID if normalized == "USDY" else None
            ),
        }

    def get_certificate_state(self, certificate_id: str):
        self._record("get_certificate_state")
        if self.fail_live:
            raise ProofLayerToolError("mock X Layer outage")
        return {
            "certificate_id": certificate_id,
            "certificate_status": "REGISTERED_UNUSABLE",
            "registered": True,
            "usable": False,
            "result": "PASS",
        }

    def get_policygate_state(
        self, certificate_id: str, asset: str, claim: str, policy: str
    ):
        self._record("get_policygate_state")
        return {
            "certificate_id": certificate_id,
            "asset": asset,
            "claim": claim,
            "policy": policy,
            "policygate_outcome": "BLOCKED",
            "action_executed": False,
        }

    def get_decision_history(self, certificate_id: str):
        self._record("get_decision_history")
        return {
            "certificate_id": certificate_id,
            "matching_decision_count": 1,
        }


def request(scenario: str, **values: str) -> DemoRunnerRequest:
    return DemoRunnerRequest.model_validate({"scenario": scenario, **values})


class DeterministicDemoRunnerTests(unittest.TestCase):
    def runner(self, tools: RecordingTools | None = None) -> DeterministicDemoRunner:
        return DeterministicDemoRunner(
            tools or RecordingTools(),
            usdy_certificate_id=CERTIFICATE_ID,
        )

    def test_usdy_workflow_calls_expected_tools_in_order(self) -> None:
        tools = RecordingTools()
        response = self.runner(tools).run(request("usdy_treasury_verification"))
        self.assertEqual(
            tools.calls,
            [
                "get_asset_metadata",
                "get_evidence",
                "analyze_provenance",
                "verify_claim",
                "get_certificate_state",
                "get_policygate_state",
                "get_decision_history",
            ],
        )
        self.assertEqual(response.verification_result, "INDETERMINATE")
        self.assertEqual(response.certificate_status, "REGISTERED_UNUSABLE")
        self.assertEqual(response.policygate_outcome, "BLOCKED")

    def test_paxg_workflow_stops_when_no_certificate_fixture_exists(self) -> None:
        tools = RecordingTools()
        response = self.runner(tools).run(request("paxg_gold_verification"))
        self.assertEqual(
            tools.calls,
            [
                "get_asset_metadata",
                "get_evidence",
                "analyze_provenance",
                "verify_claim",
            ],
        )
        self.assertIsNone(response.certificate_status)
        self.assertIn("No exported certificate fixture exists", response.summary)

    def test_provenance_workflow_skips_certificate_tools(self) -> None:
        tools = RecordingTools()
        response = self.runner(tools).run(
            request(
                "provenance_inspection",
                asset="PAXG",
                claim="GoldBacking",
            )
        )
        self.assertEqual(tools.calls, ["get_evidence", "analyze_provenance"])
        self.assertIsNone(response.certificate_status)

    def test_eligibility_workflow_skips_evidence_and_verification_tools(self) -> None:
        tools = RecordingTools()
        response = self.runner(tools).run(
            request("usdy_certificate_eligibility")
        )
        self.assertEqual(
            tools.calls,
            [
                "get_certificate_state",
                "get_policygate_state",
                "get_decision_history",
            ],
        )
        self.assertIsNone(response.verification_result)

    def test_unsupported_scenario_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            request("make_up_a_result")

    def test_unsupported_asset_is_rejected(self) -> None:
        with self.assertRaisesRegex(DemoRunnerError, "unsupported asset"):
            self.runner().run(
                request(
                    "provenance_inspection",
                    asset="SOLAR",
                    claim="ProjectBacking",
                )
            )

    def test_summary_is_assembled_from_actual_tool_outputs(self) -> None:
        response = self.runner().run(request("paxg_gold_verification"))
        self.assertIn("INDETERMINATE", response.summary)
        self.assertIn("STALE_ATTESTATION, MISSING_EVIDENCE", response.summary)
        self.assertIn("1 independent evidence roots", response.summary)

    def test_trace_order_is_stable(self) -> None:
        expected = [
            "get_asset_metadata",
            "get_evidence",
            "analyze_provenance",
            "verify_claim",
            "get_certificate_state",
            "get_policygate_state",
            "get_decision_history",
        ]
        first = self.runner().run(request("usdy_treasury_verification"))
        second = self.runner().run(request("usdy_treasury_verification"))
        self.assertEqual([item.tool for item in first.trace], expected)
        self.assertEqual([item.tool for item in second.trace], expected)
        self.assertEqual([item.step for item in first.trace], list(range(1, 8)))

    def test_runner_needs_no_openai_api_key(self) -> None:
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
            response = self.runner().run(request("paxg_gold_verification"))
        self.assertEqual(response.mode, "deterministic_demo")

    def test_response_contains_no_agent_or_ai_terminology(self) -> None:
        response = self.runner().run(request("usdy_treasury_verification"))
        rendered = response.model_dump_json().lower()
        self.assertNotIn("ai agent", rendered)
        self.assertNotIn("autonomous agent", rendered)
        self.assertNotIn("llm", rendered)

    def test_workflows_only_call_the_read_only_allowlist(self) -> None:
        tools = RecordingTools()
        self.runner(tools).run(request("usdy_treasury_verification"))
        self.assertLessEqual(
            set(tools.calls),
            {
                "get_asset_metadata",
                "get_evidence",
                "analyze_provenance",
                "verify_claim",
                "get_certificate_state",
                "get_policygate_state",
                "get_decision_history",
            },
        )

    def test_network_failure_preserves_rvc_result_and_marks_live_state(self) -> None:
        tools = RecordingTools(fail_live=True)
        response = self.runner(tools).run(request("usdy_treasury_verification"))
        self.assertEqual(response.verification_result, "INDETERMINATE")
        self.assertEqual(response.certificate_status, "UNAVAILABLE")
        self.assertEqual(response.policygate_outcome, "NOT_CHECKED")
        self.assertEqual(response.trace[-1].tool, "get_certificate_state")
        self.assertEqual(response.trace[-1].status, "unavailable")
        self.assertNotIn("get_policygate_state", tools.calls)
        self.assertIn("PolicyGate was not checked", response.summary)

    def test_api_runs_demo_without_openai_key(self) -> None:
        demo_runner = self.runner()
        with (
            patch.dict(os.environ, {"OPENAI_API_KEY": ""}),
            patch("apps.api.main.demo_runner", demo_runner),
        ):
            response = TestClient(app).post(
                "/demo/run", json={"scenario": "paxg_gold_verification"}
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["mode"], "deterministic_demo")


if __name__ == "__main__":
    unittest.main()
