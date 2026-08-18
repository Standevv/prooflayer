"""Development/testnet authority controls for certificate issuance.

These controls intentionally provide a narrow, secure-by-default boundary for
the current single-process API.  They are not a production signing
architecture and do not replace KMS/HSM custody, multisig governance, durable
distributed idempotency, or an independently protected audit store.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Generic, TypeVar


ISSUANCE_ENABLED_ENV = "PROOFLAYER_TESTNET_ISSUANCE_ENABLED"
OPERATOR_TOKEN_ENV = "PROOFLAYER_OPERATOR_TOKEN"
OPERATOR_ID_ENV = "PROOFLAYER_OPERATOR_ID"
AUDIT_PATH_ENV = "PROOFLAYER_ISSUANCE_AUDIT_PATH"
CONTROL_SCOPE = "single-process-development-testnet"

_IDEMPOTENCY_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{8,128}$")
_OPERATOR_ID_PATTERN = re.compile(r"^[A-Za-z0-9._:@-]{1,128}$")
_MINIMUM_TOKEN_LENGTH = 32
_DEFAULT_AUDIT_PATH = (
    Path(__file__).resolve().parents[2] / "data" / "issuance" / "audit.jsonl"
)
_AUDIT_LOCK = threading.Lock()


class IssuanceControlError(RuntimeError):
    """Base class for a fail-closed authority-control rejection."""


class OperatorConfigurationError(IssuanceControlError):
    """Operator authentication is not safely configured."""


class OperatorAuthenticationError(IssuanceControlError):
    """The supplied operator credential is missing or invalid."""


class IdempotencyKeyError(IssuanceControlError):
    """An idempotency key is missing or malformed."""


class IdempotencyConflictError(IssuanceControlError):
    """An idempotency key was reused with a different request."""


class IdempotencyInProgressError(IssuanceControlError):
    """The original request is still running after the wait limit."""


def issuance_enabled() -> bool:
    """Return True only for an explicit, exact testnet enablement value."""

    return os.getenv(ISSUANCE_ENABLED_ENV, "") == "true"


def _operator_id() -> str | None:
    value = os.getenv(OPERATOR_ID_ENV, "").strip()
    if not value or not _OPERATOR_ID_PATTERN.fullmatch(value):
        return None
    return value


def _operator_token() -> str | None:
    value = os.getenv(OPERATOR_TOKEN_ENV, "")
    if len(value) < _MINIMUM_TOKEN_LENGTH:
        return None
    return value


def operator_auth_configured() -> bool:
    """Report configuration presence without exposing credential material."""

    return _operator_id() is not None and _operator_token() is not None


def authenticate_operator(authorization: str | None) -> str:
    """Authenticate one configured development/testnet operator.

    Only an ``Authorization: Bearer`` credential is accepted.  Credentials
    are compared in constant time and are never logged or returned.
    """

    operator_id = _operator_id()
    configured_token = _operator_token()
    if operator_id is None or configured_token is None:
        raise OperatorConfigurationError(
            "Testnet operator authentication is not configured."
        )

    scheme, separator, supplied_token = (authorization or "").partition(" ")
    if (
        not separator
        or scheme.lower() != "bearer"
        or not supplied_token
        or not secrets.compare_digest(
            hashlib.sha256(supplied_token.encode("utf-8")).digest(),
            hashlib.sha256(configured_token.encode("utf-8")).digest(),
        )
    ):
        raise OperatorAuthenticationError("Operator authorization failed.")
    return operator_id


def validate_idempotency_key(value: str | None) -> str:
    """Validate an opaque request key without persisting its raw value."""

    candidate = (value or "").strip()
    if not candidate:
        raise IdempotencyKeyError("Idempotency-Key is required for issuance.")
    if not _IDEMPOTENCY_PATTERN.fullmatch(candidate):
        raise IdempotencyKeyError(
            "Idempotency-Key must be 8-128 URL-safe characters."
        )
    return candidate


def request_fingerprint(operator_id: str, payload: dict[str, Any]) -> str:
    """Hash the authenticated operator and canonical request body."""

    canonical = json.dumps(
        {"operator_id": operator_id, "payload": payload},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def idempotency_key_hash(value: str) -> str:
    """Return a safe audit identifier instead of the caller's raw key."""

    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def audit_path() -> Path:
    configured = os.getenv(AUDIT_PATH_ENV, "").strip()
    return Path(configured).expanduser() if configured else _DEFAULT_AUDIT_PATH


def append_issuance_audit(event: dict[str, Any]) -> None:
    """Append and fsync a sanitized local JSONL audit event.

    The caller must pass only non-secret fields.  This file is a development
    trace, not a tamper-evident production audit ledger.
    """

    record = {
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "control_scope": CONTROL_SCOPE,
        **event,
    }
    encoded = json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n"
    path = audit_path()
    with _AUDIT_LOCK:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())


T = TypeVar("T")


@dataclass
class _IdempotencyRecord(Generic[T]):
    fingerprint: str
    request_id: str
    event: threading.Event
    result: T | None = None
    error: BaseException | None = None
    complete: bool = False


@dataclass(frozen=True)
class CoordinatedResult(Generic[T]):
    value: T
    request_id: str
    idempotent_replay: bool


class IssuanceCoordinator:
    """Coalesce duplicate requests inside one API process.

    This deliberately does not claim cross-process or restart durability.  A
    production issuer requires a durable transaction queue and idempotency
    database in front of a protected signer.
    """

    def __init__(self, *, wait_seconds: float = 180.0) -> None:
        self._wait_seconds = wait_seconds
        self._lock = threading.Lock()
        self._records: dict[str, _IdempotencyRecord[Any]] = {}
        self._inflight_fingerprints: dict[str, _IdempotencyRecord[Any]] = {}

    def execute(
        self,
        *,
        operator_id: str,
        idempotency_key: str,
        fingerprint: str,
        operation: Callable[[str], T],
    ) -> CoordinatedResult[T]:
        scope_key = f"{operator_id}\0{idempotency_key}"
        fingerprint_scope = f"{operator_id}\0{fingerprint}"
        owner = False
        with self._lock:
            record = self._records.get(scope_key)
            if record is None:
                # Coalesce the same authenticated request while it is in
                # flight, even if a client mistakenly supplies a second key.
                # This does not create a durable cross-process guarantee.
                record = self._inflight_fingerprints.get(fingerprint_scope)
                if record is None:
                    record = _IdempotencyRecord(
                        fingerprint=fingerprint,
                        request_id=str(uuid.uuid4()),
                        event=threading.Event(),
                    )
                    self._inflight_fingerprints[fingerprint_scope] = record
                    owner = True
                self._records[scope_key] = record
            elif not secrets.compare_digest(record.fingerprint, fingerprint):
                raise IdempotencyConflictError(
                    "Idempotency-Key was already used for a different issuance request."
                )

        if owner:
            try:
                result = operation(record.request_id)
            except BaseException as exc:
                with self._lock:
                    record.error = exc
                    record.complete = True
                    self._inflight_fingerprints.pop(fingerprint_scope, None)
                    record.event.set()
                raise
            with self._lock:
                record.result = result
                record.complete = True
                self._inflight_fingerprints.pop(fingerprint_scope, None)
                record.event.set()
            return CoordinatedResult(
                value=result,
                request_id=record.request_id,
                idempotent_replay=False,
            )

        if not record.event.wait(timeout=self._wait_seconds):
            raise IdempotencyInProgressError(
                "The original issuance request is still in progress."
            )
        if record.error is not None:
            raise record.error
        if not record.complete:
            raise IdempotencyInProgressError(
                "The original issuance request has not completed."
            )
        return CoordinatedResult(
            value=record.result,  # type: ignore[arg-type]
            request_id=record.request_id,
            idempotent_replay=True,
        )

    def clear_for_tests(self) -> None:
        """Reset process-local state; intended only for isolated unit tests."""

        with self._lock:
            self._records.clear()
            self._inflight_fingerprints.clear()


issuance_coordinator = IssuanceCoordinator()


__all__ = [
    "AUDIT_PATH_ENV",
    "CONTROL_SCOPE",
    "CoordinatedResult",
    "IdempotencyConflictError",
    "IdempotencyInProgressError",
    "IdempotencyKeyError",
    "IssuanceCoordinator",
    "OperatorAuthenticationError",
    "OperatorConfigurationError",
    "append_issuance_audit",
    "authenticate_operator",
    "idempotency_key_hash",
    "issuance_coordinator",
    "issuance_enabled",
    "operator_auth_configured",
    "request_fingerprint",
    "validate_idempotency_key",
]
