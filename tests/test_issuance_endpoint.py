"""Offline tests for the certificate-issuance authority boundary."""

from __future__ import annotations

import json
import tempfile
import threading
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from apps.api.main import app
from services.blockchain.issuance_control import issuance_coordinator
from services.blockchain.issuer import (
    IssuanceReadBack,
    IssuanceReadiness,
    IssuanceResult,
)


OPERATOR_TOKEN = "development-testnet-token-" + "x" * 40
OPERATOR_ID = "testnet-operator"
BASE_PAYLOAD = {
    "asset": "USDY",
    "claim": "TreasuryBacking",
    "policy_id": "default-treasury-policy",
}


def _ready_readiness() -> IssuanceReadiness:
    return IssuanceReadiness(
        ready=True,
        static_ready=True,
        chain_matches=True,
        registry_has_code=True,
        signer_key_present=True,
        rpc_reachable=True,
        note="readiness verified",
        enabled=True,
        operator_auth_configured=True,
    )


def _pass_detail(*, simulation: bool = False) -> SimpleNamespace:
    observed_at = datetime.now(timezone.utc)
    valid_until = observed_at + timedelta(hours=1)
    predicate = SimpleNamespace(
        predicate="attestation is fresh",
        passed=True,
        expected="age <= 24h",
        observed="age = 1h",
        reason_code=None,
    )
    return SimpleNamespace(
        asset="USDY",
        claim="TreasuryBacking",
        verification=SimpleNamespace(
            result="PASS",
            current_rvc_result="PASS",
            reason_codes=[],
            simulation=simulation,
            policy_id="default-treasury-policy",
            policy_version="1.0",
            predicates=[predicate],
            observed_at=observed_at.isoformat(),
            valid_until=valid_until.isoformat(),
        ),
        evidence_commitment=SimpleNamespace(
            value="0x" + "e" * 64,
            independent_root_count=3,
        ),
        provenance=SimpleNamespace(independent_root_count=3),
    )


def _success_result() -> IssuanceResult:
    return IssuanceResult(
        success=True,
        certificate_id="0x" + "a" * 64,
        transaction_hash="0x" + "f" * 64,
        block_number=12345,
        read_back=None,
        error=None,
        error_code=None,
        network="X Layer Testnet",
        chain_id=1952,
    )


class TestIssuanceEndpoint(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.audit_path = Path(self.temp_dir.name) / "issuance-audit.jsonl"
        self.env = patch.dict(
            "os.environ",
            {
                "PROOFLAYER_TESTNET_ISSUANCE_ENABLED": "true",
                "PROOFLAYER_OPERATOR_TOKEN": OPERATOR_TOKEN,
                "PROOFLAYER_OPERATOR_ID": OPERATOR_ID,
                "PROOFLAYER_ISSUANCE_AUDIT_PATH": str(self.audit_path),
            },
            clear=False,
        )
        self.env.start()
        self.addCleanup(self.env.stop)
        issuance_coordinator.clear_for_tests()
        self.client = TestClient(app)

    @staticmethod
    def _headers(key: str = "request-key-0001") -> dict[str, str]:
        return {
            "Authorization": f"Bearer {OPERATOR_TOKEN}",
            "Idempotency-Key": key,
        }

    def _post(
        self,
        payload: dict[str, object] | None = None,
        *,
        headers: dict[str, str] | None = None,
    ):
        return self.client.post(
            "/certificates/issue",
            json=payload or BASE_PAYLOAD,
            headers=headers or self._headers(),
        )

    def test_issuance_disabled_fails_closed_before_signer_or_readiness(self) -> None:
        with (
            patch.dict(
                "os.environ",
                {"PROOFLAYER_TESTNET_ISSUANCE_ENABLED": "false"},
                clear=False,
            ),
            patch("apps.api.main.check_issuance_readiness") as readiness,
            patch("apps.api.main.issue_certificate") as signer,
        ):
            response = self._post()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["error_code"], "ISSUANCE_DISABLED")
        readiness.assert_not_called()
        signer.assert_not_called()

    def test_unauthenticated_issuance_fails_before_signer_or_readiness(self) -> None:
        with (
            patch("apps.api.main.check_issuance_readiness") as readiness,
            patch("apps.api.main.issue_certificate") as signer,
        ):
            response = self._post(headers={"Idempotency-Key": "request-key-0002"})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error_code"], "UNAUTHORIZED_OPERATOR")
        self.assertEqual(response.headers["www-authenticate"], "Bearer")
        readiness.assert_not_called()
        signer.assert_not_called()

    def test_misconfigured_short_token_fails_closed(self) -> None:
        with (
            patch.dict(
                "os.environ", {"PROOFLAYER_OPERATOR_TOKEN": "too-short"}, clear=False
            ),
            patch("apps.api.main.issue_certificate") as signer,
        ):
            response = self._post()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(
            response.json()["error_code"], "OPERATOR_AUTH_NOT_CONFIGURED"
        )
        signer.assert_not_called()

    def test_missing_idempotency_key_fails_before_signer(self) -> None:
        with patch("apps.api.main.issue_certificate") as signer:
            response = self._post(
                headers={"Authorization": f"Bearer {OPERATOR_TOKEN}"}
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error_code"], "INVALID_IDEMPOTENCY_KEY")
        signer.assert_not_called()

    def test_caller_cannot_supply_or_extend_validity(self) -> None:
        payload = dict(BASE_PAYLOAD)
        payload["valid_until"] = int(
            (datetime.now(timezone.utc) + timedelta(days=365)).timestamp()
        )
        with patch("apps.api.main.issue_certificate") as signer:
            response = self._post(payload)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"][0]["type"], "extra_forbidden")
        signer.assert_not_called()

    def test_non_pass_cannot_issue(self) -> None:
        detail = _pass_detail()
        detail.verification.result = "FAIL"
        detail.verification.current_rvc_result = "FAIL"
        detail.verification.reason_codes = ["STALE_ATTESTATION"]
        with (
            patch("apps.api.main.check_issuance_readiness", return_value=_ready_readiness()),
            patch("apps.api.main.evidence_explorer.get_asset", return_value=detail),
            patch("apps.api.main.issue_certificate") as signer,
        ):
            response = self._post()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error_code"], "RVC_NOT_PASS")
        self.assertIn("STALE_ATTESTATION", response.json()["error"])
        signer.assert_not_called()

    def test_conflicting_current_rvc_result_fields_fail_closed(self) -> None:
        detail = _pass_detail()
        detail.verification.result = "FAIL"
        with (
            patch("apps.api.main.check_issuance_readiness", return_value=_ready_readiness()),
            patch("apps.api.main.evidence_explorer.get_asset", return_value=detail),
            patch("apps.api.main.issue_certificate") as signer,
        ):
            response = self._post(headers=self._headers("rvc-result-mismatch"))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error_code"], "RVC_RESULT_MISMATCH")
        signer.assert_not_called()

    def test_simulated_pass_cannot_issue(self) -> None:
        with (
            patch("apps.api.main.check_issuance_readiness", return_value=_ready_readiness()),
            patch(
                "apps.api.main.evidence_explorer.get_asset",
                return_value=_pass_detail(simulation=True),
            ),
            patch("apps.api.main.issue_certificate") as signer,
        ):
            response = self._post()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error_code"], "SIMULATED_VERIFICATION")
        signer.assert_not_called()

    def test_authoritative_certificate_fields_are_preserved(self) -> None:
        detail = _pass_detail()
        with (
            patch("apps.api.main.check_issuance_readiness", return_value=_ready_readiness()),
            patch("apps.api.main.evidence_explorer.get_asset", return_value=detail),
            patch("apps.api.main.issue_certificate", return_value=_success_result()) as signer,
        ):
            response = self._post()
        self.assertEqual(response.status_code, 200, response.text)
        certificate = signer.call_args.args[0]
        self.assertEqual(certificate.observed_at.isoformat(), detail.verification.observed_at)
        self.assertEqual(certificate.valid_until.isoformat(), detail.verification.valid_until)
        self.assertEqual(certificate.result.value, "PASS")
        self.assertEqual(certificate.evidence_root, "0x" + "e" * 64)
        self.assertEqual(certificate.independent_root_count, 3)
        self.assertEqual(len(certificate.predicate_results), 1)
        self.assertEqual(certificate.predicate_results[0].predicate, "attestation is fresh")
        self.assertEqual(certificate.reason_codes, [])
        self.assertFalse(certificate.simulation_flag)
        self.assertEqual(signer.call_args.kwargs["operator_id"], OPERATOR_ID)
        self.assertTrue(signer.call_args.kwargs["request_id"])

    def test_rvc_and_provenance_root_count_mismatch_fails_closed(self) -> None:
        detail = _pass_detail()
        detail.provenance.independent_root_count = 2
        with (
            patch("apps.api.main.check_issuance_readiness", return_value=_ready_readiness()),
            patch("apps.api.main.evidence_explorer.get_asset", return_value=detail),
            patch("apps.api.main.issue_certificate") as signer,
        ):
            response = self._post(headers=self._headers("root-count-mismatch"))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["error_code"], "RVC_PROVENANCE_MISMATCH"
        )
        signer.assert_not_called()

    def test_concurrent_duplicate_is_coalesced_to_one_signer_call(self) -> None:
        detail = _pass_detail()
        signer_started = threading.Event()
        release_signer = threading.Event()

        def delayed_success(*_args, **_kwargs):
            signer_started.set()
            self.assertTrue(release_signer.wait(timeout=5))
            return _success_result()

        responses: list[object] = []

        def submit() -> None:
            responses.append(
                TestClient(app).post(
                    "/certificates/issue",
                    json=BASE_PAYLOAD,
                    headers=self._headers("concurrent-request-key"),
                )
            )

        with (
            patch("apps.api.main.check_issuance_readiness", return_value=_ready_readiness()),
            patch("apps.api.main.evidence_explorer.get_asset", return_value=detail),
            patch("apps.api.main.issue_certificate", side_effect=delayed_success) as signer,
        ):
            first = threading.Thread(target=submit)
            second = threading.Thread(target=submit)
            first.start()
            self.assertTrue(signer_started.wait(timeout=5))
            second.start()
            time.sleep(0.05)
            release_signer.set()
            first.join(timeout=5)
            second.join(timeout=5)

        self.assertFalse(first.is_alive())
        self.assertFalse(second.is_alive())
        self.assertEqual(signer.call_count, 1)
        self.assertEqual(len(responses), 2)
        self.assertTrue(all(item.status_code == 200 for item in responses))
        bodies = [item.json() for item in responses]
        self.assertEqual(bodies[0]["request_id"], bodies[1]["request_id"])
        self.assertEqual(
            sorted(body["idempotent_replay"] for body in bodies), [False, True]
        )

    def test_concurrent_identical_request_with_distinct_keys_is_coalesced(self) -> None:
        detail = _pass_detail()
        signer_started = threading.Event()
        release_signer = threading.Event()

        def delayed_success(*_args, **_kwargs):
            signer_started.set()
            self.assertTrue(release_signer.wait(timeout=5))
            return _success_result()

        responses: list[object] = []

        def submit(key: str) -> None:
            responses.append(
                TestClient(app).post(
                    "/certificates/issue",
                    json=BASE_PAYLOAD,
                    headers=self._headers(key),
                )
            )

        with (
            patch("apps.api.main.check_issuance_readiness", return_value=_ready_readiness()),
            patch("apps.api.main.evidence_explorer.get_asset", return_value=detail),
            patch("apps.api.main.issue_certificate", side_effect=delayed_success) as signer,
        ):
            first = threading.Thread(target=submit, args=("distinct-key-one",))
            second = threading.Thread(target=submit, args=("distinct-key-two",))
            first.start()
            self.assertTrue(signer_started.wait(timeout=5))
            second.start()
            time.sleep(0.05)
            release_signer.set()
            first.join(timeout=5)
            second.join(timeout=5)

        self.assertEqual(signer.call_count, 1)
        self.assertEqual(len(responses), 2)
        self.assertTrue(all(item.status_code == 200 for item in responses))
        bodies = [item.json() for item in responses]
        self.assertEqual(bodies[0]["request_id"], bodies[1]["request_id"])

    def test_audit_records_operator_request_and_outcome_without_token(self) -> None:
        with (
            patch("apps.api.main.check_issuance_readiness", return_value=_ready_readiness()),
            patch("apps.api.main.evidence_explorer.get_asset", return_value=_pass_detail()),
            patch("apps.api.main.issue_certificate", return_value=_success_result()),
        ):
            response = self._post(headers=self._headers("auditable-request-key"))
        self.assertEqual(response.status_code, 200)
        records = [json.loads(line) for line in self.audit_path.read_text().splitlines()]
        self.assertEqual([item["event"] for item in records], [
            "ISSUANCE_REQUEST_AUTHORIZED",
            "ISSUANCE_REQUEST_COMPLETED",
        ])
        self.assertTrue(all(item["operator_id"] == OPERATOR_ID for item in records))
        rendered = self.audit_path.read_text(encoding="utf-8")
        self.assertNotIn(OPERATOR_TOKEN, rendered)
        self.assertNotIn("auditable-request-key", rendered)

    def test_post_submit_failure_keeps_transaction_identity_in_response_and_audit(self) -> None:
        transaction_hash = "0x" + "f" * 64
        failure = IssuanceResult(
            success=False,
            certificate_id="0x" + "a" * 64,
            transaction_hash=transaction_hash,
            block_number=12345,
            read_back=IssuanceReadBack(
                matches=False,
                registered=True,
                usable=False,
            ),
            error="Post-submit verification failed",
            error_code="POST_SUBMIT_VERIFICATION_FAILED",
            network="X Layer Testnet",
            chain_id=1952,
        )
        with (
            patch("apps.api.main.check_issuance_readiness", return_value=_ready_readiness()),
            patch("apps.api.main.evidence_explorer.get_asset", return_value=_pass_detail()),
            patch("apps.api.main.issue_certificate", return_value=failure),
        ):
            response = self._post(headers=self._headers("post-submit-failure"))

        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertEqual(body["transaction_hash"], transaction_hash)
        self.assertEqual(body["block_number"], 12345)
        self.assertEqual(body["error_code"], "POST_SUBMIT_VERIFICATION_FAILED")
        completed = [
            json.loads(line)
            for line in self.audit_path.read_text(encoding="utf-8").splitlines()
            if json.loads(line)["event"] == "ISSUANCE_REQUEST_COMPLETED"
        ]
        self.assertEqual(completed[0]["transaction_hash"], transaction_hash)
        self.assertEqual(completed[0]["block_number"], 12345)
        self.assertEqual(completed[0]["read_back"]["registered"], True)


if __name__ == "__main__":
    unittest.main()
