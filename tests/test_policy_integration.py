import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError

from apps.api.main import app
from services.mcp_server.tools import ProofLayerToolError
from services.policy_integration.evaluator import (
    ProtocolIntegrationError,
    ProtocolPolicyEvaluator,
)
from services.policy_integration.models import (
    PROTOCOL_PRESETS,
    ProtocolCheckRequest,
)


CERTIFICATE_ID = "0x" + "cd" * 32


class ProtocolTools:
    def __init__(
        self,
        *,
        verification_result: str = "PASS",
        certificate_state: str = "usable",
        policygate_outcome: str = "ALLOWED",
        no_fixture: bool = False,
    ) -> None:
        self.verification_result = verification_result
        self.certificate_state = certificate_state
        self.policygate_outcome = policygate_outcome
        self.no_fixture = no_fixture
        self.calls: list[str] = []

    def get_asset_metadata(self, asset: str):
        self.calls.append("get_asset_metadata")
        claim = "TreasuryBacking" if asset == "USDY" else "GoldBacking"
        return {
            "asset": asset,
            "claim": claim,
            "known_live_certificate_id": None if self.no_fixture else CERTIFICATE_ID,
            "policy": (
                "default-treasury-policy"
                if asset == "USDY"
                else "default-gold-policy"
            ),
        }

    def verify_claim(self, asset: str, claim: str):
        self.calls.append("verify_claim")
        reasons = {
            "PASS": [],
            "FAIL": ["INSUFFICIENT_BACKING"],
            "INDETERMINATE": ["MISSING_EVIDENCE"],
        }[self.verification_result]
        return {
            "asset": asset,
            "claim": claim,
            "verification_result": self.verification_result,
            "reason_codes": reasons,
            "evidence_root_count": 2,
        }

    def get_certificate_state(self, certificate_id: str):
        self.calls.append("get_certificate_state")
        if self.certificate_state == "rpc_unavailable":
            raise ProofLayerToolError("mock X Layer outage")
        if self.certificate_state == "missing":
            return {
                "certificate_id": certificate_id,
                "certificate_status": "NOT_REGISTERED",
                "exists": False,
                "registered": False,
                "usable": False,
                "revoked": False,
                "valid_until": None,
            }
        usable = self.certificate_state == "usable"
        return {
            "certificate_id": certificate_id,
            "certificate_status": (
                "REGISTERED_USABLE" if usable else "REGISTERED_UNUSABLE"
            ),
            "exists": True,
            "registered": True,
            "usable": usable,
            "revoked": self.certificate_state == "revoked",
            "valid_until": (
                1_900_000 if self.certificate_state == "expired" else 2_100_000
            ),
        }

    def get_policygate_state(
        self, certificate_id: str, asset: str, claim: str, policy: str
    ):
        self.calls.append("get_policygate_state")
        if self.policygate_outcome == "UNAVAILABLE":
            raise ProofLayerToolError("mock PolicyGate outage")
        return {
            "certificate_id": certificate_id,
            "asset": asset,
            "claim": claim,
            "policy": policy,
            "policygate_outcome": self.policygate_outcome,
            "action_executed": False,
        }


class UnavailableVerificationTools(ProtocolTools):
    def verify_claim(self, asset: str, claim: str):
        self.calls.append("verify_claim")
        raise ProofLayerToolError("mock verification service outage")


def request(
    *,
    protocol_type: str = "lending",
    asset: str = "USDY",
    claim: str = "TreasuryBacking",
    action: str = "accept_as_collateral",
) -> ProtocolCheckRequest:
    return ProtocolCheckRequest.model_validate(
        {
            "protocol_type": protocol_type,
            "asset": asset,
            "claim": claim,
            "action": action,
        }
    )


class ProtocolPolicyEvaluatorTests(unittest.TestCase):
    def evaluate(self, tools: ProtocolTools, check: ProtocolCheckRequest | None = None):
        return ProtocolPolicyEvaluator(tools, now=lambda: 2_000_000).check(
            check or request()
        )

    def test_pass_usable_allowed_returns_accept(self) -> None:
        result = self.evaluate(ProtocolTools())
        self.assertEqual(result.final_protocol_recommendation, "ACCEPT")
        self.assertEqual(result.verification_result, "PASS")
        self.assertEqual(result.certificate_state, "USABLE")
        self.assertEqual(result.policygate_outcome, "ALLOWED")
        self.assertFalse(result.blockchain_write_performed)

    def test_pass_with_expired_certificate_returns_reject(self) -> None:
        result = self.evaluate(
            ProtocolTools(certificate_state="expired", policygate_outcome="BLOCKED")
        )
        self.assertEqual(result.final_protocol_recommendation, "REJECT")
        self.assertEqual(result.certificate_state, "EXPIRED")
        self.assertIn("Certificate is expired and unusable.", result.blocking_reasons)

    def test_indeterminate_returns_review_required_without_becoming_fail(self) -> None:
        result = self.evaluate(
            ProtocolTools(
                verification_result="INDETERMINATE",
                certificate_state="expired",
                policygate_outcome="BLOCKED",
            )
        )
        self.assertEqual(result.verification_result, "INDETERMINATE")
        self.assertEqual(result.final_protocol_recommendation, "REVIEW_REQUIRED")
        self.assertIn("MISSING_EVIDENCE", result.reason_codes)

    def test_fail_returns_reject(self) -> None:
        result = self.evaluate(ProtocolTools(verification_result="FAIL"))
        self.assertEqual(result.final_protocol_recommendation, "REJECT")
        self.assertIn("INSUFFICIENT_BACKING", result.reason_codes)

    def test_confirmed_missing_certificate_returns_reject_for_pass(self) -> None:
        tools = ProtocolTools(certificate_state="missing")
        result = self.evaluate(tools)
        self.assertEqual(result.certificate_state, "NO_CERTIFICATE")
        self.assertEqual(result.final_protocol_recommendation, "REJECT")
        self.assertEqual(result.policygate_outcome, "NOT_CHECKED")
        self.assertNotIn("get_policygate_state", tools.calls)

    def test_revoked_certificate_returns_reject(self) -> None:
        result = self.evaluate(
            ProtocolTools(certificate_state="revoked", policygate_outcome="BLOCKED")
        )
        self.assertEqual(result.certificate_state, "REVOKED")
        self.assertEqual(result.final_protocol_recommendation, "REJECT")

    def test_blocked_policygate_returns_reject(self) -> None:
        result = self.evaluate(ProtocolTools(policygate_outcome="BLOCKED"))
        self.assertEqual(result.certificate_state, "USABLE")
        self.assertEqual(result.final_protocol_recommendation, "REJECT")

    def test_rpc_unavailable_returns_review_required(self) -> None:
        tools = ProtocolTools(certificate_state="rpc_unavailable")
        result = self.evaluate(tools)
        self.assertEqual(result.verification_status, "COMPLETED")
        self.assertEqual(result.certificate_state, "LIVE_READ_UNAVAILABLE")
        self.assertEqual(result.policygate_outcome, "NOT_CHECKED")
        self.assertEqual(result.final_protocol_recommendation, "REVIEW_REQUIRED")
        self.assertEqual(result.trace[-1].status, "unavailable")
        self.assertNotIn("get_policygate_state", tools.calls)

    def test_verification_service_unavailable_is_reported_separately(self) -> None:
        tools = UnavailableVerificationTools()
        result = self.evaluate(tools)
        self.assertEqual(result.verification_status, "UNAVAILABLE")
        self.assertIsNone(result.verification_result)
        self.assertEqual(result.certificate_state, "NOT_CHECKED")
        self.assertEqual(result.policygate_outcome, "NOT_CHECKED")
        self.assertEqual(result.final_protocol_recommendation, "REVIEW_REQUIRED")
        self.assertEqual(tools.calls, ["get_asset_metadata", "verify_claim"])

    def test_unsupported_asset_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            request(asset="SOLAR", claim="TreasuryBacking")

    def test_unsupported_claim_is_rejected(self) -> None:
        with self.assertRaisesRegex(ProtocolIntegrationError, "unsupported claim"):
            self.evaluate(
                ProtocolTools(),
                request(asset="USDY", claim="GoldBacking"),
            )

    def test_action_must_match_the_selected_preset(self) -> None:
        with self.assertRaisesRegex(ProtocolIntegrationError, "does not match"):
            self.evaluate(
                ProtocolTools(),
                request(action="admit_to_vault"),
            )

    def test_protocol_presets_share_policy_but_resolve_distinct_context(self) -> None:
        self.assertEqual(set(PROTOCOL_PRESETS), {"lending", "rwa_vault", "treasury_management"})
        self.assertEqual(
            {preset.action for preset in PROTOCOL_PRESETS.values()},
            {
                "accept_as_collateral",
                "admit_to_vault",
                "approve_for_treasury_allocation",
            },
        )
        self.assertTrue(
            all(preset.policy.require_pass_result for preset in PROTOCOL_PRESETS.values())
        )
        self.assertEqual(
            len({preset.policy.model_dump_json() for preset in PROTOCOL_PRESETS.values()}),
            1,
        )

    def test_no_blockchain_write_methods_are_invoked(self) -> None:
        tools = ProtocolTools()
        self.evaluate(tools)
        self.assertEqual(
            tools.calls,
            [
                "get_asset_metadata",
                "verify_claim",
                "get_certificate_state",
                "get_policygate_state",
            ],
        )

    def test_paxg_without_fixture_does_not_infer_onchain_state(self) -> None:
        tools = ProtocolTools(
            verification_result="INDETERMINATE",
            no_fixture=True,
        )
        result = self.evaluate(
            tools,
            request(
                asset="PAXG",
                claim="GoldBacking",
            ),
        )
        self.assertIsNone(result.certificate_exists)
        self.assertEqual(result.certificate_state, "NO_CERTIFICATE_FIXTURE")
        self.assertEqual(result.policygate_outcome, "NOT_CHECKED")
        self.assertEqual(result.final_protocol_recommendation, "REVIEW_REQUIRED")
        self.assertEqual(tools.calls, ["get_asset_metadata", "verify_claim"])

    def test_api_requires_no_openai_or_private_key(self) -> None:
        evaluator = ProtocolPolicyEvaluator(ProtocolTools(), now=lambda: 2_000_000)
        with (
            patch.dict(
                os.environ,
                {"OPENAI_API_KEY": "", "DEPLOYER_PRIVATE_KEY": ""},
            ),
            patch("apps.api.main.protocol_evaluator", evaluator),
        ):
            response = TestClient(app).post(
                "/protocol/check",
                json={
                    "protocol_type": "lending",
                    "asset": "USDY",
                    "claim": "TreasuryBacking",
                    "action": "accept_as_collateral",
                },
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["final_protocol_recommendation"], "ACCEPT")


if __name__ == "__main__":
    unittest.main()
