"""Canonical serialization of ProofLayer RVC certificates for Solidity."""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from .models import VerificationCertificate, VerificationResult


RESULT_CODES = {
    VerificationResult.INDETERMINATE.value: 0,
    VerificationResult.PASS.value: 1,
    VerificationResult.FAIL.value: 2,
}

_UINT32_MAX = (1 << 32) - 1
_UINT64_MAX = (1 << 64) - 1
_MASK_64 = _UINT64_MAX
_BYTES32_PATTERN = re.compile(r"^(?:0x)?([0-9a-fA-F]{64})$")
_KECCAK_RATE_BYTES = 136
_ROTATION_OFFSETS = (
    0,
    1,
    62,
    28,
    27,
    36,
    44,
    6,
    55,
    20,
    3,
    10,
    43,
    25,
    39,
    41,
    45,
    15,
    21,
    8,
    18,
    2,
    61,
    56,
    14,
)
_ROUND_CONSTANTS = (
    0x0000000000000001,
    0x0000000000008082,
    0x800000000000808A,
    0x8000000080008000,
    0x000000000000808B,
    0x0000000080000001,
    0x8000000080008081,
    0x8000000000008009,
    0x000000000000008A,
    0x0000000000000088,
    0x0000000080008009,
    0x000000008000000A,
    0x000000008000808B,
    0x800000000000008B,
    0x8000000000008089,
    0x8000000000008003,
    0x8000000000008002,
    0x8000000000000080,
    0x000000000000800A,
    0x800000008000000A,
    0x8000000080008081,
    0x8000000000008080,
    0x0000000080000001,
    0x8000000080008008,
)


@dataclass(frozen=True)
class SolidityCertificateSummary:
    certificate_id: str
    asset_id: str
    claim_type: str
    policy_id: str
    evidence_root: str
    observed_at: int
    valid_until: int
    independent_root_count: int
    result: int

    def to_dict(self) -> dict[str, str | int]:
        return {
            "certificateId": self.certificate_id,
            "assetId": self.asset_id,
            "claimType": self.claim_type,
            "policyId": self.policy_id,
            "evidenceRoot": self.evidence_root,
            "observedAt": self.observed_at,
            "validUntil": self.valid_until,
            "independentRootCount": self.independent_root_count,
            "result": self.result,
        }


@dataclass(frozen=True)
class SerializedCertificate:
    human: dict[str, Any]
    solidity: SolidityCertificateSummary

    def to_dict(self) -> dict[str, Any]:
        return {"human": self.human, "solidity": self.solidity.to_dict()}


def _rotate_left_64(value: int, shift: int) -> int:
    if shift == 0:
        return value & _MASK_64
    return ((value << shift) | (value >> (64 - shift))) & _MASK_64


def _keccak_f1600(state: list[int]) -> None:
    for round_constant in _ROUND_CONSTANTS:
        columns = [
            state[x]
            ^ state[x + 5]
            ^ state[x + 10]
            ^ state[x + 15]
            ^ state[x + 20]
            for x in range(5)
        ]
        deltas = [
            columns[(x - 1) % 5] ^ _rotate_left_64(columns[(x + 1) % 5], 1)
            for x in range(5)
        ]
        for y in range(5):
            for x in range(5):
                index = x + 5 * y
                state[index] = (state[index] ^ deltas[x]) & _MASK_64

        rotated = [0] * 25
        for y in range(5):
            for x in range(5):
                source_index = x + 5 * y
                destination_index = y + 5 * ((2 * x + 3 * y) % 5)
                rotated[destination_index] = _rotate_left_64(
                    state[source_index], _ROTATION_OFFSETS[source_index]
                )

        for y in range(5):
            row_offset = 5 * y
            for x in range(5):
                state[row_offset + x] = (
                    rotated[row_offset + x]
                    ^ (
                        (~rotated[row_offset + ((x + 1) % 5)])
                        & rotated[row_offset + ((x + 2) % 5)]
                    )
                ) & _MASK_64

        state[0] ^= round_constant


def keccak256(data: bytes) -> bytes:
    """Return legacy Keccak-256, matching Solidity and ethers ``keccak256``."""
    if not isinstance(data, bytes):
        raise TypeError("keccak256 input must be bytes")

    padded = bytearray(data)
    padded.append(0x01)
    padded.extend(b"\x00" * ((-len(padded)) % _KECCAK_RATE_BYTES))
    padded[-1] ^= 0x80

    state = [0] * 25
    for block_start in range(0, len(padded), _KECCAK_RATE_BYTES):
        block = padded[block_start : block_start + _KECCAK_RATE_BYTES]
        for offset in range(0, _KECCAK_RATE_BYTES, 8):
            state[offset // 8] ^= int.from_bytes(block[offset : offset + 8], "little")
        _keccak_f1600(state)

    output = b"".join(lane.to_bytes(8, "little") for lane in state)
    return output[:32]


def _canonical_identifier(value: str, field_name: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field_name} must be a string")
    canonical = unicodedata.normalize("NFC", value.strip())
    if not canonical:
        raise ValueError(f"{field_name} must not be empty")
    return canonical


def identifier_to_bytes32(value: str) -> str:
    """Hash a canonical string identifier exactly as ``ethers.id(value)``."""
    canonical = _canonical_identifier(value, "identifier")
    return "0x" + keccak256(canonical.encode("utf-8")).hex()


def evidence_root_to_bytes32(value: str) -> str:
    """Preserve an existing bytes32 hex root, otherwise hash its canonical text."""
    canonical = _canonical_identifier(value, "evidence_root")
    match = _BYTES32_PATTERN.fullmatch(canonical)
    if match is not None:
        return "0x" + match.group(1).lower()
    return "0x" + keccak256(canonical.encode("utf-8")).hex()


def _epoch_seconds(value: datetime, field_name: str) -> int:
    if not isinstance(value, datetime):
        raise ValueError(f"{field_name} must be a datetime")
    utc_value = (
        value.replace(tzinfo=timezone.utc)
        if value.tzinfo is None
        else value.astimezone(timezone.utc)
    )
    timestamp = int(utc_value.timestamp())
    if timestamp < 0 or timestamp > _UINT64_MAX:
        raise ValueError(f"{field_name} is outside the Solidity uint64 range")
    return timestamp


def _utc_isoformat(value: datetime) -> str:
    utc_value = (
        value.replace(tzinfo=timezone.utc)
        if value.tzinfo is None
        else value.astimezone(timezone.utc)
    )
    return utc_value.isoformat().replace("+00:00", "Z")


def _result_code(result: VerificationResult | str) -> tuple[str, int]:
    result_name = result.value if isinstance(result, VerificationResult) else str(result)
    result_name = result_name.strip().upper()
    try:
        return result_name, RESULT_CODES[result_name]
    except KeyError as exc:
        raise ValueError(f"unsupported verification result: {result_name}") from exc


def serialize_certificate(certificate: VerificationCertificate) -> SerializedCertificate:
    """Convert an RVC certificate into its canonical human/Solidity forms.

    Identifier hashing is case-sensitive after trimming and Unicode NFC
    normalization. The deterministic certificate ID is the Keccak-256 hash of
    the canonical JSON encoding of every other on-chain certificate field.
    """
    if not isinstance(certificate, VerificationCertificate):
        raise TypeError("certificate must be a VerificationCertificate")

    asset = _canonical_identifier(certificate.asset_id, "asset_id")
    claim_type_name = _canonical_identifier(certificate.claim_type, "claim_type")
    policy = _canonical_identifier(certificate.policy_id, "policy_id")
    result_name, result_code = _result_code(certificate.result)
    observed_at = _epoch_seconds(certificate.observed_at, "observed_at")
    valid_until = _epoch_seconds(certificate.valid_until, "valid_until")
    if valid_until <= observed_at:
        raise ValueError("valid_until must be greater than observed_at")
    if (
        not isinstance(certificate.independent_root_count, int)
        or isinstance(certificate.independent_root_count, bool)
        or certificate.independent_root_count < 0
        or certificate.independent_root_count > _UINT32_MAX
    ):
        raise ValueError("independent_root_count must fit Solidity uint32")

    solidity_without_id: dict[str, str | int] = {
        "assetId": identifier_to_bytes32(asset),
        "claimType": identifier_to_bytes32(claim_type_name),
        "policyId": identifier_to_bytes32(policy),
        "evidenceRoot": evidence_root_to_bytes32(certificate.evidence_root),
        "observedAt": observed_at,
        "validUntil": valid_until,
        "independentRootCount": certificate.independent_root_count,
        "result": result_code,
    }
    certificate_payload = json.dumps(
        solidity_without_id,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    certificate_id = "0x" + keccak256(certificate_payload).hex()

    solidity = SolidityCertificateSummary(
        certificate_id=certificate_id,
        asset_id=str(solidity_without_id["assetId"]),
        claim_type=str(solidity_without_id["claimType"]),
        policy_id=str(solidity_without_id["policyId"]),
        evidence_root=str(solidity_without_id["evidenceRoot"]),
        observed_at=observed_at,
        valid_until=valid_until,
        independent_root_count=certificate.independent_root_count,
        result=result_code,
    )
    human = {
        "asset": asset,
        "claim_type": claim_type_name,
        "claim_version": certificate.claim_version,
        "policy_id": policy,
        "policy_version": certificate.policy_version,
        "result": result_name,
        "evidence_root": certificate.evidence_root,
        "observed_at": _utc_isoformat(certificate.observed_at),
        "valid_until": _utc_isoformat(certificate.valid_until),
        "independent_root_count": certificate.independent_root_count,
        "reason_codes": list(certificate.reason_codes),
        "compiler_version": certificate.compiler_version,
        "simulation": certificate.simulation_flag,
    }
    return SerializedCertificate(human=human, solidity=solidity)


__all__ = [
    "RESULT_CODES",
    "SerializedCertificate",
    "SolidityCertificateSummary",
    "evidence_root_to_bytes32",
    "identifier_to_bytes32",
    "keccak256",
    "serialize_certificate",
]
