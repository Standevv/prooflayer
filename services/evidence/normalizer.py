import re
from collections.abc import Iterable, Mapping, Sequence
from datetime import datetime
from typing import Any

from .models import EvidenceItem, RawEvidence


SUPPORTED_SOURCE_TYPES = frozenset(
    {"aggregator", "attestation", "oracle", "issuer", "onchain"}
)

_SOURCE_ID_ALIASES = {
    "rwaxyz": "rwa.xyz",
    "chainlink": "chainlink",
    "chainlinkproofofreserve": "chainlink",
    "chainlinksmartdata": "chainlink",
    "ondofinance": "ondo",
    "ondo": "ondo",
    "securitize": "securitize",
    "paxos": "paxos",
    "ethereum": "ethereum",
    "ethereummainnet": "ethereum",
    "xlayer": "xlayer",
}


class EvidenceNormalizationError(ValueError):
    """Raised when raw evidence cannot be normalized without losing provenance."""


def _required_text(name: str, value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise EvidenceNormalizationError(f"{name} is required")
    return value.strip()


def _normalize_datetime(name: str, value: Any) -> datetime:
    if isinstance(value, datetime):
        return value

    if isinstance(value, str) and value.strip():
        timestamp = value.strip()
        if timestamp.endswith("Z"):
            timestamp = timestamp[:-1] + "+00:00"
        try:
            return datetime.fromisoformat(timestamp)
        except ValueError as error:
            raise EvidenceNormalizationError(
                f"{name} must be an ISO-8601 timestamp"
            ) from error

    raise EvidenceNormalizationError(f"{name} is required")


def normalize_source_id(source_id: str) -> str:
    source_id = _required_text("source_id", source_id).lower()
    compact_id = re.sub(r"[^a-z0-9]", "", source_id)

    if compact_id in _SOURCE_ID_ALIASES:
        return _SOURCE_ID_ALIASES[compact_id]

    normalized_id = re.sub(r"[^a-z0-9.]+", "-", source_id)
    normalized_id = re.sub(r"-+", "-", normalized_id).strip(".-")
    if not normalized_id:
        raise EvidenceNormalizationError("source_id is required")
    return normalized_id


def _normalize_field(field_name: str) -> str:
    field_name = _required_text("field", field_name)
    field_name = re.sub(r"(.)([A-Z][a-z]+)", r"\1_\2", field_name)
    field_name = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", field_name)
    field_name = re.sub(r"[^a-zA-Z0-9]+", "_", field_name)
    normalized_field = field_name.strip("_").lower()
    if not normalized_field:
        raise EvidenceNormalizationError("field is required")
    return normalized_field


def _normalize_optional_unit(unit: Any) -> str | None:
    if unit is None:
        return None
    return _required_text("unit", unit)


def _normalize_dependency_ids(value: Any) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        raise EvidenceNormalizationError(
            "metadata.dependency_parent_ids must be a sequence"
        )
    return [
        _required_text("metadata.dependency_parent_ids item", item)
        for item in value
    ]


def normalize_evidence(raw: RawEvidence) -> EvidenceItem:
    if not isinstance(raw, RawEvidence):
        raise EvidenceNormalizationError("raw evidence must be a RawEvidence object")
    if not isinstance(raw.metadata, Mapping):
        raise EvidenceNormalizationError("metadata must be a mapping")
    if raw.value is None:
        raise EvidenceNormalizationError("value is required")

    source_type = _required_text("source_type", raw.source_type).lower()
    if source_type not in SUPPORTED_SOURCE_TYPES:
        supported = ", ".join(sorted(SUPPORTED_SOURCE_TYPES))
        raise EvidenceNormalizationError(
            f"unsupported source_type {raw.source_type!r}; expected one of: {supported}"
        )

    source_id = normalize_source_id(raw.source_id)
    raw_root_source_id = raw.metadata.get("root_source_id", source_id)
    root_source_id = normalize_source_id(raw_root_source_id)

    retrieved_at = raw.metadata.get("retrieved_at")
    if retrieved_at is not None:
        retrieved_at = _normalize_datetime("metadata.retrieved_at", retrieved_at)

    content_hash = raw.metadata.get("content_hash")
    if content_hash is not None:
        content_hash = _required_text("metadata.content_hash", content_hash)

    evidence_tier = _required_text(
        "metadata.evidence_tier", raw.metadata.get("evidence_tier", "A")
    )
    simulation = raw.metadata.get("simulation", False)
    if not isinstance(simulation, bool):
        raise EvidenceNormalizationError("metadata.simulation must be a boolean")

    return EvidenceItem(
        source_id=source_id,
        source_type=source_type,
        root_source_id=root_source_id,
        asset=_required_text("asset", raw.asset).upper(),
        field=_normalize_field(raw.field),
        value=raw.value,
        unit=_normalize_optional_unit(raw.unit),
        observed_at=_normalize_datetime("observed_at", raw.observed_at),
        retrieved_at=retrieved_at,
        content_hash=content_hash,
        dependency_parent_ids=_normalize_dependency_ids(
            raw.metadata.get("dependency_parent_ids")
        ),
        evidence_tier=evidence_tier,
        simulation=simulation,
        metadata=dict(raw.metadata),
    )


def normalize_evidence_batch(raw_evidence: Iterable[RawEvidence]) -> list[EvidenceItem]:
    return [normalize_evidence(item) for item in raw_evidence]


__all__ = [
    "EvidenceNormalizationError",
    "SUPPORTED_SOURCE_TYPES",
    "normalize_evidence",
    "normalize_evidence_batch",
    "normalize_source_id",
]
