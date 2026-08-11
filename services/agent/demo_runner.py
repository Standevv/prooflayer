"""Deterministic, read-only ProofLayer demo workflows."""

from __future__ import annotations

import json
import re
from pathlib import Path
from time import perf_counter
from typing import Any, Callable, Mapping, Sequence

from services.agent.demo_models import (
    DemoRunnerRequest,
    DemoRunnerResponse,
    DemoTraceArguments,
    DemoTraceStep,
)
from services.mcp_server.tools import ProofLayerToolError, ProofLayerTools


PROJECT_ROOT = Path(__file__).resolve().parents[2]
USDY_CERTIFICATE_FIXTURE = PROJECT_ROOT / "data" / "demo" / "usdy-pass-certificate.json"
BYTES32_PATTERN = re.compile(r"^0x[0-9a-fA-F]{64}$")


class DemoRunnerError(ValueError):
    """Raised when a deterministic workflow request cannot be completed."""


def _load_usdy_certificate_id() -> str | None:
    """Resolve the existing exported demo mapping without making a tool call."""

    try:
        payload = json.loads(USDY_CERTIFICATE_FIXTURE.read_text(encoding="utf-8"))
        certificate_id = payload["solidity"]["certificateId"]
    except (OSError, KeyError, TypeError, json.JSONDecodeError):
        return None
    if not isinstance(certificate_id, str) or not BYTES32_PATTERN.fullmatch(
        certificate_id
    ):
        return None
    return certificate_id.lower()


def _reason_list(value: Any) -> list[str]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return []
    return [str(item) for item in value]


def _render_reasons(reason_codes: Sequence[str]) -> str:
    return ", ".join(reason_codes) if reason_codes else "no reason codes"


class DeterministicDemoRunner:
    """Execute a fixed ProofLayer workflow using the existing read-only tools."""

    def __init__(
        self,
        tools: ProofLayerTools | Any | None = None,
        *,
        usdy_certificate_id: str | None = None,
        clock: Callable[[], float] = perf_counter,
    ) -> None:
        self.tools = tools or ProofLayerTools()
        self.usdy_certificate_id = usdy_certificate_id or _load_usdy_certificate_id()
        self._clock = clock

    def run(self, request: DemoRunnerRequest) -> DemoRunnerResponse:
        if request.scenario == "usdy_treasury_verification":
            return self._run_verification(
                request.scenario,
                asset="USDY",
                claim="TreasuryBacking",
                inspect_certificate=True,
            )
        if request.scenario == "paxg_gold_verification":
            return self._run_verification(
                request.scenario,
                asset="PAXG",
                claim="GoldBacking",
                inspect_certificate=False,
            )
        if request.scenario == "usdy_certificate_eligibility":
            return self._run_usdy_eligibility(request.scenario)
        if request.scenario == "provenance_inspection":
            return self._run_provenance(
                request.scenario,
                asset=str(request.asset),
                claim=str(request.claim),
            )
        raise DemoRunnerError(f"unsupported scenario {request.scenario!r}")

    def _call(
        self,
        trace: list[DemoTraceStep],
        tool: str,
        arguments: Mapping[str, str],
        summarize: Callable[[Mapping[str, Any]], str],
        authenticity_labels: list[str],
        *,
        live_read: bool = False,
    ) -> Mapping[str, Any] | None:
        started = self._clock()
        try:
            result = getattr(self.tools, tool)(**arguments)
            if not isinstance(result, Mapping):
                raise DemoRunnerError(f"{tool} returned an invalid result")
        except Exception as error:
            duration_ms = round(max(0.0, (self._clock() - started) * 1_000), 3)
            if not live_read:
                if isinstance(error, DemoRunnerError):
                    raise
                if isinstance(error, ProofLayerToolError):
                    raise DemoRunnerError(str(error)) from error
                raise DemoRunnerError(f"{tool} could not complete") from error
            trace.append(
                DemoTraceStep(
                    step=len(trace) + 1,
                    tool=tool,
                    arguments=DemoTraceArguments(**arguments),
                    status="unavailable",
                    result_summary="Live X Layer read unavailable.",
                    duration_ms=duration_ms,
                    authenticity_labels=authenticity_labels,
                )
            )
            return None

        trace.append(
            DemoTraceStep(
                step=len(trace) + 1,
                tool=tool,
                arguments=DemoTraceArguments(**arguments),
                status="completed",
                result_summary=summarize(result),
                duration_ms=round(max(0.0, (self._clock() - started) * 1_000), 3),
                authenticity_labels=authenticity_labels,
            )
        )
        return result

    def _run_verification(
        self,
        scenario: str,
        *,
        asset: str,
        claim: str,
        inspect_certificate: bool,
    ) -> DemoRunnerResponse:
        trace: list[DemoTraceStep] = []
        fixture_labels = ["REAL TOOL CALL", "DEMO FIXTURE"]
        metadata = self._call(
            trace,
            "get_asset_metadata",
            {"asset": asset},
            lambda result: (
                f"Loaded {result.get('asset')} metadata for {result.get('claim')}."
            ),
            fixture_labels,
        )
        evidence = self._call(
            trace,
            "get_evidence",
            {"asset": asset, "claim": claim},
            lambda result: f"Loaded {int(result.get('evidence_count', 0))} normalized evidence records.",
            fixture_labels,
        )
        provenance = self._call(
            trace,
            "analyze_provenance",
            {"asset": asset, "claim": claim},
            lambda result: (
                f"Found {int(result.get('independent_root_count', 0))} independent evidence roots."
            ),
            fixture_labels,
        )
        verification = self._call(
            trace,
            "verify_claim",
            {"asset": asset, "claim": claim},
            lambda result: (
                f"Deterministic RVC result: {result.get('verification_result')} "
                f"({_render_reasons(_reason_list(result.get('reason_codes')))})."
            ),
            ["REAL TOOL CALL", "DETERMINISTIC RVC", "DEMO FIXTURE"],
        )
        if metadata is None or evidence is None or provenance is None or verification is None:
            raise DemoRunnerError("deterministic workflow returned no result")

        result = str(verification.get("verification_result"))
        reason_codes = _reason_list(verification.get("reason_codes"))
        root_count = int(provenance.get("independent_root_count", 0))
        certificate_status: str | None = None
        policygate_outcome: str | None = None

        certificate_id = verification.get("known_live_certificate_id")
        if inspect_certificate and isinstance(certificate_id, str) and certificate_id:
            certificate, policy, _history = self._run_live_reads(
                trace,
                certificate_id=certificate_id,
                asset=asset,
                claim=claim,
                policy=str(metadata.get("policy")),
            )
            certificate_status = (
                str(certificate.get("certificate_status"))
                if certificate is not None
                else "UNAVAILABLE"
            )
            policygate_outcome = (
                str(policy.get("policygate_outcome"))
                if policy is not None
                else ("NOT_CHECKED" if certificate is None else "UNAVAILABLE")
            )

        if asset == "PAXG":
            summary = (
                f"{asset} {claim} is {result} under the deterministic RVC because "
                f"{_render_reasons(reason_codes)}. {root_count} independent evidence "
                "roots were found. No exported certificate fixture exists, so no X Layer "
                "certificate or PolicyGate read was attempted."
            )
        elif certificate_status == "UNAVAILABLE":
            summary = (
                f"{asset} {claim} is {result} under the deterministic RVC because "
                f"{_render_reasons(reason_codes)}. {root_count} independent evidence "
                "roots were found. Live X Layer certificate state is unavailable, so "
                "PolicyGate was not checked."
            )
        else:
            summary = (
                f"{asset} {claim} is {result} under the deterministic RVC because "
                f"{_render_reasons(reason_codes)}. {root_count} independent evidence "
                f"roots were found. The exported historical demo certificate is "
                f"{certificate_status} on X Layer Testnet, and PolicyGate is "
                f"{policygate_outcome}."
            )

        return DemoRunnerResponse(
            scenario=scenario,
            asset=asset,
            claim=claim,
            verification_result=result,
            certificate_status=certificate_status,
            policygate_outcome=policygate_outcome,
            reason_codes=reason_codes,
            evidence_root_count=root_count,
            trace=trace,
            summary=summary,
        )

    def _run_usdy_eligibility(self, scenario: str) -> DemoRunnerResponse:
        if self.usdy_certificate_id is None:
            raise DemoRunnerError("exported USDY certificate fixture is unavailable")
        trace: list[DemoTraceStep] = []
        certificate, policy, _history = self._run_live_reads(
            trace,
            certificate_id=self.usdy_certificate_id,
            asset="USDY",
            claim="TreasuryBacking",
            policy="default-treasury-policy",
        )
        certificate_status = (
            str(certificate.get("certificate_status"))
            if certificate is not None
            else "UNAVAILABLE"
        )
        policygate_outcome = (
            str(policy.get("policygate_outcome"))
            if policy is not None
            else ("NOT_CHECKED" if certificate is None else "UNAVAILABLE")
        )
        if certificate is None:
            summary = (
                "The exported historical USDY demo certificate could not be read from "
                "X Layer Testnet, so PolicyGate was not checked."
            )
        else:
            summary = (
                "The exported historical USDY demo certificate is "
                f"{certificate_status} on X Layer Testnet, and PolicyGate is "
                f"{policygate_outcome}. Current certificate usability is separate from "
                "a fresh RVC evaluation."
            )
        return DemoRunnerResponse(
            scenario=scenario,
            asset="USDY",
            claim="TreasuryBacking",
            certificate_status=certificate_status,
            policygate_outcome=policygate_outcome,
            trace=trace,
            summary=summary,
        )

    def _run_provenance(
        self,
        scenario: str,
        *,
        asset: str,
        claim: str,
    ) -> DemoRunnerResponse:
        trace: list[DemoTraceStep] = []
        evidence = self._call(
            trace,
            "get_evidence",
            {"asset": asset, "claim": claim},
            lambda result: f"Loaded {int(result.get('evidence_count', 0))} normalized evidence records.",
            ["REAL TOOL CALL", "DEMO FIXTURE"],
        )
        provenance = self._call(
            trace,
            "analyze_provenance",
            {"asset": asset, "claim": claim},
            lambda result: (
                f"Found {int(result.get('independent_root_count', 0))} independent evidence roots."
            ),
            ["REAL TOOL CALL", "DEMO FIXTURE"],
        )
        if evidence is None or provenance is None:
            raise DemoRunnerError("provenance workflow returned no result")
        resolved_asset = str(evidence.get("asset"))
        resolved_claim = str(evidence.get("claim"))
        evidence_count = int(evidence.get("evidence_count", 0))
        root_count = int(provenance.get("independent_root_count", 0))
        return DemoRunnerResponse(
            scenario=scenario,
            asset=resolved_asset,
            claim=resolved_claim,
            evidence_root_count=root_count,
            trace=trace,
            summary=(
                f"{resolved_asset} {resolved_claim} has {evidence_count} normalized "
                f"evidence records and {root_count} independent provenance roots. No "
                "certificate or PolicyGate read was requested."
            ),
        )

    def _run_live_reads(
        self,
        trace: list[DemoTraceStep],
        *,
        certificate_id: str,
        asset: str,
        claim: str,
        policy: str,
    ) -> tuple[
        Mapping[str, Any] | None,
        Mapping[str, Any] | None,
        Mapping[str, Any] | None,
    ]:
        live_labels = ["REAL TOOL CALL", "LIVE ON-CHAIN", "DEMO FIXTURE"]
        certificate = self._call(
            trace,
            "get_certificate_state",
            {"certificate_id": certificate_id},
            lambda result: (
                "Historical demo certificate state: "
                f"{result.get('certificate_status')}."
            ),
            live_labels,
            live_read=True,
        )
        if certificate is None:
            return None, None, None
        policy_state = self._call(
            trace,
            "get_policygate_state",
            {
                "certificate_id": certificate_id,
                "asset": asset,
                "claim": claim,
                "policy": policy,
            },
            lambda result: (
                f"Read-only PolicyGate outcome: {result.get('policygate_outcome')}."
            ),
            live_labels,
            live_read=True,
        )
        history = self._call(
            trace,
            "get_decision_history",
            {"certificate_id": certificate_id},
            lambda result: (
                f"Found {int(result.get('matching_decision_count', 0))} matching successful decisions."
            ),
            live_labels,
            live_read=True,
        )
        return certificate, policy_state, history


__all__ = ["DemoRunnerError", "DeterministicDemoRunner"]
