"""Append-only local persistence for policy versions and evaluation history."""

from __future__ import annotations

import json
import os
import re
import threading
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from .models import InstitutionalPolicy, InstitutionalPolicyDraft, PolicyEvaluation
from .validator import (
    material_policy_payload,
    policy_commitment,
    policy_slug,
    validate_policy_draft,
)


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_POLICY_ROOT = ROOT / "data" / "policies"
POLICY_ID = re.compile(r"^[a-z0-9][a-z0-9-]{2,63}$")
ModelType = TypeVar("ModelType", bound=BaseModel)


class PolicyStoreError(RuntimeError):
    """Raised when local policy history cannot be trusted or safely persisted."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


class PolicyStore:
    """Small single-process store preserving every semantic policy version."""

    def __init__(
        self,
        root: Path | str = DEFAULT_POLICY_ROOT,
        *,
        clock: Callable[[], datetime] = _now,
    ) -> None:
        self.root = Path(root).resolve()
        self.clock = clock
        self._lock = threading.RLock()

    @staticmethod
    def _safe_policy_id(policy_id: str) -> str:
        if not POLICY_ID.fullmatch(policy_id):
            raise PolicyStoreError("Policy ID must be a lowercase URL-safe identifier.")
        return policy_id

    @staticmethod
    def _line(model: BaseModel) -> str:
        return json.dumps(
            model.model_dump(mode="json"),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )

    @staticmethod
    def _load(path: Path, model: type[ModelType]) -> list[ModelType]:
        if not path.exists():
            return []
        records: list[ModelType] = []
        try:
            with path.open("r", encoding="utf-8") as handle:
                for line_number, raw in enumerate(handle, start=1):
                    if not raw.strip():
                        continue
                    try:
                        records.append(model.model_validate_json(raw))
                    except (ValidationError, ValueError) as error:
                        raise PolicyStoreError(
                            f"Malformed policy history in {path.name} at line {line_number}."
                        ) from error
        except OSError as error:
            raise PolicyStoreError(f"Unable to read local policy history from {path.name}.") from error
        return records

    @staticmethod
    def _append(path: Path, line: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with path.open("a", encoding="utf-8", newline="\n") as handle:
                handle.write(line)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
        except OSError as error:
            raise PolicyStoreError(f"Unable to append local policy history to {path.name}.") from error

    @property
    def policies_path(self) -> Path:
        return self.root / "policies.jsonl"

    def evaluations_path(self, policy_id: str) -> Path:
        safe = self._safe_policy_id(policy_id)
        return self.root / "evaluations" / f"{safe}.jsonl"

    def policy_history(self, policy_id: str | None = None) -> list[InstitutionalPolicy]:
        with self._lock:
            records = self._load(self.policies_path, InstitutionalPolicy)
        if policy_id is None:
            return records
        safe = self._safe_policy_id(policy_id)
        return [record for record in records if record.policy_id == safe]

    def latest_policies(self) -> list[InstitutionalPolicy]:
        latest: dict[str, InstitutionalPolicy] = {}
        for record in self.policy_history():
            latest[record.policy_id] = record
        return [latest[key] for key in sorted(latest)]

    def get_policy(self, policy_id: str, version: int | None = None) -> InstitutionalPolicy | None:
        records = self.policy_history(policy_id)
        if version is not None:
            records = [record for record in records if record.policy_version == version]
        return records[-1] if records else None

    def save_policy(self, draft: InstitutionalPolicyDraft) -> InstitutionalPolicy:
        draft = validate_policy_draft(draft)
        policy_id = self._safe_policy_id(draft.policy_id or policy_slug(draft.name))
        with self._lock:
            existing = self.policy_history(policy_id)
            previous = existing[-1] if existing else None
            material_changed = (
                previous is None
                or material_policy_payload(previous) != material_policy_payload(draft)
            )
            version = 1 if previous is None else previous.policy_version + int(material_changed)
            commitment = policy_commitment(policy_id, draft)
            timestamp = self.clock().astimezone(timezone.utc)
            candidate = InstitutionalPolicy(
                **draft.model_dump(exclude={"policy_id"}),
                policy_id=policy_id,
                policy_version=version,
                policy_commitment=commitment,
                source="SAVED POLICY",
                created_at=previous.created_at if previous else timestamp,
                updated_at=timestamp,
            )
            if previous is not None:
                unchanged = candidate.model_dump(
                    exclude={"updated_at"}
                ) == previous.model_dump(exclude={"updated_at"})
                if unchanged:
                    return previous
            self._append(self.policies_path, self._line(candidate))
            return candidate

    def evaluations(self, policy_id: str) -> list[PolicyEvaluation]:
        with self._lock:
            return self._load(self.evaluations_path(policy_id), PolicyEvaluation)

    def append_evaluation(self, evaluation: PolicyEvaluation) -> bool:
        with self._lock:
            path = self.evaluations_path(evaluation.policy_id)
            existing = self._load(path, PolicyEvaluation)
            if any(item.evaluation_id == evaluation.evaluation_id for item in existing):
                return False
            self._append(path, self._line(evaluation))
            return True


__all__ = ["DEFAULT_POLICY_ROOT", "PolicyStore", "PolicyStoreError"]
