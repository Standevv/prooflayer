"""Bounded, deterministic event queries for the fixed X Layer deployment."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from time import monotonic
from typing import Any


class EventQueryUnavailable(RuntimeError):
    """Raised when a bounded historical read cannot complete safely."""


@dataclass(frozen=True)
class EventLookupResult:
    logs: list[Mapping[str, Any]]
    query_from_block: int
    query_to_block: int
    history_complete_since_deployment: bool
    chunks_queried: int


class BoundedEventQuery:
    """Read one topic-filtered contract event without unbounded RPC fan-out."""

    def __init__(
        self,
        chain: Any,
        *,
        address: str,
        event_topic: str,
        deployment_block: int,
        max_scan_blocks: int,
        chunk_size: int,
        batch_size: int,
        timeout_seconds: float,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        self._chain = chain
        self._address = address
        self._event_topic = event_topic
        self._deployment_block = deployment_block
        self._max_scan_blocks = max_scan_blocks
        self._chunk_size = chunk_size
        self._batch_size = batch_size
        self._timeout_seconds = timeout_seconds
        self._clock = clock

    def lookup(
        self,
        certificate_id: str,
        latest_block: int,
        *,
        newest_only: bool,
    ) -> EventLookupResult:
        query_from = max(
            self._deployment_block,
            latest_block - self._max_scan_blocks + 1,
        )
        if latest_block < query_from:
            return EventLookupResult(
                logs=[],
                query_from_block=query_from,
                query_to_block=latest_block,
                history_complete_since_deployment=query_from == self._deployment_block,
                chunks_queried=0,
            )
        ranges = self._ranges(query_from, latest_block, newest_first=newest_only)
        started = self._clock()
        logs: list[Mapping[str, Any]] = []
        chunks_queried = 0
        for index in range(0, len(ranges), self._batch_size):
            if self._clock() - started > self._timeout_seconds:
                raise EventQueryUnavailable("DecisionLog lookup timed out")
            batch_ranges = ranges[index : index + self._batch_size]
            calls = [
                (
                    "eth_getLogs",
                    [
                        {
                            "address": self._address,
                            "fromBlock": hex(start),
                            "toBlock": hex(end),
                            "topics": [self._event_topic, None, certificate_id],
                        }
                    ],
                )
                for start, end in batch_ranges
            ]
            try:
                results = self._chain.batch(calls)
            except Exception as error:
                raise EventQueryUnavailable("DecisionLog lookup failed") from error
            chunks_queried += len(batch_ranges)
            for result in results:
                if isinstance(result, list):
                    logs.extend(item for item in result if isinstance(item, Mapping))
            if newest_only and logs:
                break
            if self._clock() - started > self._timeout_seconds:
                raise EventQueryUnavailable("DecisionLog lookup timed out")
        ordered_logs = sorted(
            self._deduplicate(logs),
            key=lambda item: (
                self._hex_int(item.get("blockNumber")),
                self._hex_int(item.get("transactionIndex")),
                self._hex_int(item.get("logIndex")),
                str(item.get("transactionHash", "")),
            ),
        )
        return EventLookupResult(
            logs=ordered_logs,
            query_from_block=query_from,
            query_to_block=latest_block,
            history_complete_since_deployment=query_from == self._deployment_block,
            chunks_queried=chunks_queried,
        )

    def _ranges(
        self,
        query_from: int,
        query_to: int,
        *,
        newest_first: bool,
    ) -> list[tuple[int, int]]:
        ranges: list[tuple[int, int]] = []
        if newest_first:
            end = query_to
            while end >= query_from:
                start = max(query_from, end - self._chunk_size + 1)
                ranges.append((start, end))
                end = start - 1
            return ranges
        start = query_from
        while start <= query_to:
            end = min(query_to, start + self._chunk_size - 1)
            ranges.append((start, end))
            start = end + 1
        return ranges

    @staticmethod
    def _hex_int(value: object) -> int:
        try:
            return int(str(value or "0x0"), 16)
        except ValueError:
            return 0

    @classmethod
    def _deduplicate(cls, logs: list[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
        seen: set[tuple[str, int]] = set()
        deduplicated: list[Mapping[str, Any]] = []
        for item in logs:
            key = (
                str(item.get("blockHash") or item.get("transactionHash") or ""),
                cls._hex_int(item.get("logIndex")),
            )
            if key in seen:
                continue
            seen.add(key)
            deduplicated.append(item)
        return deduplicated


__all__ = ["BoundedEventQuery", "EventLookupResult", "EventQueryUnavailable"]
