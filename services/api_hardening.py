"""Minimal request hardening primitives for the read-only ProofLayer API MVP."""

from __future__ import annotations

import asyncio
import time
from collections import defaultdict, deque
from threading import RLock
from typing import Any, Callable


class RequestSizeGuard:
    """Fail-closed request-size guard keyed to the HTTP body budget."""

    def __init__(self, *, max_request_bytes: int = 1_048_576) -> None:
        if max_request_bytes <= 0:
            raise ValueError("max_request_bytes must be positive")
        self.max_request_bytes = max_request_bytes

    def allow(self, body_size: int) -> bool:
        if body_size < 0:
            return False
        return body_size <= self.max_request_bytes


class ApiRateLimiter:
    """Small in-memory fixed-window limiter for anonymous MVP API consumption."""

    def __init__(
        self,
        *,
        max_requests: int = 60,
        window_seconds: float = 60.0,
        clock: Callable[[], float] | None = None,
    ) -> None:
        if max_requests <= 0:
            raise ValueError("max_requests must be positive")
        if window_seconds <= 0:
            raise ValueError("window_seconds must be positive")
        self.max_requests = max_requests
        self.window_seconds = float(window_seconds)
        self._clock = clock or time.monotonic
        self._records: dict[str, deque[float]] = {}
        self._lock = RLock()

    def allow(self, client_key: str, endpoint: str | None = None) -> bool:
        now = self._clock()
        key = f"{client_key}|{endpoint or '*'}"
        with self._lock:
            history = self._records.get(key)
            if history is None:
                history = deque()
                self._records[key] = history
            # Remove expired samples.
            while history and now - history[0] > self.window_seconds:
                history.popleft()

            if len(history) >= self.max_requests:
                return False
            history.append(now)
            return True


class ApiConcurrencyLimiter:
    """A tiny async semaphore used as a public read-only concurrency floor."""

    def __init__(self, *, max_active_requests: int = 4) -> None:
        if max_active_requests <= 0:
            raise ValueError("max_active_requests must be positive")
        self.max_active_requests = max_active_requests
        self._semaphore = asyncio.Semaphore(max_active_requests)
        self._active = 0

    async def __aenter__(self) -> "ApiConcurrencyLimiter":
        await self._semaphore.acquire()
        self._active += 1
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        self._active -= 1
        self._semaphore.release()


__all__ = ["ApiConcurrencyLimiter", "ApiRateLimiter", "RequestSizeGuard"]
