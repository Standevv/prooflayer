from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError

from apps.api.main import app
from services.developer_platform.models import DeveloperPlatformStatus
from services.developer_platform.status import DeveloperStatusService
from services.mcp_server.tools import (
    DECISION_LOG_ADDRESS,
    POLICY_GATE_ADDRESS,
    REGISTRY_ADDRESS,
)
from services.policy_integration.models import ProtocolCheckRequest


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "apps" / "web"


class FakeStatusTools:
    def __init__(self, *, chain_id: int = 1952, fail: bool = False) -> None:
        self.chain_id = chain_id
        self.fail = fail
        self.calls: list[str] = []

    def get_xlayer_status(self) -> dict[str, object]:
        self.calls.append("get_xlayer_status")
        if self.fail:
            raise RuntimeError("mock RPC outage")
        return {
            "network": "X Layer Testnet",
            "chain_id": self.chain_id,
            "latest_block": 38_765_432,
            "read_only": True,
        }


class DeveloperPlatformTests(unittest.TestCase):
    def test_connected_xlayer_status_is_reported_from_live_reader(self) -> None:
        result = DeveloperStatusService(
            FakeStatusTools(), agent_configured=lambda: False
        ).get_status()
        self.assertEqual(result.xlayer.status, "CONNECTED")
        self.assertIn("LIVE READ", result.xlayer.authenticity_labels)

    def test_latest_block_is_preserved(self) -> None:
        result = DeveloperStatusService(
            FakeStatusTools(), agent_configured=lambda: False
        ).get_status()
        self.assertEqual(result.latest_block, 38_765_432)

    def test_rpc_outage_is_explicitly_unavailable(self) -> None:
        result = DeveloperStatusService(
            FakeStatusTools(fail=True), agent_configured=lambda: False
        ).get_status()
        self.assertEqual(result.xlayer.status, "UNAVAILABLE")
        self.assertIsNone(result.latest_block)

    def test_wrong_chain_is_not_reported_as_connected(self) -> None:
        result = DeveloperStatusService(
            FakeStatusTools(chain_id=1), agent_configured=lambda: False
        ).get_status()
        self.assertEqual(result.xlayer.status, "UNAVAILABLE")

    def test_unconfigured_ai_is_not_claimed_available(self) -> None:
        result = DeveloperStatusService(
            FakeStatusTools(), agent_configured=lambda: False
        ).get_status()
        self.assertEqual(result.ai_agent.status, "UNCONFIGURED")

    def test_configured_ai_is_reported_available(self) -> None:
        result = DeveloperStatusService(
            FakeStatusTools(), agent_configured=lambda: True
        ).get_status()
        self.assertEqual(result.ai_agent.status, "AVAILABLE")

    def test_status_uses_actual_deployed_contract_addresses(self) -> None:
        result = DeveloperStatusService(
            FakeStatusTools(), agent_configured=lambda: False
        ).get_status()
        addresses = {contract.name: contract.address for contract in result.contracts}
        self.assertEqual(addresses["CertificateRegistry"], REGISTRY_ADDRESS)
        self.assertEqual(addresses["PolicyGate"], POLICY_GATE_ADDRESS)
        self.assertEqual(addresses["DecisionLog"], DECISION_LOG_ADDRESS)

    def test_status_performs_only_one_read_only_tool_call(self) -> None:
        tools = FakeStatusTools()
        result = DeveloperStatusService(tools, agent_configured=lambda: False).get_status()
        self.assertEqual(tools.calls, ["get_xlayer_status"])
        self.assertFalse(result.write_operations_exposed)
        self.assertFalse(result.blockchain_write_performed)

    def test_write_flags_cannot_be_changed_to_true(self) -> None:
        payload = DeveloperStatusService(
            FakeStatusTools(), agent_configured=lambda: False
        ).get_status().model_dump()
        payload["blockchain_write_performed"] = True
        with self.assertRaises(ValidationError):
            DeveloperPlatformStatus.model_validate(payload)

    def test_developer_status_endpoint_returns_safe_metadata(self) -> None:
        service = DeveloperStatusService(
            FakeStatusTools(), agent_configured=lambda: False
        )
        with patch("apps.api.main.developer_status", service):
            response = TestClient(app).get("/developer/status")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["chain_id"], 1952)
        self.assertFalse(body["write_operations_exposed"])
        self.assertNotIn("private_key", str(body).lower())

    def test_openapi_contains_all_documented_python_routes(self) -> None:
        paths = app.openapi()["paths"]
        for route in (
            "/health",
            "/agent/verify",
            "/demo/run",
            "/protocol/check",
            "/certificates",
            "/certificates/{certificate_id}",
            "/evidence",
            "/evidence/{asset}",
            "/developer/status",
        ):
            self.assertIn(route, paths)

    def test_quick_start_body_matches_protocol_schema(self) -> None:
        request = ProtocolCheckRequest.model_validate(
            {
                "protocol_type": "lending",
                "asset": "USDY",
                "claim": "TreasuryBacking",
                "action": "accept_as_collateral",
            }
        )
        self.assertEqual(request.claim, "TreasuryBacking")

    def test_unsupported_quick_start_action_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            ProtocolCheckRequest.model_validate(
                {
                    "protocol_type": "lending",
                    "asset": "USDY",
                    "claim": "TreasuryBacking",
                    "action": "execute_verified_action",
                }
            )

    def test_developer_page_documents_required_endpoints(self) -> None:
        source = (WEB / "lib" / "developers.ts").read_text(encoding="utf-8")
        for route in (
            "/health",
            "/agent/verify",
            "/demo/run",
            "/protocol/check",
            "/certificates/{certificate_id}",
            "/evidence/{asset}",
        ):
            self.assertIn(route, source)

    def test_playground_uses_only_existing_read_only_gateways(self) -> None:
        source = (WEB / "components" / "developer-playground.tsx").read_text(
            encoding="utf-8"
        )
        for route in (
            "/api/protocol/check",
            "/api/evidence/",
            "/api/certificates/",
            "/api/demo/run",
            "/api/agent/verify",
        ):
            self.assertIn(route, source)
        self.assertNotIn("executeVerifiedAction", source)

    def test_certificate_playground_validates_bytes32_before_fetch(self) -> None:
        source = (WEB / "components" / "developer-playground.tsx").read_text(
            encoding="utf-8"
        )
        self.assertIn("isCertificateId(certificateId)", source)

    def test_ai_operation_is_disabled_when_not_configured(self) -> None:
        source = (WEB / "components" / "developer-playground.tsx").read_text(
            encoding="utf-8"
        )
        self.assertIn("agentDisabled", source)
        self.assertIn("AI Agent is not configured", source)

    def test_native_examples_do_not_claim_an_sdk(self) -> None:
        source = (WEB / "lib" / "developers.ts").read_text(encoding="utf-8")
        self.assertIn('fetch("/api/protocol/check"', source)
        self.assertIn("from urllib.request import Request, urlopen", source)
        self.assertIn("curl --request POST", source)
        self.assertNotIn("ProofLayerSDK", source)

    def test_code_examples_contain_no_private_keys_or_credentials(self) -> None:
        source = (WEB / "lib" / "developers.ts").read_text(encoding="utf-8")
        lowered = source.lower()
        self.assertNotIn("deployer_private_key", lowered)
        self.assertNotIn("api_key=", lowered)
        self.assertNotIn("authorization: bearer", lowered)

    def test_solidity_example_uses_real_policygate_view_signature(self) -> None:
        source = (WEB / "lib" / "developers.ts").read_text(encoding="utf-8")
        self.assertIn("function validateAction(", source)
        self.assertIn(") external view returns (bool);", source)
        self.assertNotIn("executeVerifiedAction(", source)

    def test_exact_openapi_frontend_route_exists(self) -> None:
        source = (WEB / "app" / "openapi.json" / "route.ts").read_text(
            encoding="utf-8"
        )
        self.assertIn("/openapi.json", source)
        self.assertIn('cache: "no-store"', source)


if __name__ == "__main__":
    unittest.main()
