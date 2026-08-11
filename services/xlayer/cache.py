"""Small thread-safe TTL cache for read-only MVP chain lookups."""

from __future__ import annotations

from collections import OrderedDict
from copy import deepcopy
from dataclasses import dataclass
from threading import RLock
from time import monotonic
from typing import Any, Callable


MISSING = object()


@dataclass
class _Entry:
    value: Any
    expires_at: float


class TtlCache:
    """Bounded local cache that retains successful values only."""

    def __init__(
        self,
        *,
        ttl_seconds: float,
        max_entries: int,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        self._ttl_seconds = ttl_seconds
        self._max_entries = max_entries
        self._clock = clock
        self._entries: OrderedDict[str, _Entry] = OrderedDict()
        self._lock = RLock()

    def get(self, key: str) -> Any:
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return MISSING
            if entry.expires_at <= self._clock():
                self._entries.pop(key, None)
                return MISSING
            try:
                value = deepcopy(entry.value)
            except Exception:
                self._entries.pop(key, None)
                return MISSING
            self._entries.move_to_end(key)
            return value

    def set(self, key: str, value: Any) -> None:
        try:
            stored = deepcopy(value)
        except Exception:
            return
        with self._lock:
            now = self._clock()
            expired = [
                entry_key
                for entry_key, entry in self._entries.items()
                if entry.expires_at <= now
            ]
            for entry_key in expired:
                self._entries.pop(entry_key, None)
            self._entries[key] = _Entry(
                value=stored,
                expires_at=now + self._ttl_seconds,
            )
            self._entries.move_to_end(key)
            while len(self._entries) > self._max_entries:
                self._entries.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


__all__ = ["MISSING", "TtlCache"]
