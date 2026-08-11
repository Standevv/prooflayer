"""Dedicated USDY attestation adapter for the official Ankura daily report.

Ondo publishes third-party reserve attestations for USDY as daily reports
produced by Ankura Trust Company, LLC in its capacity as Verification Agent
under the Tokenized Credit and Security Agreement dated July 29, 2023. Ondo
hosts the report PDFs in a public Dropbox folder linked from the official USDY
product page.

This adapter normalizes a captured attestation snapshot (the parsed facts from
one report PDF plus its document hash) into evidence records. The
``attestation_timestamp`` is populated ONLY from the explicit report date
field in the PDF snapshot — never from download time, HTTP headers, or
filename guesses. The provenance root is the third-party attestor (ankura),
not the issuer that merely hosts the documents.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Mapping

from services.rvc.models import EvidenceRecord

from .models import RawEvidence
from .normalizer import normalize_evidence_batch

# Ondo product page ("Daily Attestation Reports" link) and the public folder it
# points to. The folder URL is pinned so an unofficial document cannot be
# substituted for the official report series.
ONDO_USDY_PRODUCT_URL = "https://ondo.finance/usdy"
ONDO_USDY_DAILY_ATTESTATION_FOLDER_URL = (
    "https://www.dropbox.com/scl/fo/375wdvar3rbc7o23nxsgp/"
    "AOFY8jhpENaNx9WAw-WPnbY?rlkey=4icqn1z9bez725wywr30fx52a"
)
ATTESTOR = "Ankura Trust Company, LLC"
AGREEMENT_DATE = "2023-07-29"

DEFAULT_USDY_ATTESTATION_SNAPSHOT = (
    Path(__file__).resolve().parents[2]
    / "data"
    / "snapshots"
    / "usdy"
    / "attestations"
    / "ankura-daily-2026-08-06.json"
)

_CACHE_STATUS = "cached_official_evidence"
_ATTESTATION_SOURCE_ID = "ankura-usdy-daily-attestation-2026-08-06"
_END_OF_DAY_SEMANTICS = "end_of_day"


class UsdyAttestationError(ValueError):
    """Raised when official USDY attestation data cannot be parsed safely."""


def _required_mapping(name: str, value: Any) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise UsdyAttestationError(f"{name} must be an object")
    return value


def _required_text(name: str, value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise UsdyAttestationError(f"{name} is required")
    return value.strip()


def _parse_timestamp(name: str, value: Any) -> datetime:
    if isinstance(value, datetime):
        timestamp = value
    elif isinstance(value, str) and value.strip():
        raw_timestamp = value.strip()
        if raw_timestamp.endswith("Z"):
            raw_timestamp = raw_timestamp[:-1] + "+00:00"
        try:
            timestamp = datetime.fromisoformat(raw_timestamp)
        except ValueError as error:
            raise UsdyAttestationError(f"{name} must be an ISO-8601 timestamp") from error
    else:
        raise UsdyAttestationError(f"{name} is required")

    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    else:
        timestamp = timestamp.astimezone(timezone.utc)
    return timestamp.replace(tzinfo=None)


def _parse_report_date(name: str, value: Any) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise UsdyAttestationError(f"{name} is required")
    try:
        parsed = datetime.strptime(value.strip(), "%Y-%m-%d")
    except ValueError as error:
        raise UsdyAttestationError(f"{name} must be an ISO-8601 calendar date") from error
    return parsed


def _parse_nonnegative_decimal(name: str, value: Any) -> Decimal:
    if isinstance(value, bool):
        raise UsdyAttestationError(f"{name} must be numeric")
    if isinstance(value, str):
        normalized = value.strip().replace(",", "")
        if normalized.endswith("%"):
            normalized = normalized[:-1].strip()
    else:
        normalized = str(value)
    try:
        parsed = Decimal(normalized)
    except (InvalidOperation, ValueError) as error:
        raise UsdyAttestationError(f"{name} must be numeric") from error
    if not parsed.is_finite() or parsed < 0:
        raise UsdyAttestationError(f"{name} must be a finite non-negative number")
    return parsed


def _sha256(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def _attestation_raw_evidence(
    *,
    field: str,
    value: Any,
    unit: str | None,
    report_date: datetime,
    retrieved_at: datetime,
    content_hash: str,
    document_hash: str,
    attestation: Mapping[str, Any],
) -> RawEvidence:
    metadata = {
        "root_source_id": "ankura",
        "retrieved_at": retrieved_at,
        "content_hash": content_hash,
        "evidence_tier": "A",
        "cache_status": _CACHE_STATUS,
        "attestor": _required_text("attestation.attestor", attestation.get("attestor")),
        "attestor_role": _required_text(
            "attestation.attestor_role", attestation.get("attestor_role")
        ),
        "agreement_date": _required_text(
            "attestation.agreement_date", attestation.get("agreement_date")
        ),
        "source_url": _required_text(
            "attestation.source_url", attestation.get("source_url")
        ),
        "source_page_url": _required_text(
            "attestation.source_page_url", attestation.get("source_page_url")
        ),
        "document_file": _required_text(
            "attestation.document_file", attestation.get("document_file")
        ),
        "document_hash": document_hash,
        "report_date": _required_text(
            "attestation.report_date", attestation.get("report_date")
        ),
        "report_date_semantics": _required_text(
            "attestation.report_date_semantics",
            attestation.get("report_date_semantics"),
        ),
        "independent_attestation": True,
    }
    return RawEvidence(
        source_type="attestation",
        source_id=_ATTESTATION_SOURCE_ID,
        asset="USDY",
        field=field,
        value=value,
        unit=unit,
        observed_at=report_date,
        metadata=metadata,
    )


def parse_usdy_attestation_snapshot(
    snapshot: Mapping[str, Any],
    *,
    content_hash: str | None = None,
) -> list[EvidenceRecord]:
    """Normalize the captured Ankura attestation into evidence records.

    ``attestation_timestamp`` is taken only from the report's explicit
    end-of-day date. No timestamp is ever inferred from retrieval time or the
    document filename.
    """
    snapshot = _required_mapping("snapshot", snapshot)
    if snapshot.get("schema_version") != 1:
        raise UsdyAttestationError("unsupported USDY attestation schema_version")
    if snapshot.get("asset") != "USDY":
        raise UsdyAttestationError("snapshot.asset must be USDY")
    if snapshot.get("cache_status") != _CACHE_STATUS:
        raise UsdyAttestationError("snapshot must be marked cached_official_evidence")

    retrieved_at = _parse_timestamp("snapshot.retrieved_at", snapshot.get("retrieved_at"))
    attestation = _required_mapping("snapshot.attestation", snapshot.get("attestation"))
    resolved_content_hash = content_hash or _sha256(
        json.dumps(
            snapshot,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
    )

    source_url = _required_text(
        "attestation.source_url", attestation.get("source_url")
    )
    if source_url != ONDO_USDY_DAILY_ATTESTATION_FOLDER_URL:
        raise UsdyAttestationError(
            "attestation.source_url must be the official Ondo daily attestation folder"
        )
    source_page_url = _required_text(
        "attestation.source_page_url", attestation.get("source_page_url")
    )
    if source_page_url != ONDO_USDY_PRODUCT_URL:
        raise UsdyAttestationError(
            "attestation.source_page_url must be the official USDY product page"
        )

    document_file = _required_text(
        "attestation.document_file", attestation.get("document_file")
    )
    document_hash = _required_text(
        "attestation.document_hash", attestation.get("document_hash")
    )
    if not document_hash.startswith("sha256:") or len(document_hash) != 71:
        raise UsdyAttestationError("attestation.document_hash must be a sha256 digest")

    attestor = _required_text("attestation.attestor", attestation.get("attestor"))
    if attestor != ATTESTOR:
        raise UsdyAttestationError(
            "attestation.attestor must be Ankura Trust Company, LLC"
        )
    agreement_date = _required_text(
        "attestation.agreement_date", attestation.get("agreement_date")
    )
    if agreement_date != AGREEMENT_DATE:
        raise UsdyAttestationError(
            "attestation.agreement_date must be the 2023-07-29 security agreement"
        )

    report_date = _parse_report_date(
        "attestation.report_date", attestation.get("report_date")
    )
    semantics = _required_text(
        "attestation.report_date_semantics",
        attestation.get("report_date_semantics"),
    )
    if semantics != _END_OF_DAY_SEMANTICS:
        raise UsdyAttestationError(
            "attestation.report_date_semantics must be end_of_day"
        )
    # End-of-day report date -> the explicit timestamp carried by the report.
    attestation_timestamp = report_date.replace(hour=23, minute=59, second=59)

    facts = _required_mapping("attestation.facts", attestation.get("facts"))
    token_principal_outstanding = _parse_nonnegative_decimal(
        "attestation.facts.token_principal_outstanding",
        facts.get("token_principal_outstanding"),
    )
    permitted_assets_market_value = _parse_nonnegative_decimal(
        "attestation.facts.permitted_assets_market_value",
        facts.get("permitted_assets_market_value"),
    )
    permitted_assets_ratio = _parse_nonnegative_decimal(
        "attestation.facts.permitted_assets_ratio",
        facts.get("permitted_assets_ratio"),
    )
    if permitted_assets_market_value == 0:
        raise UsdyAttestationError(
            "attestation.facts.permitted_assets_market_value must be positive"
        )

    raw_evidence = [
        _attestation_raw_evidence(
            field="attestation_timestamp",
            value=attestation_timestamp,
            unit=None,
            report_date=report_date,
            retrieved_at=retrieved_at,
            content_hash=resolved_content_hash,
            document_hash=document_hash,
            attestation=attestation,
        ),
        _attestation_raw_evidence(
            field="attested_assets_value",
            value=permitted_assets_market_value,
            unit="USD",
            report_date=report_date,
            retrieved_at=retrieved_at,
            content_hash=resolved_content_hash,
            document_hash=document_hash,
            attestation=attestation,
        ),
        _attestation_raw_evidence(
            field="attested_token_principal_outstanding",
            value=token_principal_outstanding,
            unit="USD",
            report_date=report_date,
            retrieved_at=retrieved_at,
            content_hash=resolved_content_hash,
            document_hash=document_hash,
            attestation=attestation,
        ),
        _attestation_raw_evidence(
            field="attested_collateralization_ratio",
            value=permitted_assets_ratio,
            unit=None,
            report_date=report_date,
            retrieved_at=retrieved_at,
            content_hash=resolved_content_hash,
            document_hash=document_hash,
            attestation=attestation,
        ),
    ]
    return normalize_evidence_batch(raw_evidence)


def _load_attestation_document(
    snapshot_path: str | Path,
) -> tuple[Mapping[str, Any], str]:
    path = Path(snapshot_path)
    try:
        payload = path.read_bytes()
        snapshot = json.loads(payload.decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise UsdyAttestationError(
            f"unable to load USDY attestation snapshot: {path}"
        ) from error
    return _required_mapping("snapshot", snapshot), _sha256(payload)


def load_usdy_attestation_snapshot(
    snapshot_path: str | Path = DEFAULT_USDY_ATTESTATION_SNAPSHOT,
) -> list[EvidenceRecord]:
    snapshot, content_hash = _load_attestation_document(snapshot_path)
    return parse_usdy_attestation_snapshot(snapshot, content_hash=content_hash)


__all__ = [
    "ATTESTOR",
    "AGREEMENT_DATE",
    "DEFAULT_USDY_ATTESTATION_SNAPSHOT",
    "ONDO_USDY_DAILY_ATTESTATION_FOLDER_URL",
    "UsdyAttestationError",
    "load_usdy_attestation_snapshot",
    "parse_usdy_attestation_snapshot",
]
