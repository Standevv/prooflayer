"""Conservative, read-only protocol decisions over existing ProofLayer tools."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from time import perf_counter, time
from typing import Any

from services.mcp_server.tools import ProofLayerTools
from services.policy_integration.models import (
    PROTOCOL_PRESETS,
    ProtocolCheckRequest,
    ProtocolDecision,
    ProtocolTraceStep,
)


EXPECTED_CLAIMS = {"USDY": "TreasuryBacking", "PAXG": "GoldBacking"}


class ProtocolIntegrationError(ValueError):
    """Raised when a protocol request is outside the supported integration scope."""


def _reason_codes(value: Any) -> list[str]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return []
    return [str(item) for item in value]


class ProtocolPolicyEvaluator:
    """Evaluate the shared protocol policy without writes or financial rules."""

    def __init__(
        self,
        tools: ProofLayerTools | Any | None = None,
        *,
        clock: Callable[[], float] = perf_counter,
        now: Callable[[], float] = time,
    ) -> None:
        self.tools = tools or ProofLayerTools()
        self._clock = clock
        self._now = now

    def check(self, request: ProtocolCheckRequest) -> ProtocolDecision:
        preset = PROTOCOL_PRESETS[request.protocol_type]
        if request.action != preset.action:
            raise ProtocolIntegrationError(
                f"action {request.action!r} does not match the {preset.label} preset"
            )
        expected_claim = EXPECTED_CLAIMS[request.asset]
        if request.claim != expected_claim:
            raise ProtocolIntegrationError(
                f"unsupported claim {request.claim!r} for {request.asset}; "
                f"supported claim is {expected_claim}"
            )

        trace: list[ProtocolTraceStep] = []
        metadata = self._tool_call(
            trace,
            "get_asset_metadata",
            {"asset": request.asset},
            lambda result: f"{result.get('asset')} / {result.get('claim')}",
            ["PROOFLAYER TOOL"],
        )
        if metadata is None:
            return self._unavailable_decision(
                request,
                trace,
                "Asset metadata service unavailable; verification was not started.",
            )

        verification = self._tool_call(
            trace,
            "verify_claim",
            {"asset": request.asset, "claim": request.claim},
            lambda result: str(result.get("verification_result", "UNAVAILABLE")),
            ["PROOFLAYER TOOL", "DETERMINISTIC RVC", "POLICY CHECK"],
        )
        if verification is None:
            return self._unavailable_decision(
                request,
                trace,
                "Deterministic verification service unavailable.",
            )

        verification_result = str(verification.get("verification_result"))
        reason_codes = _reason_codes(verification.get("reason_codes"))
        root_count_value = verification.get("evidence_root_count")
        evidence_root_count = (
            int(root_count_value) if isinstance(root_count_value, int) else None
        )
        authenticity_sources = [
            "Repository official evidence snapshot",
            "ProofLayer deterministic RVC",
        ]

        certificate_exists: bool | None = None
        certificate_usable: bool | None = None
        certificate_status = "NOT_CHECKED"
        certificate_state = "NO_CERTIFICATE_FIXTURE"
        policygate_outcome = "NOT_CHECKED"
        certificate: Mapping[str, Any] | None = None
        policygate: Mapping[str, Any] | None = None

        certificate_id = metadata.get("known_live_certificate_id")
        if isinstance(certificate_id, str) and certificate_id:
            certificate = self._tool_call(
                trace,
                "get_certificate_state",
                {"certificate_id": certificate_id},
                lambda result: self._certificate_state(result),
                ["PROOFLAYER TOOL", "LIVE ON-CHAIN", "POLICY CHECK"],
                live_read=True,
            )
            if certificate is None:
                certificate_status = "UNAVAILABLE"
                certificate_state = "LIVE_READ_UNAVAILABLE"
            else:
                certificate_exists = bool(certificate.get("exists"))
                certificate_usable = bool(certificate.get("usable"))
                certificate_status = str(
                    certificate.get("certificate_status", "NOT_REGISTERED")
                )
                certificate_state = self._certificate_state(certificate)
                authenticity_sources.append("X Layer Testnet CertificateRegistry")

                if certificate_exists:
                    policygate = self._tool_call(
                        trace,
                        "get_policygate_state",
                        {
                            "certificate_id": certificate_id,
                            "asset": request.asset,
                            "claim": request.claim,
                            "policy": str(metadata.get("policy")),
                        },
                        lambda result: str(
                            result.get("policygate_outcome", "UNAVAILABLE")
                        ),
                        ["PROOFLAYER TOOL", "LIVE ON-CHAIN", "POLICY CHECK"],
                        live_read=True,
                    )
                    if policygate is None:
                        policygate_outcome = "UNAVAILABLE"
                    else:
                        policygate_outcome = str(
                            policygate.get("policygate_outcome", "UNAVAILABLE")
                        )
                        authenticity_sources.append("X Layer Testnet PolicyGate")
                else:
                    policygate_outcome = "NOT_CHECKED"

        recommendation = self._recommend(
            verification_result=verification_result,
            certificate_exists=certificate_exists,
            certificate_usable=certificate_usable,
            certificate_state=certificate_state,
            policygate_outcome=policygate_outcome,
        )
        blocking_reasons = self._blocking_reasons(
            verification_result=verification_result,
            reason_codes=reason_codes,
            certificate_exists=certificate_exists,
            certificate_usable=certificate_usable,
            certificate_state=certificate_state,
            policygate_outcome=policygate_outcome,
        )
        explanation = self._explanation(
            request=request,
            verification_result=verification_result,
            reason_codes=reason_codes,
            certificate_exists=certificate_exists,
            certificate_state=certificate_state,
            policygate_outcome=policygate_outcome,
            recommendation=recommendation,
        )

        return ProtocolDecision(
            protocol_type=request.protocol_type,
            protocol_label=preset.label,
            asset=request.asset,
            claim=request.claim,
            intended_action=request.action,
            action_label=preset.action_label,
            verification_status="COMPLETED",
            verification_result=verification_result,
            certificate_exists=certificate_exists,
            certificate_usable=certificate_usable,
            certificate_status=certificate_status,
            certificate_state=certificate_state,
            policygate_outcome=policygate_outcome,
            final_protocol_recommendation=recommendation,
            blocking_reasons=blocking_reasons,
            evidence_root_count=evidence_root_count,
            reason_codes=reason_codes,
            authenticity_sources=authenticity_sources,
            explanation=explanation,
            trace=trace,
            policy_config=preset.policy,
        )

    def _tool_call(
        self,
        trace: list[ProtocolTraceStep],
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
                raise TypeError(f"{tool} returned an invalid result")
        except Exception:
            trace.append(
                ProtocolTraceStep(
                    step=len(trace) + 1,
                    tool=tool,
                    status="unavailable",
                    outcome=(
                        "LIVE READ UNAVAILABLE"
                        if live_read
                        else "SERVICE UNAVAILABLE"
                    ),
                    duration_ms=self._duration(started),
                    authenticity_labels=authenticity_labels,
                )
            )
            return None

        trace.append(
            ProtocolTraceStep(
                step=len(trace) + 1,
                tool=tool,
                status="completed",
                outcome=summarize(result),
                duration_ms=self._duration(started),
                authenticity_labels=authenticity_labels,
            )
        )
        return result

    def _duration(self, started: float) -> float:
        return round(max(0.0, (self._clock() - started) * 1_000), 3)

    def _certificate_state(self, certificate: Mapping[str, Any]) -> str:
        if not certificate.get("exists"):
            return "NO_CERTIFICATE"
        if certificate.get("revoked"):
            return "REVOKED"
        valid_until = certificate.get("valid_until")
        if isinstance(valid_until, (int, float)) and valid_until <= self._now():
            return "EXPIRED"
        if certificate.get("usable"):
            return "USABLE"
        return "REGISTERED_UNUSABLE"

    @staticmethod
    def _recommend(
        *,
        verification_result: str,
        certificate_exists: bool | None,
        certificate_usable: bool | None,
        certificate_state: str,
        policygate_outcome: str,
    ) -> str:
        if verification_result == "FAIL" or certificate_state == "REVOKED":
            return "REJECT"
        if verification_result == "INDETERMINATE":
            return "REVIEW_REQUIRED"
        if verification_result != "PASS":
            return "REVIEW_REQUIRED"
        if certificate_state in {
            "LIVE_READ_UNAVAILABLE",
            "NO_CERTIFICATE_FIXTURE",
            "NOT_CHECKED",
        } or policygate_outcome == "UNAVAILABLE":
            return "REVIEW_REQUIRED"
        if (
            not certificate_exists
            or not certificate_usable
            or policygate_outcome != "ALLOWED"
        ):
            return "REJECT"
        return "ACCEPT"

    @staticmethod
    def _blocking_reasons(
        *,
        verification_result: str,
        reason_codes: list[str],
        certificate_exists: bool | None,
        certificate_usable: bool | None,
        certificate_state: str,
        policygate_outcome: str,
    ) -> list[str]:
        reasons: list[str] = []
        if verification_result != "PASS":
            reasons.append(f"Verification result is {verification_result}.")
        reasons.extend(f"RVC reason: {code}." for code in reason_codes)
        if certificate_state == "NO_CERTIFICATE_FIXTURE":
            reasons.append("No exported certificate fixture is available for a live read.")
        elif certificate_state == "LIVE_READ_UNAVAILABLE":
            reasons.append("Certificate live read is unavailable.")
        elif certificate_exists is False:
            reasons.append("Certificate is not registered.")
        elif certificate_state == "EXPIRED":
            reasons.append("Certificate is expired and unusable.")
        elif certificate_state == "REVOKED":
            reasons.append("Certificate is revoked and unusable.")
        elif certificate_usable is False:
            reasons.append("Certificate is currently unusable.")
        if policygate_outcome == "BLOCKED":
            reasons.append("PolicyGate blocks the intended action.")
        elif policygate_outcome == "UNAVAILABLE":
            reasons.append("PolicyGate live read is unavailable.")
        elif policygate_outcome == "NOT_CHECKED":
            reasons.append("PolicyGate was not checked.")
        return reasons

    @staticmethod
    def _explanation(
        *,
        request: ProtocolCheckRequest,
        verification_result: str,
        reason_codes: list[str],
        certificate_exists: bool | None,
        certificate_state: str,
        policygate_outcome: str,
        recommendation: str,
    ) -> list[str]:
        explanation = [
            f"{request.claim} verification returned {verification_result}."
        ]
        if reason_codes:
            explanation.append(
                "ProofLayer returned reason codes: " + ", ".join(reason_codes) + "."
            )
        if certificate_state == "NO_CERTIFICATE_FIXTURE":
            explanation.append(
                "No exported certificate fixture is mapped for this asset; no on-chain "
                "certificate state was inferred."
            )
        elif certificate_exists is False:
            explanation.append("The mapped certificate is not registered.")
        elif certificate_exists is True:
            explanation.append(
                f"A mapped certificate exists and its current state is {certificate_state}."
            )
        elif certificate_state == "LIVE_READ_UNAVAILABLE":
            explanation.append("The mapped certificate could not be read from X Layer.")
        if policygate_outcome == "NOT_CHECKED":
            explanation.append("PolicyGate was not checked without usable certificate state.")
        elif policygate_outcome == "UNAVAILABLE":
            explanation.append("PolicyGate state could not be read from X Layer.")
        else:
            explanation.append(f"PolicyGate returned {policygate_outcome}.")
        explanation.append(
            f"The shared conservative protocol policy returns {recommendation.replace('_', ' ')}."
        )
        return explanation

    def _unavailable_decision(
        self,
        request: ProtocolCheckRequest,
        trace: list[ProtocolTraceStep],
        reason: str,
    ) -> ProtocolDecision:
        preset = PROTOCOL_PRESETS[request.protocol_type]
        return ProtocolDecision(
            protocol_type=request.protocol_type,
            protocol_label=preset.label,
            asset=request.asset,
            claim=request.claim,
            intended_action=request.action,
            action_label=preset.action_label,
            verification_status="UNAVAILABLE",
            certificate_status="NOT_CHECKED",
            certificate_state="NOT_CHECKED",
            policygate_outcome="NOT_CHECKED",
            final_protocol_recommendation="REVIEW_REQUIRED",
            blocking_reasons=[reason, "PolicyGate was not checked."],
            authenticity_sources=[],
            explanation=[
                reason,
                "Certificate and PolicyGate state were not inferred.",
                "The shared conservative protocol policy returns REVIEW REQUIRED.",
            ],
            trace=trace,
            policy_config=preset.policy,
        )


__all__ = ["ProtocolIntegrationError", "ProtocolPolicyEvaluator"]
