"""Tests for the certificate issuance layer."""

from __future__ import annotations

import json
import os
import subprocess
import threading
import time
import unittest
from datetime import datetime, timedelta, timezone
from typing import Any
from unittest.mock import MagicMock, patch

from services.blockchain.issuer import (
    IssuanceReadiness,
    IssuanceResult,
    check_issuance_readiness,
    is_issuance_available,
    issue_certificate as _issue_certificate,
)
from services.rvc.models import VerificationCertificate, VerificationResult
from services.rvc.certificate_serializer import serialize_certificate


def _pass_certificate() -> VerificationCertificate:
    observed_at = datetime.now(timezone.utc)
    return VerificationCertificate(
        certificate_id="0x" + "a" * 64,
        asset_id="USDY",
        claim_type="TreasuryBacking",
        claim_version="1.0",
        policy_id="default-treasury-policy",
        policy_version="1.0",
        result=VerificationResult.PASS,
        predicate_results=[],
        reason_codes=[],
        evidence_root="0x" + "b" * 64,
        independent_root_count=3,
        observed_at=observed_at,
        valid_until=observed_at + timedelta(hours=1),
    )


def issue_certificate(certificate: object) -> IssuanceResult:
    """Invoke the signer boundary with authenticated test context."""

    return _issue_certificate(
        certificate,  # type: ignore[arg-type]
        request_id="00000000-0000-4000-8000-000000000001",
        operator_id="testnet-operator",
    )


def _fail_certificate() -> VerificationCertificate:
    cert = _pass_certificate()
    return VerificationCertificate(
        certificate_id=cert.certificate_id,
        asset_id=cert.asset_id,
        claim_type=cert.claim_type,
        claim_version=cert.claim_version,
        policy_id=cert.policy_id,
        policy_version=cert.policy_version,
        result=VerificationResult.FAIL,
        predicate_results=cert.predicate_results,
        reason_codes=cert.reason_codes,
        evidence_root=cert.evidence_root,
        independent_root_count=cert.independent_root_count,
        observed_at=cert.observed_at,
        valid_until=cert.valid_until,
    )


def _indeterminate_certificate() -> VerificationCertificate:
    cert = _pass_certificate()
    return VerificationCertificate(
        certificate_id=cert.certificate_id,
        asset_id=cert.asset_id,
        claim_type=cert.claim_type,
        claim_version=cert.claim_version,
        policy_id=cert.policy_id,
        policy_version=cert.policy_version,
        result=VerificationResult.INDETERMINATE,
        predicate_results=cert.predicate_results,
        reason_codes=cert.reason_codes,
        evidence_root=cert.evidence_root,
        independent_root_count=cert.independent_root_count,
        observed_at=cert.observed_at,
        valid_until=cert.valid_until,
    )


class TestIsIssuanceAvailable(unittest.TestCase):
    def setUp(self) -> None:
        self.env = patch.dict(
            "os.environ",
            {
                "PROOFLAYER_TESTNET_ISSUANCE_ENABLED": "true",
                "PROOFLAYER_OPERATOR_TOKEN": "test-token-" + "x" * 40,
                "PROOFLAYER_OPERATOR_ID": "testnet-operator",
            },
            clear=False,
        )
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_disabled_by_default(self) -> None:
        with patch.dict(
            "os.environ",
            {"PROOFLAYER_TESTNET_ISSUANCE_ENABLED": "false"},
            clear=False,
        ):
            self.assertFalse(is_issuance_available())

    def test_returns_false_when_script_missing(self) -> None:
        with patch("services.blockchain.issuer.ISSUANCE_SCRIPT") as mock_script:
            mock_script.exists.return_value = False
            self.assertFalse(is_issuance_available())

    def test_returns_false_when_wrong_chain(self) -> None:
        with patch("services.blockchain.issuer.XLAYER_CHAIN_ID", 1):
            self.assertFalse(is_issuance_available())

    def test_returns_false_when_no_registry(self) -> None:
        with (
            patch("services.blockchain.issuer.ISSUANCE_SCRIPT") as mock_script,
            patch("services.blockchain.issuer.REGISTRY_ADDRESS", ""),
        ):
            mock_script.exists.return_value = True
            self.assertFalse(is_issuance_available())

    def test_returns_true_when_all_available(self) -> None:
        with (
            patch("services.blockchain.issuer.ISSUANCE_SCRIPT") as mock_script,
            patch("services.blockchain.issuer.XLAYER_CHAIN_ID", 1952),
            patch("services.blockchain.issuer.REGISTRY_ADDRESS", "0x" + "1" * 40),
        ):
            mock_script.exists.return_value = True
            self.assertTrue(is_issuance_available())


class TestIssueCertificate(unittest.TestCase):
    def test_requires_authenticated_context_before_signer(self) -> None:
        cert = _pass_certificate()
        with patch("services.blockchain.issuer.subprocess.run") as signer:
            result = _issue_certificate(cert)
        self.assertFalse(result.success)
        self.assertEqual(result.error_code, "OPERATOR_CONTEXT_REQUIRED")
        signer.assert_not_called()

    def test_expired_authoritative_certificate_rejected_before_signer(self) -> None:
        cert = _pass_certificate()
        expired = VerificationCertificate(
            **{
                **cert.__dict__,
                "observed_at": datetime.now(timezone.utc) - timedelta(hours=2),
                "valid_until": datetime.now(timezone.utc) - timedelta(hours=1),
            }
        )
        with patch("services.blockchain.issuer.subprocess.run") as signer:
            result = issue_certificate(expired)
        self.assertFalse(result.success)
        self.assertEqual(result.error_code, "RVC_EXPIRED")
        signer.assert_not_called()

    def test_rejects_non_pass_result(self) -> None:
        cert = _fail_certificate()
        result = issue_certificate(cert)
        self.assertFalse(result.success)
        self.assertEqual(result.error_code, "RVC_NOT_PASS")
        self.assertIn("PASS", result.error or "")

    def test_rejects_indeterminate_result(self) -> None:
        cert = _indeterminate_certificate()
        result = issue_certificate(cert)
        self.assertFalse(result.success)
        self.assertEqual(result.error_code, "RVC_NOT_PASS")

    def test_rejects_simulated_pass_before_signer(self) -> None:
        cert = _pass_certificate()
        simulated = VerificationCertificate(
            **{**cert.__dict__, "simulation_flag": True}
        )
        with patch("services.blockchain.issuer.subprocess.run") as signer:
            result = issue_certificate(simulated)
        self.assertFalse(result.success)
        self.assertEqual(result.error_code, "SIMULATED_VERIFICATION")
        signer.assert_not_called()

    def test_rejects_non_verification_certificate(self) -> None:
        result = issue_certificate("not a certificate")  # type: ignore
        self.assertFalse(result.success)
        self.assertEqual(result.error_code, "INVALID_CERTIFICATE")

    def test_rejects_when_signer_unavailable(self) -> None:
        cert = _pass_certificate()
        with patch("services.blockchain.issuer.is_issuance_available", return_value=False):
            result = issue_certificate(cert)
            self.assertFalse(result.success)
            self.assertEqual(result.error_code, "SIGNER_UNAVAILABLE")

    def test_handles_typescript_script_failure(self) -> None:
        cert = _pass_certificate()
        mock_completed = MagicMock()
        mock_completed.returncode = 1
        mock_completed.stdout = json.dumps({
            "success": False,
            "error": "Transaction failed",
            "errorCode": "TRANSACTION_FAILED",
        })
        mock_completed.stderr = "error output"

        with (
            patch("services.blockchain.issuer.is_issuance_available", return_value=True),
            patch("services.blockchain.issuer.subprocess.run", return_value=mock_completed),
            patch("services.blockchain.issuer.serialize_certificate") as mock_serialize,
        ):
            mock_solidity = MagicMock()
            mock_solidity.to_dict.return_value = {
                "certificateId": "0x" + "a" * 64,
                "assetId": "0x" + "1" * 64,
                "claimType": "0x" + "2" * 64,
                "policyId": "0x" + "3" * 64,
                "evidenceRoot": "0x" + "4" * 64,
                "observedAt": 1735689600,
                "validUntil": 1767225600,
                "independentRootCount": 3,
                "result": 1,
            }
            mock_serialize.return_value = MagicMock(solidity=mock_solidity)

            result = issue_certificate(cert)
            self.assertFalse(result.success)
            self.assertEqual(result.error_code, "TRANSACTION_FAILED")

    def test_signer_timeout_is_unknown_and_keeps_expected_certificate_id(self) -> None:
        cert = _pass_certificate()
        expected_id = serialize_certificate(cert).solidity.certificate_id
        with (
            patch("services.blockchain.issuer.is_issuance_available", return_value=True),
            patch("services.blockchain.issuer.shutil.which", return_value="npx"),
            patch(
                "services.blockchain.issuer.subprocess.run",
                side_effect=subprocess.TimeoutExpired("npx", 120),
            ),
        ):
            result = issue_certificate(cert)
        self.assertFalse(result.success)
        self.assertEqual(result.error_code, "TRANSACTION_STATE_UNKNOWN")
        self.assertEqual(result.certificate_id, expected_id)

    def test_handles_typescript_success(self) -> None:
        cert = _pass_certificate()
        mock_completed = MagicMock()
        mock_completed.returncode = 0
        mock_completed.stdout = json.dumps({
            "success": True,
            "certificateId": "0x" + "a" * 64,
            "transactionHash": "0x" + "f" * 64,
            "blockNumber": 12345,
            "readBack": {
                "matches": True,
                "registered": True,
                "usable": True,
            },
        })
        mock_completed.stderr = ""

        with (
            patch("services.blockchain.issuer.is_issuance_available", return_value=True),
            patch("services.blockchain.issuer.subprocess.run", return_value=mock_completed),
            patch("services.blockchain.issuer.serialize_certificate") as mock_serialize,
        ):
            mock_solidity = MagicMock()
            mock_solidity.to_dict.return_value = {
                "certificateId": "0x" + "a" * 64,
                "assetId": "0x" + "1" * 64,
                "claimType": "0x" + "2" * 64,
                "policyId": "0x" + "3" * 64,
                "evidenceRoot": "0x" + "4" * 64,
                "observedAt": 1735689600,
                "validUntil": 1767225600,
                "independentRootCount": 3,
                "result": 1,
            }
            mock_serialize.return_value = MagicMock(solidity=mock_solidity)

            result = issue_certificate(cert)
            self.assertTrue(result.success)
            self.assertEqual(result.certificate_id, "0x" + "a" * 64)
            self.assertEqual(result.transaction_hash, "0x" + "f" * 64)
            self.assertEqual(result.block_number, 12345)
            self.assertIsNotNone(result.read_back)
            self.assertTrue(result.read_back.matches)
            self.assertTrue(result.read_back.registered)
            self.assertTrue(result.read_back.usable)

    def test_handles_already_registered(self) -> None:
        cert = _pass_certificate()
        mock_completed = MagicMock()
        mock_completed.returncode = 0
        mock_completed.stdout = json.dumps({
            "success": True,
            "certificateId": "0x" + "a" * 64,
            "transactionHash": "ALREADY_REGISTERED",
            "blockNumber": 12345,
            "readBack": {
                "matches": True,
                "registered": True,
                "usable": True,
            },
        })
        mock_completed.stderr = ""

        with (
            patch("services.blockchain.issuer.is_issuance_available", return_value=True),
            patch("services.blockchain.issuer.subprocess.run", return_value=mock_completed),
            patch("services.blockchain.issuer.serialize_certificate") as mock_serialize,
        ):
            mock_solidity = MagicMock()
            mock_solidity.to_dict.return_value = {
                "certificateId": "0x" + "a" * 64,
                "assetId": "0x" + "1" * 64,
                "claimType": "0x" + "2" * 64,
                "policyId": "0x" + "3" * 64,
                "evidenceRoot": "0x" + "4" * 64,
                "observedAt": 1735689600,
                "validUntil": 1767225600,
                "independentRootCount": 3,
                "result": 1,
            }
            mock_serialize.return_value = MagicMock(solidity=mock_solidity)

            result = issue_certificate(cert)
            self.assertTrue(result.success)
            self.assertEqual(result.transaction_hash, "ALREADY_REGISTERED")

    def test_handles_serialization_failure(self) -> None:
        cert = _pass_certificate()
        with (
            patch("services.blockchain.issuer.is_issuance_available", return_value=True),
            patch("services.blockchain.issuer.serialize_certificate", side_effect=ValueError("bad cert")),
        ):
            result = issue_certificate(cert)
            self.assertFalse(result.success)
            self.assertEqual(result.error_code, "INVALID_CERTIFICATE")

    def test_result_to_dict(self) -> None:
        cert = _pass_certificate()
        mock_completed = MagicMock()
        mock_completed.returncode = 0
        mock_completed.stdout = json.dumps({
            "success": True,
            "certificateId": "0x" + "a" * 64,
            "transactionHash": "0x" + "f" * 64,
            "blockNumber": 12345,
            "readBack": {
                "matches": True,
                "registered": True,
                "usable": True,
            },
        })
        mock_completed.stderr = ""

        with (
            patch("services.blockchain.issuer.is_issuance_available", return_value=True),
            patch("services.blockchain.issuer.subprocess.run", return_value=mock_completed),
            patch("services.blockchain.issuer.serialize_certificate") as mock_serialize,
        ):
            mock_solidity = MagicMock()
            mock_solidity.to_dict.return_value = {
                "certificateId": "0x" + "a" * 64,
                "assetId": "0x" + "1" * 64,
                "claimType": "0x" + "2" * 64,
                "policyId": "0x" + "3" * 64,
                "evidenceRoot": "0x" + "4" * 64,
                "observedAt": 1735689600,
                "validUntil": 1767225600,
                "independentRootCount": 3,
                "result": 1,
            }
            mock_serialize.return_value = MagicMock(solidity=mock_solidity)

            result = issue_certificate(cert)
            result_dict = result.to_dict()
            self.assertTrue(result_dict["success"])
            self.assertEqual(result_dict["network"], "X Layer Testnet")
            self.assertEqual(result_dict["chain_id"], 1952)
            self.assertTrue(result_dict["read_back"]["matches"])

    def test_success_without_tx_hash_is_not_success(self) -> None:
        """Success output missing the transaction hash must fail closed."""
        cert = _pass_certificate()
        mock_completed = MagicMock()
        mock_completed.returncode = 0
        mock_completed.stdout = json.dumps({
            "success": True,
            "certificateId": "0x" + "a" * 64,
            "blockNumber": 12345,
            "readBack": {"matches": True, "registered": True, "usable": True},
        })
        mock_completed.stderr = ""

        with (
            patch("services.blockchain.issuer.is_issuance_available", return_value=True),
            patch("services.blockchain.issuer.subprocess.run", return_value=mock_completed),
            patch("services.blockchain.issuer.serialize_certificate") as mock_serialize,
        ):
            mock_solidity = MagicMock()
            mock_solidity.to_dict.return_value = {
                "certificateId": "0x" + "a" * 64,
                "assetId": "0x" + "1" * 64,
                "claimType": "0x" + "2" * 64,
                "policyId": "0x" + "3" * 64,
                "evidenceRoot": "0x" + "4" * 64,
                "observedAt": 1735689600,
                "validUntil": 1767225600,
                "independentRootCount": 3,
                "result": 1,
            }
            mock_serialize.return_value = MagicMock(solidity=mock_solidity)

            result = issue_certificate(cert)
            self.assertFalse(result.success)
            self.assertEqual(result.error_code, "TRANSACTION_STATE_UNKNOWN")

    def test_success_without_block_is_not_success(self) -> None:
        """Success output missing the block number must fail closed."""
        cert = _pass_certificate()
        mock_completed = MagicMock()
        mock_completed.returncode = 0
        mock_completed.stdout = json.dumps({
            "success": True,
            "certificateId": "0x" + "a" * 64,
            "transactionHash": "0x" + "f" * 64,
            "readBack": {"matches": True, "registered": True, "usable": True},
        })
        mock_completed.stderr = ""

        with (
            patch("services.blockchain.issuer.is_issuance_available", return_value=True),
            patch("services.blockchain.issuer.subprocess.run", return_value=mock_completed),
            patch("services.blockchain.issuer.serialize_certificate") as mock_serialize,
        ):
            mock_solidity = MagicMock()
            mock_solidity.to_dict.return_value = {
                "certificateId": "0x" + "a" * 64,
                "assetId": "0x" + "1" * 64,
                "claimType": "0x" + "2" * 64,
                "policyId": "0x" + "3" * 64,
                "evidenceRoot": "0x" + "4" * 64,
                "observedAt": 1735689600,
                "validUntil": 1767225600,
                "independentRootCount": 3,
                "result": 1,
            }
            mock_serialize.return_value = MagicMock(solidity=mock_solidity)

            result = issue_certificate(cert)
            self.assertFalse(result.success)
            self.assertEqual(result.error_code, "TRANSACTION_STATE_UNKNOWN")

    def test_success_with_invalid_tx_hash_is_not_success(self) -> None:
        """A malformed transaction hash must fail closed."""
        cert = _pass_certificate()
        mock_completed = MagicMock()
        mock_completed.returncode = 0
        mock_completed.stdout = json.dumps({
            "success": True,
            "certificateId": "0x" + "a" * 64,
            "transactionHash": "not-a-hash",
            "blockNumber": 12345,
            "readBack": {"matches": True, "registered": True, "usable": True},
        })
        mock_completed.stderr = ""

        with (
            patch("services.blockchain.issuer.is_issuance_available", return_value=True),
            patch("services.blockchain.issuer.subprocess.run", return_value=mock_completed),
            patch("services.blockchain.issuer.serialize_certificate") as mock_serialize,
        ):
            mock_solidity = MagicMock()
            mock_solidity.to_dict.return_value = {
                "certificateId": "0x" + "a" * 64,
                "assetId": "0x" + "1" * 64,
                "claimType": "0x" + "2" * 64,
                "policyId": "0x" + "3" * 64,
                "evidenceRoot": "0x" + "4" * 64,
                "observedAt": 1735689600,
                "validUntil": 1767225600,
                "independentRootCount": 3,
                "result": 1,
            }
            mock_serialize.return_value = MagicMock(solidity=mock_solidity)

            result = issue_certificate(cert)
            self.assertFalse(result.success)
            self.assertEqual(result.error_code, "TRANSACTION_STATE_UNKNOWN")

    def test_success_without_explicit_certificate_id_fails_closed(self) -> None:
        cert = _pass_certificate()
        completed = MagicMock(
            returncode=0,
            stdout=json.dumps(
                {
                    "success": True,
                    "transactionHash": "0x" + "f" * 64,
                    "blockNumber": 12345,
                    "readBack": {
                        "matches": True,
                        "registered": True,
                        "usable": True,
                    },
                }
            ),
            stderr="",
        )
        solidity = MagicMock()
        solidity.to_dict.return_value = {
            "certificateId": "0x" + "a" * 64,
            "assetId": "0x" + "1" * 64,
            "claimType": "0x" + "2" * 64,
            "policyId": "0x" + "3" * 64,
            "evidenceRoot": "0x" + "4" * 64,
            "observedAt": 1735689600,
            "validUntil": 1767225600,
            "independentRootCount": 3,
            "result": 1,
        }
        with (
            patch("services.blockchain.issuer.is_issuance_available", return_value=True),
            patch("services.blockchain.issuer.subprocess.run", return_value=completed),
            patch(
                "services.blockchain.issuer.serialize_certificate",
                return_value=MagicMock(solidity=solidity),
            ),
        ):
            result = issue_certificate(cert)
        self.assertFalse(result.success)
        self.assertEqual(result.error_code, "TRANSACTION_STATE_UNKNOWN")
        self.assertEqual(result.transaction_hash, "0x" + "f" * 64)
        self.assertEqual(result.block_number, 12345)

    def test_success_with_unconfirmed_readback_fails_closed(self) -> None:
        cert = _pass_certificate()
        completed = MagicMock(
            returncode=0,
            stdout=json.dumps(
                {
                    "success": True,
                    "certificateId": "0x" + "a" * 64,
                    "transactionHash": "0x" + "f" * 64,
                    "blockNumber": 12345,
                    "readBack": {
                        "matches": True,
                        "registered": True,
                        "usable": False,
                    },
                }
            ),
            stderr="",
        )
        solidity = MagicMock()
        solidity.to_dict.return_value = {
            "certificateId": "0x" + "a" * 64,
            "assetId": "0x" + "1" * 64,
            "claimType": "0x" + "2" * 64,
            "policyId": "0x" + "3" * 64,
            "evidenceRoot": "0x" + "4" * 64,
            "observedAt": 1735689600,
            "validUntil": 1767225600,
            "independentRootCount": 3,
            "result": 1,
        }
        with (
            patch("services.blockchain.issuer.is_issuance_available", return_value=True),
            patch("services.blockchain.issuer.subprocess.run", return_value=completed),
            patch(
                "services.blockchain.issuer.serialize_certificate",
                return_value=MagicMock(solidity=solidity),
            ),
        ):
            result = issue_certificate(cert)
        self.assertFalse(result.success)
        self.assertEqual(result.error_code, "POST_SUBMIT_VERIFICATION_FAILED")
        self.assertEqual(result.transaction_hash, "0x" + "f" * 64)
        self.assertEqual(result.block_number, 12345)
        self.assertIsNotNone(result.read_back)

    def test_success_with_mismatched_certificate_id_fails_closed(self) -> None:
        cert = _pass_certificate()
        completed = MagicMock(
            returncode=0,
            stdout=json.dumps(
                {
                    "success": True,
                    "certificateId": "0x" + "b" * 64,
                    "transactionHash": "0x" + "f" * 64,
                    "blockNumber": 12345,
                    "readBack": {
                        "matches": True,
                        "registered": True,
                        "usable": True,
                    },
                }
            ),
            stderr="",
        )
        solidity = MagicMock()
        solidity.to_dict.return_value = {
            "certificateId": "0x" + "a" * 64,
            "assetId": "0x" + "1" * 64,
            "claimType": "0x" + "2" * 64,
            "policyId": "0x" + "3" * 64,
            "evidenceRoot": "0x" + "4" * 64,
            "observedAt": 1735689600,
            "validUntil": 1767225600,
            "independentRootCount": 3,
            "result": 1,
        }
        with (
            patch("services.blockchain.issuer.is_issuance_available", return_value=True),
            patch("services.blockchain.issuer.subprocess.run", return_value=completed),
            patch(
                "services.blockchain.issuer.serialize_certificate",
                return_value=MagicMock(solidity=solidity),
            ),
        ):
            result = issue_certificate(cert)
        self.assertFalse(result.success)
        self.assertEqual(result.error_code, "TRANSACTION_STATE_UNKNOWN")
        self.assertEqual(result.transaction_hash, "0x" + "f" * 64)
        self.assertEqual(result.block_number, 12345)

    def test_valid_authoritative_pass_reaches_mock_signer(self) -> None:
        """A validated PASS with operator context can cross this boundary."""

        cert = _pass_certificate()
        mock_completed = MagicMock()
        mock_completed.returncode = 0
        mock_completed.stdout = json.dumps({
            "success": True,
            "certificateId": "0x" + "a" * 64,
            "transactionHash": "0x" + "f" * 64,
            "blockNumber": 12345,
            "readBack": {
                "matches": True,
                "registered": True,
                "usable": True,
            },
        })
        mock_completed.stderr = ""

        with (
            patch("services.blockchain.issuer.is_issuance_available", return_value=True),
            patch("services.blockchain.issuer.subprocess.run", return_value=mock_completed),
            patch("services.blockchain.issuer.serialize_certificate") as mock_serialize,
        ):
            mock_solidity = MagicMock()
            mock_solidity.to_dict.return_value = {
                "certificateId": "0x" + "a" * 64,
                "assetId": "0x" + "1" * 64,
                "claimType": "0x" + "2" * 64,
                "policyId": "0x" + "3" * 64,
                "evidenceRoot": "0x" + "4" * 64,
                "observedAt": 1735689600,
                "validUntil": 1767225600,
                "independentRootCount": 3,
                "result": 1,
            }
            mock_serialize.return_value = MagicMock(solidity=mock_solidity)

            result = issue_certificate(cert)
            self.assertTrue(result.success)

    def test_signer_lock_serializes_distinct_request_contexts(self) -> None:
        cert = _pass_certificate()
        expected_id = serialize_certificate(cert).solidity.certificate_id
        active = 0
        maximum_active = 0
        counter_lock = threading.Lock()

        def delayed_signer(*_args, **_kwargs):
            nonlocal active, maximum_active
            with counter_lock:
                active += 1
                maximum_active = max(maximum_active, active)
            time.sleep(0.05)
            with counter_lock:
                active -= 1
            return MagicMock(
                returncode=0,
                stdout=json.dumps(
                    {
                        "success": True,
                        "certificateId": expected_id,
                        "transactionHash": "0x" + "f" * 64,
                        "blockNumber": 12345,
                        "readBack": {
                            "matches": True,
                            "registered": True,
                            "usable": True,
                        },
                    }
                ),
                stderr="",
            )

        results: list[IssuanceResult] = []

        def submit(request_id: str) -> None:
            results.append(
                _issue_certificate(
                    cert,
                    request_id=request_id,
                    operator_id="testnet-operator",
                )
            )

        with (
            patch("services.blockchain.issuer.is_issuance_available", return_value=True),
            patch("services.blockchain.issuer.shutil.which", return_value="npx"),
            patch("services.blockchain.issuer.subprocess.run", side_effect=delayed_signer),
        ):
            first = threading.Thread(target=submit, args=("request-one",))
            second = threading.Thread(target=submit, args=("request-two",))
            first.start()
            second.start()
            first.join(timeout=3)
            second.join(timeout=3)

        self.assertFalse(first.is_alive())
        self.assertFalse(second.is_alive())
        self.assertEqual(maximum_active, 1)
        self.assertEqual(len(results), 2)
        self.assertTrue(all(result.success for result in results))


class _FakeChain:
    """Read-only fake X Layer RPC client for readiness probes."""

    def __init__(self, chain_id: str = "0x7a0", code: str = "0x600d") -> None:
        self.chain_id = chain_id
        self.code = code
        self.fail = False

    def request(self, method: str, params: list[Any]) -> Any:
        if self.fail:
            raise RuntimeError("rpc down")
        if method == "eth_chainId":
            return self.chain_id
        if method == "eth_getCode":
            return self.code
        raise AssertionError(f"unexpected RPC method {method}")


class TestCheckIssuanceReadiness(unittest.TestCase):
    """Readiness probing must be honest: live chain/registry checks plus a
    key-presence check that never reads or logs the key value."""

    def _run(self, chain: _FakeChain, *, key_present: bool = True) -> IssuanceReadiness:
        with (
            patch("services.blockchain.issuer.ISSUANCE_SCRIPT") as mock_script,
            patch("services.blockchain.issuer.shutil.which", return_value="npx"),
            patch("services.blockchain.issuer.XLAYER_CHAIN_ID", 1952),
            patch("services.blockchain.issuer.REGISTRY_ADDRESS", "0x" + "1" * 40),
            patch.dict("os.environ", {}, clear=False),
        ):
            mock_script.exists.return_value = True
            os.environ["PROOFLAYER_TESTNET_ISSUANCE_ENABLED"] = "true"
            os.environ["PROOFLAYER_OPERATOR_TOKEN"] = "test-token-" + "x" * 40
            os.environ["PROOFLAYER_OPERATOR_ID"] = "testnet-operator"
            if key_present:
                os.environ["DEPLOYER_PRIVATE_KEY"] = "0x" + "2" * 64
            else:
                os.environ.pop("DEPLOYER_PRIVATE_KEY", None)
            return check_issuance_readiness(chain)

    def test_ready_when_all_verified(self) -> None:
        readiness = self._run(_FakeChain())
        self.assertTrue(readiness.ready)
        self.assertTrue(readiness.static_ready)
        self.assertTrue(readiness.chain_matches)
        self.assertTrue(readiness.registry_has_code)
        self.assertTrue(readiness.signer_key_present)
        self.assertTrue(readiness.rpc_reachable)

    def test_not_ready_on_chain_mismatch(self) -> None:
        readiness = self._run(_FakeChain(chain_id="0x1"))
        self.assertFalse(readiness.ready)
        self.assertFalse(readiness.chain_matches)
        self.assertIn("chain ID", readiness.note)

    def test_not_ready_when_registry_has_no_code(self) -> None:
        readiness = self._run(_FakeChain(code="0x"))
        self.assertFalse(readiness.ready)
        self.assertFalse(readiness.registry_has_code)
        self.assertIn("bytecode", readiness.note)

    def test_not_ready_when_rpc_unreachable(self) -> None:
        chain = _FakeChain()
        chain.fail = True
        readiness = self._run(chain)
        self.assertFalse(readiness.ready)
        self.assertFalse(readiness.rpc_reachable)
        self.assertIn("unreachable", readiness.note)

    def test_not_ready_when_key_missing(self) -> None:
        readiness = self._run(_FakeChain(), key_present=False)
        self.assertFalse(readiness.ready)
        self.assertFalse(readiness.signer_key_present)
        self.assertIn("key", readiness.note.lower())

    def test_not_ready_when_static_infra_missing(self) -> None:
        with (
            patch("services.blockchain.issuer.ISSUANCE_SCRIPT") as mock_script,
            patch("services.blockchain.issuer.shutil.which", return_value="npx"),
            patch("services.blockchain.issuer.XLAYER_CHAIN_ID", 1952),
            patch("services.blockchain.issuer.REGISTRY_ADDRESS", "0x" + "1" * 40),
            patch.dict("os.environ", {}, clear=False),
        ):
            mock_script.exists.return_value = False
            os.environ["PROOFLAYER_TESTNET_ISSUANCE_ENABLED"] = "true"
            os.environ["PROOFLAYER_OPERATOR_TOKEN"] = "test-token-" + "x" * 40
            os.environ["PROOFLAYER_OPERATOR_ID"] = "testnet-operator"
            os.environ["DEPLOYER_PRIVATE_KEY"] = "0x" + "2" * 64
            readiness = check_issuance_readiness(_FakeChain())
        self.assertFalse(readiness.ready)
        self.assertFalse(readiness.static_ready)
        self.assertFalse(readiness.chain_matches)

    def test_to_dict_never_contains_key_value(self) -> None:
        readiness = self._run(_FakeChain(), key_present=False)
        rendered = str(readiness.to_dict()).lower()
        self.assertNotIn("private", rendered)
        self.assertNotIn("0x" + "2" * 64, rendered)
        self.assertIn("signer_key_present", readiness.to_dict())

    def test_disabled_readiness_does_not_touch_rpc(self) -> None:
        chain = MagicMock()
        with patch.dict(
            "os.environ",
            {"PROOFLAYER_TESTNET_ISSUANCE_ENABLED": "false"},
            clear=False,
        ):
            readiness = check_issuance_readiness(chain)
        self.assertFalse(readiness.ready)
        self.assertFalse(readiness.enabled)
        chain.request.assert_not_called()


if __name__ == "__main__":
    unittest.main()
