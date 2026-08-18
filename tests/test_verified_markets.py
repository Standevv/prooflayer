"""Tests for the verified markets eligibility evaluator."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any
from unittest.mock import MagicMock

import pytest

from services.verified_markets.eligibility import (
    MarketEligibilityError,
    MarketEligibilityEvaluator,
)
from services.verified_markets.models import (
    MarketEligibilityRequest,
    MarketEligibilityResult,
)


def _make_metadata(
    *,
    asset: str = "USDY",
    claim: str = "TreasuryBacking",
    certificate_id: str = "0x" + "aa" * 32,
    policy: str = "prooflayer:policy:treasury-backing:v1",
) -> dict[str, Any]:
    return {
        "asset": asset,
        "claim": claim,
        "known_live_certificate_id": certificate_id,
        "policy": policy,
    }


def _make_verification(
    *,
    result: str = "PASS",
    reason_codes: list[str] | None = None,
    root_count: int = 2,
) -> dict[str, Any]:
    return {
        "verification_result": result,
        "reason_codes": reason_codes or [],
        "evidence_root_count": root_count,
    }


def _make_certificate(
    *,
    exists: bool = True,
    usable: bool = True,
    revoked: bool = False,
    valid_until: float = 9_999_999_999.0,
) -> dict[str, Any]:
    return {
        "exists": exists,
        "usable": usable,
        "revoked": revoked,
        "valid_until": valid_until,
        "certificate_status": "REGISTERED_USABLE" if usable else "REGISTERED_UNUSABLE",
    }


def _make_policygate(*, outcome: str = "ALLOWED") -> dict[str, Any]:
    return {"policygate_outcome": outcome}


class FakeTools:
    def __init__(self, **overrides: Any) -> None:
        self._calls: list[tuple[str, dict[str, str]]] = []
        self._overrides = overrides

    def get_asset_metadata(self, **kwargs: str) -> dict[str, Any]:
        self._calls.append(("get_asset_metadata", kwargs))
        key = "get_asset_metadata"
        if key in self._overrides:
            result = self._overrides[key]
            if isinstance(result, Exception):
                raise result
            return result
        return _make_metadata(**{k: v for k, v in kwargs.items() if k in ("asset", "claim")})

    def verify_claim(self, **kwargs: str) -> dict[str, Any]:
        self._calls.append(("verify_claim", kwargs))
        key = "verify_claim"
        if key in self._overrides:
            result = self._overrides[key]
            if isinstance(result, Exception):
                raise result
            return result
        return _make_verification()

    def get_certificate_state(self, **kwargs: str) -> dict[str, Any]:
        self._calls.append(("get_certificate_state", kwargs))
        key = "get_certificate_state"
        if key in self._overrides:
            result = self._overrides[key]
            if isinstance(result, Exception):
                raise result
            return result
        return _make_certificate()

    def get_policygate_state(self, **kwargs: str) -> dict[str, Any]:
        self._calls.append(("get_policygate_state", kwargs))
        key = "get_policygate_state"
        if key in self._overrides:
            result = self._overrides[key]
            if isinstance(result, Exception):
                raise result
            return result
        return _make_policygate()


def _evaluate(**overrides: Any) -> MarketEligibilityResult:
    tools = FakeTools(**overrides)  # type: ignore[arg-type]
    evaluator = MarketEligibilityEvaluator(tools=tools, now=lambda: 1_000_000.0)
    return evaluator.check(MarketEligibilityRequest(asset="USDY", action="swap"))


class TestMarketEligibility:
    def test_accessible_when_all_pass(self) -> None:
        result = _evaluate()
        assert result.recommendation == "ACCESSIBLE"
        assert result.verification_result == "PASS"
        assert result.certificate_usable is True
        assert result.policygate_outcome == "ALLOWED"

    def test_blocked_when_verification_fail(self) -> None:
        result = _evaluate(verify_claim=_make_verification(result="FAIL"))
        assert result.recommendation == "BLOCKED"
        assert result.verification_result == "FAIL"
        assert any("FAIL" in r for r in result.blocking_reasons)

    def test_blocked_when_certificate_revoked(self) -> None:
        result = _evaluate(
            get_certificate_state=_make_certificate(revoked=True, usable=False)
        )
        assert result.recommendation == "BLOCKED"
        assert result.certificate_state == "REVOKED"

    def test_blocked_when_certificate_expired(self) -> None:
        result = _evaluate(
            get_certificate_state=_make_certificate(
                usable=False, valid_until=1.0
            )
        )
        assert result.recommendation == "BLOCKED"
        assert result.certificate_state == "EXPIRED"

    def test_blocked_when_policygate_blocked(self) -> None:
        result = _evaluate(get_policygate_state=_make_policygate(outcome="BLOCKED"))
        assert result.recommendation == "BLOCKED"
        assert result.policygate_outcome == "BLOCKED"

    def test_unavailable_when_metadata_fails(self) -> None:
        result = _evaluate(get_asset_metadata=RuntimeError("service down"))
        assert result.recommendation == "UNAVAILABLE"
        assert result.verification_status == "UNAVAILABLE"

    def test_unavailable_when_certificate_read_fails(self) -> None:
        result = _evaluate(get_certificate_state=RuntimeError("rpc down"))
        assert result.recommendation == "UNAVAILABLE"
        assert result.certificate_state == "LIVE_READ_UNAVAILABLE"

    def test_trace_recorded(self) -> None:
        result = _evaluate()
        assert len(result.trace) >= 2
        assert result.trace[0].tool == "get_asset_metadata"
        assert result.trace[1].tool == "verify_claim"
        for step in result.trace:
            assert step.duration_ms >= 0

    def test_authenticity_sources_populated(self) -> None:
        result = _evaluate()
        assert "Repository official evidence snapshot" in result.authenticity_sources
        assert "ProofLayer deterministic RVC" in result.authenticity_sources

    def test_chain_id_is_1952(self) -> None:
        result = _evaluate()
        assert result.chain_id == 1952

    def test_no_blockchain_write(self) -> None:
        result = _evaluate()
        assert result.blockchain_write_performed is False

    def test_unsupported_asset_rejected_by_pydantic(self) -> None:
        with pytest.raises(Exception):
            MarketEligibilityRequest(asset="BTC", action="swap")  # type: ignore[arg-type]

    def test_withdraw_action_works(self) -> None:
        tools = FakeTools()
        evaluator = MarketEligibilityEvaluator(tools=tools, now=lambda: 1_000_000.0)
        result = evaluator.check(MarketEligibilityRequest(asset="USDY", action="withdraw"))
        assert result.action == "withdraw"
        assert result.recommendation == "ACCESSIBLE"
