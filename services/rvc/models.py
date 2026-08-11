from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


class VerificationResult(str, Enum):
    PASS = "PASS"
    FAIL = "FAIL"
    INDETERMINATE = "INDETERMINATE"


@dataclass
class EvidenceRecord:
    source_id: str
    source_type: str
    root_source_id: str
    asset: str
    field: str
    value: Any
    unit: Optional[str] = None
    observed_at: Optional[datetime] = None
    retrieved_at: Optional[datetime] = None
    content_hash: Optional[str] = None
    dependency_parent_ids: List[str] = field(default_factory=list)
    evidence_tier: str = "A"
    simulation: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PredicateResult:
    predicate: str
    passed: Optional[bool]
    expected: Any = None
    observed: Any = None
    reason_code: Optional[str] = None


@dataclass
class VerificationCertificate:
    certificate_id: str
    asset_id: str
    claim_type: str
    claim_version: str
    policy_id: str
    policy_version: str
    result: VerificationResult
    predicate_results: List[PredicateResult]
    reason_codes: List[str]
    evidence_root: str
    independent_root_count: int
    observed_at: datetime
    valid_until: datetime
    compiler_version: str = "RVC-0.1"
    simulation_flag: bool = False
