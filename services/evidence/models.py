from dataclasses import dataclass, field as dataclass_field
from datetime import datetime
from typing import Any

from services.rvc.models import EvidenceRecord


# The RVC engine currently names its canonical evidence item EvidenceRecord.
# Keep one runtime type so normalized evidence can be passed to it directly.
EvidenceItem = EvidenceRecord


@dataclass(frozen=True)
class RawEvidence:
    source_type: str
    source_id: str
    asset: str
    field: str
    value: Any
    unit: str | None
    observed_at: datetime | str
    metadata: dict[str, Any] = dataclass_field(default_factory=dict)


__all__ = ["EvidenceItem", "RawEvidence"]
