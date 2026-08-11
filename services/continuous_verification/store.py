"""Append-only local JSONL persistence for the Continuous Verification MVP."""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from .models import TrustSnapshot, TrustTransition


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MONITORING_ROOT = ROOT / "data" / "monitoring"
SUPPORTED_ASSETS = {"USDY", "PAXG"}
ModelType = TypeVar("ModelType", bound=BaseModel)


class MonitoringStoreError(RuntimeError):
    """Raised when durable monitoring history cannot be trusted or persisted."""


class MonitoringStore:
    """Small single-process append-only store with deterministic serialization."""

    def __init__(self, root: Path | str = DEFAULT_MONITORING_ROOT) -> None:
        self.root = Path(root).resolve()
        self._lock = threading.RLock()

    @staticmethod
    def _asset(value: str) -> str:
        asset = value.strip().upper() if isinstance(value, str) else ""
        if asset not in SUPPORTED_ASSETS:
            raise MonitoringStoreError(
                f"Unsupported monitoring asset {value!r}; supported assets are USDY and PAXG."
            )
        return asset

    def _path(self, asset: str, name: str) -> Path:
        normalized = self._asset(asset)
        return self.root / normalized.lower() / f"{name}.jsonl"

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
        results: list[ModelType] = []
        try:
            with path.open("r", encoding="utf-8") as handle:
                for line_number, raw in enumerate(handle, start=1):
                    if not raw.strip():
                        continue
                    try:
                        results.append(model.model_validate_json(raw))
                    except (ValidationError, ValueError) as error:
                        raise MonitoringStoreError(
                            f"Malformed monitoring history in {path.name} at line {line_number}."
                        ) from error
        except OSError as error:
            raise MonitoringStoreError(
                f"Unable to read monitoring history from {path.name}."
            ) from error
        return results

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
            raise MonitoringStoreError(
                f"Unable to append monitoring history to {path.name}."
            ) from error

    def snapshots(self, asset: str) -> list[TrustSnapshot]:
        with self._lock:
            return self._load(self._path(asset, "snapshots"), TrustSnapshot)

    def transitions(self, asset: str) -> list[TrustTransition]:
        with self._lock:
            return self._load(self._path(asset, "transitions"), TrustTransition)

    def latest_snapshot(self, asset: str) -> TrustSnapshot | None:
        snapshots = self.snapshots(asset)
        return snapshots[-1] if snapshots else None

    def append_snapshot(self, snapshot: TrustSnapshot) -> bool:
        """Append once by snapshot ID; return False for an exact rerun duplicate."""

        with self._lock:
            path = self._path(snapshot.asset, "snapshots")
            existing = self._load(path, TrustSnapshot)
            if any(item.snapshot_id == snapshot.snapshot_id for item in existing):
                return False
            self._append(path, self._line(snapshot))
            return True

    def append_transitions(self, transitions: list[TrustTransition]) -> int:
        """Append unique transition IDs in supplied deterministic order."""

        if not transitions:
            return 0
        asset = transitions[0].asset
        if any(item.asset != asset for item in transitions):
            raise MonitoringStoreError("A transition batch must contain one asset only.")
        with self._lock:
            path = self._path(asset, "transitions")
            existing_ids = {
                item.transition_id for item in self._load(path, TrustTransition)
            }
            appended = 0
            for transition in transitions:
                if transition.transition_id in existing_ids:
                    continue
                self._append(path, self._line(transition))
                existing_ids.add(transition.transition_id)
                appended += 1
            return appended


__all__ = [
    "DEFAULT_MONITORING_ROOT",
    "MonitoringStore",
    "MonitoringStoreError",
]
