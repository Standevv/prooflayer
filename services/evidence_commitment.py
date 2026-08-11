"""Versioned, deterministic evidence commitments for read-only ProofLayer claims.

The commitment is intentionally independent of evidence ordering. It serializes a
canonical view of the claim asset, claim type, and evidence records. The record
shape is designed to be stable and to include both the support chain (source/root)
and the raw evidence boundary that a verification certificate can re-produce.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from datetime import datetime
from decimal import Decimal
from typing import Any

from services.rvc.models import EvidenceRecord

EVIDENCE_COMMITMENT_VERSION = "pl-evidence-v1"

TRUSTED_ROOT_SOURCE_REGISTRY: dict[str, str] = {
    "ondo": "ondo",
    "ondo-finance": "ondo",
    "paxos": "paxos",
    "kpmg": "kpmg",
    "kpmg-llp": "kpmg",
    "ankura": "ankura",
    "ankura-trust": "ankura",
    "ankura-trust-company": "ankura",
    "ethereum": "ethereum",
    "evm": "ethereum",
    "xlayer": "xlayer",
    "x-layer": "xlayer",
    "xlayer-testnet": "xlayer",
    "chainlink": "chainlink",
    "chainlink-proof": "chainlink",
}


def _serialize_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat() if value.tzinfo else value.replace(tzinfo=None).isoformat()
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, (list, tuple, set)):
        return sorted(_serialize_value(item) for item in value)
    if isinstance(value, dict):
        return {
            str(key): _serialize_value(value[key])
            for key in sorted(value.keys(), key=lambda item: str(item))
        }
    return value


def _canonical_record(record: EvidenceRecord) -> dict[str, Any]:
    return {
        "asset": record.asset,
        "content_hash": record.content_hash,
        "evidence_tier": record.evidence_tier,
        "field": record.field,
        "observed_at": (
            record.observed_at.isoformat() if isinstance(record.observed_at, datetime) else None
        ),
        "retrieved_at": (
            record.retrieved_at.isoformat() if isinstance(record.retrieved_at, datetime) else None
        ),
        "root_source_id": record.root_source_id,
        "simulation": bool(record.simulation),
        "source_id": record.source_id,
        "source_type": record.source_type,
        "unit": record.unit,
        "value": _serialize_value(record.value),
    }


def compute_evidence_commitment(
    asset_id: str,
    claim_type: str,
    evidence: Iterable[EvidenceRecord],
) -> str:
    """Return the canonical manifest commitment for the supplied evidence set.

    The function is deterministic and order-independent. Evidence supplied in any
    order produces the same commitment because the record payload is normalized and
    sorted before hashing.
    """

    normalized_asset = str(asset_id or "").strip().upper()
    normalized_claim = str(claim_type or "").strip()
    raw_records = list(evidence)
    canonical_records = sorted(
        (_canonical_record(item) for item in raw_records),
        key=lambda item: (
            item.get("source_id") or "",
            item.get("field") or "",
            item.get("root_source_id") or "",
            json.dumps(item, sort_keys=True, default=str),
        ),
    )
    payload = {
        "version": EVIDENCE_COMMITMENT_VERSION,
        "asset_id": normalized_asset,
        "claim_type": normalized_claim,
        "records": canonical_records,
    }
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode(
        "utf-8"
    )
    return "0x" + hashlib.sha256(encoded).hexdigest()


__all__ = [
    "EVIDENCE_COMMITMENT_VERSION",
    "TRUSTED_ROOT_SOURCE_REGISTRY",
    "compute_evidence_commitment",
]
