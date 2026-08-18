"""Python boundary for certificate issuance via TypeScript/Hardhat signer."""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from services.mcp_server.tools import REGISTRY_ADDRESS, XLAYER_CHAIN_ID, XLayerReadClient
from services.blockchain.issuance_control import (
    CONTROL_SCOPE,
    issuance_enabled,
    operator_auth_configured,
)
from services.rvc.certificate_serializer import serialize_certificate
from services.rvc.models import VerificationCertificate, VerificationResult

_BYTES32_PATTERN = re.compile(r"^0x[0-9a-fA-F]{64}$")

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ISSUANCE_SCRIPT = PROJECT_ROOT / "scripts" / "issue-certificate.ts"

logger = logging.getLogger(__name__)
_SIGNER_PROCESS_LOCK = threading.Lock()


@dataclass(frozen=True)
class IssuanceReadBack:
    matches: bool
    registered: bool
    usable: bool


@dataclass(frozen=True)
class IssuanceReadiness:
    """Honest readiness report for the X Layer Testnet signing path.

    Only facts verifiable without touching the signer key are reported.
    The signer's balance and on-chain issuer authorization are confirmed
    only at signing time and are never claimed here.
    """

    ready: bool
    static_ready: bool
    chain_matches: bool
    registry_has_code: bool
    signer_key_present: bool
    rpc_reachable: bool
    note: str
    enabled: bool = False
    operator_auth_configured: bool = False
    control_scope: str = CONTROL_SCOPE

    def to_dict(self) -> dict[str, Any]:
        return {
            "ready": self.ready,
            "static_ready": self.static_ready,
            "chain_matches": self.chain_matches,
            "registry_has_code": self.registry_has_code,
            "signer_key_present": self.signer_key_present,
            "rpc_reachable": self.rpc_reachable,
            "note": self.note,
            "enabled": self.enabled,
            "operator_auth_configured": self.operator_auth_configured,
            "control_scope": self.control_scope,
        }


@dataclass(frozen=True)
class IssuanceResult:
    success: bool
    certificate_id: str | None
    transaction_hash: str | None
    block_number: int | None
    read_back: IssuanceReadBack | None
    error: str | None
    error_code: str | None
    network: str
    chain_id: int

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "success": self.success,
            "certificate_id": self.certificate_id,
            "transaction_hash": self.transaction_hash,
            "block_number": self.block_number,
            "read_back": {
                "matches": self.read_back.matches,
                "registered": self.read_back.registered,
                "usable": self.read_back.usable,
            }
            if self.read_back is not None
            else None,
            "error": self.error,
            "error_code": self.error_code,
            "network": self.network,
            "chain_id": self.chain_id,
        }
        return result


def _error_result(
    error: str,
    error_code: str,
    *,
    certificate_id: str | None = None,
    transaction_hash: str | None = None,
    block_number: int | None = None,
    read_back: IssuanceReadBack | None = None,
) -> IssuanceResult:
    return IssuanceResult(
        success=False,
        certificate_id=certificate_id,
        transaction_hash=transaction_hash,
        block_number=block_number,
        read_back=read_back,
        error=error,
        error_code=error_code,
        network="X Layer Testnet",
        chain_id=XLAYER_CHAIN_ID,
    )


def _success_result(
    certificate_id: str,
    transaction_hash: str,
    block_number: int,
    read_back: dict[str, Any],
) -> IssuanceResult:
    usable = bool(read_back.get("usable", False))
    return IssuanceResult(
        success=True,
        certificate_id=certificate_id,
        transaction_hash=transaction_hash,
        block_number=block_number,
        read_back=IssuanceReadBack(
            matches=bool(read_back.get("matches", False)),
            registered=bool(read_back.get("registered", False)),
            usable=usable,
        ),
        error=None,
        error_code=None,
        network="X Layer Testnet",
        chain_id=XLAYER_CHAIN_ID,
    )


def _parse_ts_output(raw: str) -> dict[str, Any]:
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError) as exc:
        raise ValueError(f"TypeScript script returned invalid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("TypeScript script returned non-object JSON")
    return data


def _signer_key_present() -> bool:
    """Presence check only for the Hardhat signer key.

    Only a non-empty presence check is performed; the key value is never
    logged or returned. The Hardhat configuration resolves and validates the
    key itself inside the TypeScript signing boundary.
    """

    return bool(os.getenv("DEPLOYER_PRIVATE_KEY"))


def is_issuance_available() -> bool:
    """Check whether the static issuance infrastructure is available.

    This is a static gate only (script, npx, chain constant, registry
    address). Live chain verification is provided by
    :func:`check_issuance_readiness`.
    """

    if not issuance_enabled():
        logger.warning("Testnet certificate issuance is disabled")
        return False

    if not operator_auth_configured():
        logger.warning("Testnet operator authentication is not configured")
        return False

    if not ISSUANCE_SCRIPT.exists():
        logger.warning("Issuance script not found at %s", ISSUANCE_SCRIPT)
        return False

    if shutil.which("npx") is None:
        logger.warning("npx is not available on PATH")
        return False

    if XLAYER_CHAIN_ID != 1952:
        logger.warning("Chain ID %s is not X Layer Testnet (1952)", XLAYER_CHAIN_ID)
        return False

    if not REGISTRY_ADDRESS:
        logger.warning("Registry address is not configured")
        return False

    return True


def check_issuance_readiness(chain: Any | None = None) -> IssuanceReadiness:
    """Probe issuance readiness with safe, read-only checks.

    Static checks run first; then live read-only RPC checks verify the
    chain ID and the registry's deployed bytecode. Every failure is
    fail-soft: the report records it and ``ready`` is False.
    """

    enabled = issuance_enabled()
    auth_configured = operator_auth_configured()
    static_ready = (
        ISSUANCE_SCRIPT.exists()
        and shutil.which("npx") is not None
        and XLAYER_CHAIN_ID == 1952
        and bool(REGISTRY_ADDRESS)
    )

    rpc_reachable = False
    chain_matches = False
    registry_has_code = False

    key_present = _signer_key_present()

    # Disabled or unauthenticated issuance does not touch the RPC.  This keeps
    # the default health path read-only and cheap while reporting write
    # capability honestly.
    if static_ready and enabled and auth_configured and key_present:
        client = chain or XLayerReadClient()
        try:
            raw_chain_id = client.request("eth_chainId", [])
            chain_id = int(str(raw_chain_id), 16)
            rpc_reachable = True
            chain_matches = chain_id == XLAYER_CHAIN_ID
        except Exception:
            rpc_reachable = False
        if chain_matches:
            try:
                code = client.request("eth_getCode", [REGISTRY_ADDRESS, "latest"])
                registry_has_code = (
                    isinstance(code, str) and code not in ("0x", "0x0", "")
                )
            except Exception:
                registry_has_code = False

    ready = (
        enabled
        and auth_configured
        and static_ready
        and key_present
        and rpc_reachable
        and chain_matches
        and registry_has_code
    )

    if not enabled:
        note = (
            "X Layer Testnet issuance is disabled by default. Set "
            "PROOFLAYER_TESTNET_ISSUANCE_ENABLED=true only for an authorized "
            "development operator environment."
        )
    elif not auth_configured:
        note = "Testnet operator authentication is not safely configured."
    elif not static_ready:
        note = "Static issuance infrastructure is incomplete (script, npx, chain constant, or registry address)."
    elif not key_present:
        note = "Signer key environment variable is not present in the API process environment."
    elif not rpc_reachable:
        note = "X Layer Testnet RPC is unreachable."
    elif not chain_matches:
        note = f"X Layer RPC is not chain ID {XLAYER_CHAIN_ID}."
    elif not registry_has_code:
        note = "Configured registry has no deployed bytecode on X Layer Testnet."
    else:
        note = (
            "Static infrastructure verified; live chain ID and registry bytecode confirmed. "
            "Signer balance and issuer authorization are confirmed only at signing time."
        )

    return IssuanceReadiness(
        ready=ready,
        static_ready=static_ready,
        chain_matches=chain_matches,
        registry_has_code=registry_has_code,
        signer_key_present=key_present,
        rpc_reachable=rpc_reachable,
        note=note,
        enabled=enabled,
        operator_auth_configured=auth_configured,
        control_scope=CONTROL_SCOPE,
    )


def issue_certificate(
    certificate: VerificationCertificate,
    *,
    request_id: str | None = None,
    operator_id: str | None = None,
) -> IssuanceResult:
    """Issue an authoritative RVC certificate to X Layer Testnet.

    This function:
    1. Verifies the certificate has PASS result
    2. Serializes using the existing certificate serializer
    3. Invokes the TypeScript issuance layer
    4. Returns a structured result

    The private key is never accessed from Python.
    Signing occurs entirely within the TypeScript/Hardhat boundary.
    """

    if not isinstance(certificate, VerificationCertificate):
        return _error_result(
            "Certificate must be a VerificationCertificate instance",
            "INVALID_CERTIFICATE",
        )

    result_value = (
        certificate.result.value
        if isinstance(certificate.result, VerificationResult)
        else str(certificate.result)
    )

    logger.info(
        "Certificate issuance request: asset=%s result=%s network=%s chain_id=%s",
        certificate.asset_id,
        result_value,
        "X Layer Testnet",
        XLAYER_CHAIN_ID,
    )

    if result_value != "PASS":
        logger.warning(
            "Certificate issuance rejected: result=%s (must be PASS)",
            result_value,
        )
        return _error_result(
            f"Certificate result is {result_value}; only PASS certificates can be issued",
            "RVC_NOT_PASS",
            certificate_id=certificate.certificate_id,
        )

    # Keep this invariant at the lowest boundary that can start the signer.
    # The HTTP endpoint performs the same check, but internal/future callers
    # must not be able to send a simulated PASS to Hardhat by constructing an
    # otherwise valid request/operator context.
    if certificate.simulation_flag:
        logger.warning("Certificate issuance rejected: simulated RVC result")
        return _error_result(
            "Simulated verification results cannot be issued",
            "SIMULATED_VERIFICATION",
            certificate_id=certificate.certificate_id,
        )

    observed_at = certificate.observed_at
    valid_until = certificate.valid_until
    if observed_at.tzinfo is None or valid_until.tzinfo is None:
        return _error_result(
            "Certificate validity timestamps must be timezone-aware",
            "INVALID_CERTIFICATE",
            certificate_id=certificate.certificate_id,
        )
    if valid_until <= observed_at or valid_until <= datetime.now(timezone.utc):
        return _error_result(
            "Certificate authoritative validity window has expired or is invalid",
            "RVC_EXPIRED",
            certificate_id=certificate.certificate_id,
        )

    if not request_id or not operator_id:
        return _error_result(
            "Authenticated issuance context is required",
            "OPERATOR_CONTEXT_REQUIRED",
            certificate_id=certificate.certificate_id,
        )

    if not is_issuance_available():
        return _error_result(
            "Issuance infrastructure is not available",
            "SIGNER_UNAVAILABLE",
            certificate_id=certificate.certificate_id,
        )

    try:
        serialized = serialize_certificate(certificate)
    except (TypeError, ValueError) as exc:
        logger.error("Certificate serialization failed: %s", type(exc).__name__)
        return _error_result(
            "Certificate serialization failed validation",
            "INVALID_CERTIFICATE",
            certificate_id=certificate.certificate_id,
        )

    solidity_data = serialized.solidity.to_dict()
    expected_cert_id = str(solidity_data.get("certificateId", ""))
    input_json = json.dumps(solidity_data, separators=(",", ":"))
    logger.info(
        "Issuing certificate %s request_id=%s operator_id=%s",
        expected_cert_id or "unknown",
        request_id,
        operator_id,
    )

    npx_executable = shutil.which("npx")
    if npx_executable is None:
        logger.error("npx is not available on PATH")
        return _error_result(
            "npx is not available on PATH",
            "SIGNER_UNAVAILABLE",
            certificate_id=expected_cert_id or certificate.certificate_id,
        )

    try:
        # A single signer subprocess may be active in this API process.  This
        # prevents local nonce races; it is not a substitute for a durable
        # production transaction queue shared by every worker/replica.
        with _SIGNER_PROCESS_LOCK:
            completed = subprocess.run(
                [
                    npx_executable,
                    "hardhat",
                    "run",
                    str(ISSUANCE_SCRIPT),
                    "--network",
                    "xlayerTestnet",
                ],
                input=input_json,
                capture_output=True,
                text=True,
                timeout=120,
                cwd=str(PROJECT_ROOT),
                shell=False,
            )
    except subprocess.TimeoutExpired:
        logger.error("TypeScript issuance script timed out")
        return _error_result(
            "Issuance script timed out after 120 seconds",
            "TRANSACTION_STATE_UNKNOWN",
            certificate_id=expected_cert_id or certificate.certificate_id,
        )
    except FileNotFoundError:
        logger.error("TypeScript issuance script not found at %s", ISSUANCE_SCRIPT)
        return _error_result(
            "Issuance script not found",
            "SIGNER_UNAVAILABLE",
            certificate_id=expected_cert_id or certificate.certificate_id,
        )
    except Exception as exc:
        logger.error("Failed to invoke issuance script: %s", type(exc).__name__)
        return _error_result(
            "The testnet signing process ended without a confirmed outcome",
            "TRANSACTION_STATE_UNKNOWN",
            certificate_id=expected_cert_id or certificate.certificate_id,
        )

    if completed.returncode != 0:
        logger.error(
            "TypeScript issuance script failed (exit code %d)",
            completed.returncode,
        )
        failure_payload: dict[str, Any] | None = None
        try:
            failure_payload = _parse_ts_output(completed.stdout)
            raw_error_code = failure_payload.get("errorCode", "TRANSACTION_FAILED")
            error_code = (
                str(raw_error_code)
                if raw_error_code
                in {
                    "ALREADY_REGISTERED_MISMATCH",
                    "CHAIN_MISMATCH",
                    "INSUFFICIENT_FUNDS",
                    "ISSUER_UNAUTHORIZED",
                    "REGISTRY_UNAVAILABLE",
                    "TRANSACTION_FAILED",
                    "TRANSACTION_STATE_UNKNOWN",
                    "POST_SUBMIT_VERIFICATION_FAILED",
                    "READBACK_MISMATCH",
                }
                else "TRANSACTION_FAILED"
            )
        except ValueError:
            # The signer process ran but did not return a structured outcome.
            # A transaction may have been submitted; require reconciliation.
            error_code = "TRANSACTION_STATE_UNKNOWN"
        parsed_cert_id = (
            failure_payload.get("certificateId") if failure_payload else None
        )
        parsed_tx_hash = (
            failure_payload.get("transactionHash") if failure_payload else None
        )
        parsed_block = failure_payload.get("blockNumber") if failure_payload else None
        parsed_read_back = failure_payload.get("readBack") if failure_payload else None
        safe_cert_id = (
            parsed_cert_id
            if isinstance(parsed_cert_id, str) and _BYTES32_PATTERN.fullmatch(parsed_cert_id)
            else expected_cert_id or certificate.certificate_id
        )
        safe_tx_hash = (
            parsed_tx_hash
            if isinstance(parsed_tx_hash, str)
            and re.fullmatch(r"0x[0-9a-fA-F]{64}", parsed_tx_hash)
            else None
        )
        safe_block = (
            parsed_block
            if isinstance(parsed_block, int)
            and not isinstance(parsed_block, bool)
            and parsed_block >= 0
            else None
        )
        safe_read_back = (
            IssuanceReadBack(
                matches=bool(parsed_read_back.get("matches", False)),
                registered=bool(parsed_read_back.get("registered", False)),
                usable=bool(parsed_read_back.get("usable", False)),
            )
            if isinstance(parsed_read_back, dict)
            else None
        )
        return _error_result(
            "The X Layer Testnet issuance operation failed",
            error_code,
            certificate_id=safe_cert_id,
            transaction_hash=safe_tx_hash,
            block_number=safe_block,
            read_back=safe_read_back,
        )

    try:
        parsed = _parse_ts_output(completed.stdout)
    except ValueError as exc:
        logger.error("Failed to parse TypeScript output: %s", type(exc).__name__)
        return _error_result(
            "The signing process returned an invalid result",
            "TRANSACTION_STATE_UNKNOWN",
            certificate_id=expected_cert_id or certificate.certificate_id,
        )

    if not parsed.get("success", False):
        raw_error_code = parsed.get("errorCode", "TRANSACTION_FAILED")
        error_code = (
            str(raw_error_code)
            if raw_error_code
            in {
                "ALREADY_REGISTERED_MISMATCH",
                "CHAIN_MISMATCH",
                "INSUFFICIENT_FUNDS",
                "ISSUER_UNAUTHORIZED",
                "REGISTRY_UNAVAILABLE",
                "TRANSACTION_FAILED",
                "TRANSACTION_STATE_UNKNOWN",
                "POST_SUBMIT_VERIFICATION_FAILED",
                "READBACK_MISMATCH",
            }
            else "TRANSACTION_FAILED"
        )
        logger.warning(
            "Certificate issuance failed: code=%s",
            error_code,
        )
        return _error_result(
            "The X Layer Testnet issuance operation failed",
            str(error_code),
            certificate_id=expected_cert_id or certificate.certificate_id,
            transaction_hash=(
                parsed.get("transactionHash")
                if isinstance(parsed.get("transactionHash"), str)
                and re.fullmatch(r"0x[0-9a-fA-F]{64}", parsed["transactionHash"])
                else None
            ),
            block_number=(
                parsed.get("blockNumber")
                if isinstance(parsed.get("blockNumber"), int)
                and not isinstance(parsed.get("blockNumber"), bool)
                and parsed["blockNumber"] >= 0
                else None
            ),
        )

    cert_id = parsed.get("certificateId")
    tx_hash = parsed.get("transactionHash")
    block = parsed.get("blockNumber")
    read_back = parsed.get("readBack")
    # Fail closed unless the success output is fully well-formed. A valid
    # certificate id, a real transaction hash (or the duplicate sentinel),
    # and a non-negative block number are required before the operation is
    # reported as successful.
    if not isinstance(cert_id, str) or not _BYTES32_PATTERN.fullmatch(cert_id):
        logger.error("TypeScript reported success without a valid certificate id")
        return _error_result(
            "Issuance reported success without a valid certificate id",
            "TRANSACTION_STATE_UNKNOWN",
            certificate_id=expected_cert_id or certificate.certificate_id,
            transaction_hash=(
                tx_hash
                if isinstance(tx_hash, str)
                and re.fullmatch(r"0x[0-9a-fA-F]{64}", tx_hash)
                else None
            ),
            block_number=(
                block
                if isinstance(block, int) and not isinstance(block, bool) and block >= 0
                else None
            ),
        )
    if cert_id.lower() != expected_cert_id.lower():
        logger.error("TypeScript reported a certificate id mismatch")
        return _error_result(
            "Issuance read-back certificate id did not match the authoritative certificate",
            "TRANSACTION_STATE_UNKNOWN",
            certificate_id=expected_cert_id,
            transaction_hash=(
                tx_hash
                if isinstance(tx_hash, str)
                and re.fullmatch(r"0x[0-9a-fA-F]{64}", tx_hash)
                else None
            ),
            block_number=(
                block
                if isinstance(block, int) and not isinstance(block, bool) and block >= 0
                else None
            ),
        )
    if tx_hash != "ALREADY_REGISTERED" and (
        not isinstance(tx_hash, str)
        or not re.fullmatch(r"0x[0-9a-fA-F]{64}", tx_hash)
    ):
        logger.error("TypeScript reported success without a valid transaction hash")
        return _error_result(
            "Issuance reported success without a valid transaction hash",
            "TRANSACTION_STATE_UNKNOWN",
            certificate_id=cert_id,
            block_number=(
                block
                if isinstance(block, int) and not isinstance(block, bool) and block >= 0
                else None
            ),
        )
    if isinstance(block, bool) or not isinstance(block, int) or block < 0:
        logger.error("TypeScript reported success without a valid block number")
        return _error_result(
            "Issuance reported success without a valid block number",
            "TRANSACTION_STATE_UNKNOWN",
            certificate_id=cert_id,
            transaction_hash=tx_hash if isinstance(tx_hash, str) else None,
        )

    if not isinstance(read_back, dict) or not all(
        read_back.get(field) is True for field in ("matches", "registered", "usable")
    ):
        logger.error("Issuance read-back did not confirm authoritative usable state")
        return _error_result(
            "Issuance read-back did not confirm a matching, registered, usable certificate",
            "POST_SUBMIT_VERIFICATION_FAILED",
            certificate_id=cert_id,
            transaction_hash=tx_hash,
            block_number=block,
            read_back=(
                IssuanceReadBack(
                    matches=bool(read_back.get("matches", False)),
                    registered=bool(read_back.get("registered", False)),
                    usable=bool(read_back.get("usable", False)),
                )
                if isinstance(read_back, dict)
                else None
            ),
        )

    logger.info(
        "Certificate issued successfully: certificate_id=%s tx=%s block=%s",
        cert_id,
        tx_hash,
        block,
    )

    return _success_result(
        cert_id,
        tx_hash,
        block,
        read_back,
    )


__all__ = [
    "IssuanceReadBack",
    "IssuanceReadiness",
    "IssuanceResult",
    "check_issuance_readiness",
    "is_issuance_available",
    "issue_certificate",
]
