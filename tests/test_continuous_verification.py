from __future__ import annotations

import argparse
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError

from apps.api.main import app
from scripts.watch_verification import parse_interval
from services.continuous_verification.engine import (
    ContinuousVerificationEngine,
    MonitoringError,
    compare_snapshots,
)
from services.continuous_verification.models import TrustSnapshot
from services.continuous_verification.store import (
    MonitoringStore,
    MonitoringStoreError,
)


CERTIFICATE_ID = "0x" + "ab" * 32
BASE_TIME = datetime(2026, 8, 10, 12, 0, tzinfo=timezone.utc)


def snapshot(**changes: object) -> TrustSnapshot:
    values: dict[str, object] = {
        "snapshot_id": "0x" + "1" * 64,
        "asset": "USDY",
        "claim": "TreasuryBacking",
        "checked_at": BASE_TIME,
        "verification_result": "PASS",
        "reason_codes": [],
        "evidence_root": "0x" + "2" * 64,
        "independent_root_count": 2,
        "evidence_freshness": "CURRENT",
        "certificate_id": CERTIFICATE_ID,
        "certificate_exists": True,
        "certificate_usable": True,
        "certificate_status": "REGISTERED_USABLE",
        "certificate_lifecycle_state": "ACTIVE",
        "certificate_historical_result": "PASS",
        "certificate_valid_until": 1_900_000_000,
        "policygate_outcome": "ALLOW",
        "source_status": "COMPLETE",
        "authenticity_sources": [
            "DETERMINISTIC RVC",
            "CACHED OFFICIAL EVIDENCE",
            "LIVE ON-CHAIN",
            "DERIVED",
        ],
        "blockchain_write_performed": False,
    }
    values.update(changes)
    return TrustSnapshot.model_validate(values)


def detail(
    *,
    result: str = "PASS",
    reasons: list[str] | None = None,
    freshness: str = "CURRENT",
    roots: int = 2,
    evidence_root: str = "0x" + "2" * 64,
    certificate_id: str | None = CERTIFICATE_ID,
) -> SimpleNamespace:
    attestation = SimpleNamespace(
        source_id="issuer-attestation",
        source_type="attestation",
        observed_at="2026-08-09T00:00:00+00:00",
        freshness=freshness,
        freshness_reason="Existing RVC freshness assessment.",
        authenticity_labels=["ATTESTATION", "CACHED OFFICIAL EVIDENCE"],
    )
    age_predicate = SimpleNamespace(
        predicate="reserve_attestation.age <= policy.max_age",
        expected="<= 31 days",
    )
    return SimpleNamespace(
        verification=SimpleNamespace(
            result=result,
            reason_codes=reasons or [],
            policy_id="default-treasury-policy",
            predicates=[age_predicate],
        ),
        evidence_commitment=SimpleNamespace(value=evidence_root),
        provenance=SimpleNamespace(independent_root_count=roots),
        freshness_summary=freshness,
        evidence_records=[attestation],
        certificate_linkage=SimpleNamespace(certificate_id=certificate_id),
    )


class FakeEvidence:
    def __init__(self, states: list[SimpleNamespace] | None = None) -> None:
        self.states = states or [detail()]
        self.calls: list[tuple[str, bool]] = []
        self.index = 0

    def get_asset(self, asset: str, *, include_certificate: bool):
        self.calls.append((asset, include_certificate))
        result = self.states[min(self.index, len(self.states) - 1)]
        self.index += 1
        return result


class FakeTools:
    def __init__(
        self,
        *,
        rpc_failure: bool = False,
        usable: bool = True,
        valid_until: int = 1_900_000_000,
        gate: str = "ALLOWED",
    ) -> None:
        self.rpc_failure = rpc_failure
        self.usable = usable
        self.valid_until = valid_until
        self.gate = gate
        self.calls: list[str] = []

    def get_certificate_state(self, _certificate_id: str):
        self.calls.append("get_certificate_state")
        if self.rpc_failure:
            raise RuntimeError("mock RPC unavailable")
        return {
            "certificate_status": (
                "REGISTERED_USABLE" if self.usable else "REGISTERED_UNUSABLE"
            ),
            "exists": True,
            "registered": True,
            "usable": self.usable,
            "revoked": False,
            "result": "PASS",
            "valid_until": self.valid_until,
        }

    def get_policygate_state(self, *_args: str):
        self.calls.append("get_policygate_state")
        if self.rpc_failure:
            raise RuntimeError("mock RPC unavailable")
        return {"policygate_outcome": self.gate, "action_executed": False}

    def get_asset_metadata(self, _asset: str):
        self.calls.append("get_asset_metadata")
        return {
            "known_live_certificate_id": CERTIFICATE_ID,
            "policy": "default-treasury-policy",
        }


class FailingEvidence:
    def get_asset(self, _asset: str, *, include_certificate: bool):
        del include_certificate
        raise RuntimeError("mock verifier unavailable")


class ContinuousVerificationTests(unittest.TestCase):
    def test_first_snapshot_creates_no_transition(self) -> None:
        self.assertEqual(compare_snapshots(None, snapshot()), [])

    def test_identical_snapshot_creates_no_transition(self) -> None:
        previous = snapshot()
        current = snapshot(snapshot_id="0x" + "3" * 64, checked_at=BASE_TIME + timedelta(minutes=5))
        self.assertEqual(compare_snapshots(previous, current), [])

    def test_pass_to_indeterminate_is_critical(self) -> None:
        result = compare_snapshots(
            snapshot(),
            snapshot(snapshot_id="0x" + "3" * 64, verification_result="INDETERMINATE"),
        )
        change = next(item for item in result if item.category == "VERIFICATION_RESULT_CHANGED")
        self.assertEqual(change.severity, "CRITICAL")

    def test_pass_to_fail_is_critical(self) -> None:
        result = compare_snapshots(
            snapshot(), snapshot(snapshot_id="0x" + "3" * 64, verification_result="FAIL")
        )
        self.assertEqual(result[0].severity, "CRITICAL")

    def test_current_to_stale_is_warning(self) -> None:
        result = compare_snapshots(
            snapshot(), snapshot(snapshot_id="0x" + "3" * 64, evidence_freshness="STALE")
        )
        change = next(item for item in result if item.category == "EVIDENCE_FRESHNESS_CHANGED")
        self.assertEqual(change.severity, "WARNING")

    def test_usable_to_expired_is_critical(self) -> None:
        result = compare_snapshots(
            snapshot(),
            snapshot(
                snapshot_id="0x" + "3" * 64,
                certificate_usable=False,
                certificate_status="REGISTERED_UNUSABLE",
                certificate_lifecycle_state="EXPIRED",
            ),
        )
        status = next(item for item in result if item.category == "CERTIFICATE_STATUS_CHANGED")
        usable = next(item for item in result if item.category == "CERTIFICATE_USABILITY_CHANGED")
        self.assertEqual(status.severity, "CRITICAL")
        self.assertEqual(usable.severity, "CRITICAL")

    def test_allow_to_block_is_critical(self) -> None:
        result = compare_snapshots(
            snapshot(), snapshot(snapshot_id="0x" + "3" * 64, policygate_outcome="BLOCK")
        )
        change = next(item for item in result if item.category == "POLICYGATE_OUTCOME_CHANGED")
        self.assertEqual(change.severity, "CRITICAL")

    def test_independent_root_decrease_is_warning(self) -> None:
        result = compare_snapshots(
            snapshot(), snapshot(snapshot_id="0x" + "3" * 64, independent_root_count=1)
        )
        change = next(
            item for item in result if item.category == "INDEPENDENT_ROOT_COUNT_CHANGED"
        )
        self.assertEqual(change.severity, "WARNING")

    def test_reason_code_change_is_detected(self) -> None:
        result = compare_snapshots(
            snapshot(),
            snapshot(snapshot_id="0x" + "3" * 64, reason_codes=["MISSING_EVIDENCE"]),
        )
        change = next(item for item in result if item.category == "REASON_CODES_CHANGED")
        self.assertEqual(change.severity, "WARNING")

    def test_rpc_failure_preserves_deterministic_verification(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            engine = ContinuousVerificationEngine(
                FakeTools(rpc_failure=True),
                evidence=FakeEvidence([detail(result="INDETERMINATE")]),
                store=MonitoringStore(temporary),
                clock=lambda: BASE_TIME,
            )
            result = engine.run_monitoring_check("USDY", "TreasuryBacking")
        current = result.current_snapshot
        self.assertEqual(current.verification_result, "INDETERMINATE")
        self.assertEqual(current.certificate_status, "LIVE_READ_UNAVAILABLE")
        self.assertEqual(current.policygate_outcome, "NOT CHECKED")
        self.assertEqual(current.source_status, "PARTIAL")

    def test_verifier_failure_can_still_preserve_certificate_read(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            engine = ContinuousVerificationEngine(
                FakeTools(),
                evidence=FailingEvidence(),
                store=MonitoringStore(temporary),
                clock=lambda: BASE_TIME,
            )
            result = engine.run_monitoring_check("USDY", "TreasuryBacking")
        self.assertEqual(result.current_snapshot.verification_result, "UNAVAILABLE")
        self.assertTrue(result.current_snapshot.certificate_exists)
        self.assertEqual(result.current_snapshot.source_status, "PARTIAL")

    def test_only_read_only_tool_methods_are_called(self) -> None:
        tools = FakeTools()
        with tempfile.TemporaryDirectory() as temporary:
            engine = ContinuousVerificationEngine(
                tools,
                evidence=FakeEvidence(),
                store=MonitoringStore(temporary),
                clock=lambda: BASE_TIME,
            )
            result = engine.run_monitoring_check("USDY", "TreasuryBacking")
        self.assertEqual(tools.calls, ["get_certificate_state", "get_policygate_state"])
        self.assertFalse(result.blockchain_write_performed)
        self.assertTrue(all("write" not in call and "execute" not in call for call in tools.calls))

    def test_snapshot_persistence_is_append_only(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            store = MonitoringStore(temporary)
            item = snapshot()
            self.assertTrue(store.append_snapshot(item))
            self.assertFalse(store.append_snapshot(item))
            self.assertEqual(store.snapshots("USDY"), [item])
            line = (Path(temporary) / "usdy" / "snapshots.jsonl").read_text(encoding="utf-8")
            self.assertEqual(len(line.strip().splitlines()), 1)

    def test_transition_persistence(self) -> None:
        previous = snapshot()
        current = snapshot(snapshot_id="0x" + "3" * 64, policygate_outcome="BLOCK")
        transitions = compare_snapshots(previous, current)
        with tempfile.TemporaryDirectory() as temporary:
            store = MonitoringStore(temporary)
            self.assertEqual(store.append_transitions(transitions), 1)
            self.assertEqual(store.transitions("USDY"), transitions)

    def test_unsupported_asset_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            engine = ContinuousVerificationEngine(store=MonitoringStore(temporary))
            with self.assertRaises(MonitoringError):
                engine.run_monitoring_check("SOLAR", "ProjectBacking")

    def test_malformed_history_is_rejected_before_append(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "usdy" / "snapshots.jsonl"
            path.parent.mkdir(parents=True)
            path.write_text("{not valid json}\n", encoding="utf-8")
            store = MonitoringStore(temporary)
            with self.assertRaisesRegex(MonitoringStoreError, "line 1"):
                store.append_snapshot(snapshot())
            self.assertEqual(path.read_text(encoding="utf-8"), "{not valid json}\n")

    def test_watch_interval_lower_bound_is_enforced(self) -> None:
        with self.assertRaises(argparse.ArgumentTypeError):
            parse_interval("59")
        self.assertEqual(parse_interval("60"), 60)

    def test_duplicate_transition_ids_are_not_persisted(self) -> None:
        transitions = compare_snapshots(
            snapshot(), snapshot(snapshot_id="0x" + "3" * 64, policygate_outcome="BLOCK")
        )
        with tempfile.TemporaryDirectory() as temporary:
            store = MonitoringStore(temporary)
            self.assertEqual(store.append_transitions(transitions), 1)
            self.assertEqual(store.append_transitions(transitions), 0)
            self.assertEqual(len(store.transitions("USDY")), 1)

    def test_snapshot_timestamp_is_normalized_to_utc(self) -> None:
        offset = timezone(timedelta(hours=5))
        result = snapshot(checked_at=datetime(2026, 8, 10, 17, 0, tzinfo=offset))
        self.assertEqual(result.checked_at, BASE_TIME)
        self.assertIn('"checked_at":"2026-08-10T12:00:00Z"', result.model_dump_json())

    def test_naive_snapshot_timestamp_is_rejected(self) -> None:
        with self.assertRaises(ValidationError):
            snapshot(checked_at=datetime(2026, 8, 10, 12, 0))

    def test_first_engine_run_establishes_baseline(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            engine = ContinuousVerificationEngine(
                FakeTools(),
                evidence=FakeEvidence(),
                store=MonitoringStore(temporary),
                clock=lambda: BASE_TIME,
            )
            result = engine.run_monitoring_check("USDY", "TreasuryBacking")
            self.assertIsNone(result.previous_snapshot)
            self.assertEqual(result.transitions, [])
            self.assertTrue(result.snapshot_persisted)

    def test_second_identical_engine_state_has_no_transition(self) -> None:
        times = iter([BASE_TIME, BASE_TIME + timedelta(minutes=5)])
        with tempfile.TemporaryDirectory() as temporary:
            engine = ContinuousVerificationEngine(
                FakeTools(),
                evidence=FakeEvidence([detail(), detail()]),
                store=MonitoringStore(temporary),
                clock=lambda: next(times),
            )
            engine.run_monitoring_check("USDY", "TreasuryBacking")
            result = engine.run_monitoring_check("USDY", "TreasuryBacking")
            self.assertEqual(result.transitions, [])
            self.assertEqual(len(engine.store.snapshots("USDY")), 2)

    def test_engine_persists_real_transition_from_changed_state(self) -> None:
        times = iter([BASE_TIME, BASE_TIME + timedelta(minutes=5)])
        with tempfile.TemporaryDirectory() as temporary:
            engine = ContinuousVerificationEngine(
                FakeTools(),
                evidence=FakeEvidence(
                    [detail(result="PASS"), detail(result="INDETERMINATE", reasons=["MISSING_EVIDENCE"])]
                ),
                store=MonitoringStore(temporary),
                clock=lambda: next(times),
            )
            engine.run_monitoring_check("USDY", "TreasuryBacking")
            result = engine.run_monitoring_check("USDY", "TreasuryBacking")
            self.assertTrue(any(item.category == "VERIFICATION_RESULT_CHANGED" for item in result.transitions))
            self.assertEqual(len(engine.store.transitions("USDY")), len(result.transitions))

    def test_freshness_details_are_deduplicated_by_source(self) -> None:
        evidence = FakeEvidence([detail(freshness="STALE")])
        evidence.states[0].evidence_records *= 3
        with tempfile.TemporaryDirectory() as temporary:
            engine = ContinuousVerificationEngine(
                FakeTools(), evidence=evidence, store=MonitoringStore(temporary), clock=lambda: BASE_TIME
            )
            result = engine.run_monitoring_check("USDY", "TreasuryBacking")
        records = result.current_snapshot.evidence_freshness_records
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0].policy_max_age, "<= 31 days")

    def test_paxg_without_fixture_does_not_infer_certificate_state(self) -> None:
        paxg_detail = detail(result="INDETERMINATE", freshness="STALE", certificate_id=None)
        with tempfile.TemporaryDirectory() as temporary:
            tools = FakeTools()
            engine = ContinuousVerificationEngine(
                tools,
                evidence=FakeEvidence([paxg_detail]),
                store=MonitoringStore(temporary),
                clock=lambda: BASE_TIME,
            )
            result = engine.run_monitoring_check("PAXG", "GoldBacking")
        self.assertEqual(result.current_snapshot.certificate_status, "NO_CERTIFICATE_FIXTURE")
        self.assertEqual(result.current_snapshot.policygate_outcome, "NOT CHECKED")
        self.assertEqual(tools.calls, [])

    def test_monitoring_api_routes_are_present(self) -> None:
        paths = app.openapi()["paths"]
        self.assertIn("/monitoring/check", paths)
        self.assertIn("/monitoring", paths)
        self.assertIn("/monitoring/{asset}", paths)

    def test_monitoring_api_round_trip_uses_injected_engine(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            engine = ContinuousVerificationEngine(
                FakeTools(),
                evidence=FakeEvidence(),
                store=MonitoringStore(temporary),
                clock=lambda: BASE_TIME,
            )
            with patch("apps.api.main.continuous_verification", engine):
                checked = TestClient(app).post(
                    "/monitoring/check",
                    json={"asset": "USDY", "claim": "TreasuryBacking"},
                )
                detail_response = TestClient(app).get("/monitoring/usdy")
        self.assertEqual(checked.status_code, 200)
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.json()["current_snapshot"]["verification_result"], "PASS")


if __name__ == "__main__":
    unittest.main()
