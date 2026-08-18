"""Read-only market eligibility evaluator using existing ProofLayer tools."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from time import perf_counter, time

from services.mcp_server.tools import ProofLayerTools
from services.verified_markets.models import (
    MarketEligibilityRequest,
    MarketEligibilityResult,
    MarketTraceStep,
)

EXPECTED_CLAIMS = {"USDY": "TreasuryBacking", "PAXG": "GoldBacking"}


class MarketEligibilityError(ValueError):
    """Raised when a market request is outside the supported scope."""


def _reason_codes(value: object) -> list[str]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return []
    return [str(item) for item in value]


class MarketEligibilityEvaluator:
    """Evaluate whether an asset is market-eligible using read-only ProofLayer state."""

    def __init__(
        self,
        tools: ProofLayerTools | None = None,
        *,
        clock: Callable[[], float] = perf_counter,
        now: Callable[[], float] = time,
    ) -> None:
        self.tools = tools or ProofLayerTools()
        self._clock = clock
        self._now = now

    def check(self, request: MarketEligibilityRequest) -> MarketEligibilityResult:
        expected_claim = EXPECTED_CLAIMS.get(request.asset)
        if expected_claim is None:
            raise MarketEligibilityError(f"unsupported asset {request.asset!r}")

        trace: list[MarketTraceStep] = []
        metadata = self._tool_call(
            trace,
            "get_asset_metadata",
            {"asset": request.asset},
            lambda result: f"{result.get('asset')} / {result.get('claim')}",
            ["PROOFLAYER TOOL"],
        )
        if metadata is None:
            return self._unavailable(request, trace, "Asset metadata service unavailable.")

        verification = self._tool_call(
            trace,
            "verify_claim",
            {"asset": request.asset, "claim": expected_claim},
            lambda result: str(result.get("verification_result", "UNAVAILABLE")),
            ["PROOFLAYER TOOL", "DETERMINISTIC RVC", "POLICY CHECK"],
        )
        if verification is None:
            return self._unavailable(request, trace, "Verification service unavailable.")

        verification_result = str(verification.get("verification_result"))
        reason_codes = _reason_codes(verification.get("reason_codes"))
        root_count_value = verification.get("evidence_root_count")
        evidence_root_count = (
            int(root_count_value) if isinstance(root_count_value, int) else None
        )

        certificate_exists: bool | None = None
        certificate_usable: bool | None = None
        certificate_status = "NOT_CHECKED"
        certificate_state = "NO_CERTIFICATE_FIXTURE"
        policygate_outcome = "NOT_CHECKED"

        certificate_id = metadata.get("known_live_certificate_id")
        if isinstance(certificate_id, str) and certificate_id:
            certificate = self._tool_call(
                trace,
                "get_certificate_state",
                {"certificate_id": certificate_id},
                lambda result: f"exists={result.get('exists')} usable={result.get('usable')}",
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

                if certificate_exists:
                    policygate = self._tool_call(
                        trace,
                        "get_policygate_state",
                        {
                            "certificate_id": certificate_id,
                            "asset": request.asset,
                            "claim": expected_claim,
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

        authenticity_sources = [
            "Repository official evidence snapshot",
            "ProofLayer deterministic RVC",
        ]
        if certificate_exists is not None:
            authenticity_sources.append("X Layer Testnet CertificateRegistry")
        if policygate_outcome not in ("NOT_CHECKED", "UNAVAILABLE"):
            authenticity_sources.append("X Layer Testnet PolicyGate")

        return MarketEligibilityResult(
            asset=request.asset,
            action=request.action,
            verification_status="COMPLETED",
            verification_result=verification_result,
            certificate_exists=certificate_exists,
            certificate_usable=certificate_usable,
            certificate_status=certificate_status,
            certificate_state=certificate_state,
            policygate_outcome=policygate_outcome,
            recommendation=recommendation,
            blocking_reasons=blocking_reasons,
            reason_codes=reason_codes,
            authenticity_sources=authenticity_sources,
            explanation=explanation,
            trace=trace,
        )

    def _tool_call(
        self,
        trace: list[MarketTraceStep],
        tool: str,
        arguments: Mapping[str, str],
        summarize: Callable[[Mapping[str, object]], str],
        authenticity_labels: list[str],
        *,
        live_read: bool = False,
    ) -> Mapping[str, object] | None:
        started = self._clock()
        try:
            result = getattr(self.tools, tool)(**arguments)
            if not isinstance(result, Mapping):
                raise TypeError(f"{tool} returned an invalid result")
        except Exception:
            trace.append(
                MarketTraceStep(
                    step=len(trace) + 1,
                    tool=tool,
                    status="unavailable",
                    outcome="LIVE READ UNAVAILABLE" if live_read else "SERVICE UNAVAILABLE",
                    duration_ms=self._duration(started),
                    authenticity_labels=authenticity_labels,  # type: ignore[arg-type]
                )
            )
            return None

        trace.append(
            MarketTraceStep(
                step=len(trace) + 1,
                tool=tool,
                status="completed",
                outcome=summarize(result),
                duration_ms=self._duration(started),
                authenticity_labels=authenticity_labels,  # type: ignore[arg-type]
            )
        )
        return result

    def _duration(self, started: float) -> float:
        return round(max(0.0, (self._clock() - started) * 1_000), 3)

    def _certificate_state(self, certificate: Mapping[str, object]) -> str:
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
            return "BLOCKED"
        if verification_result == "INDETERMINATE":
            return "BLOCKED"
        if verification_result != "PASS":
            return "BLOCKED"
        if certificate_state in {
            "LIVE_READ_UNAVAILABLE",
            "NO_CERTIFICATE_FIXTURE",
            "NOT_CHECKED",
        } or policygate_outcome == "UNAVAILABLE":
            return "UNAVAILABLE"
        if (
            not certificate_exists
            or not certificate_usable
            or policygate_outcome != "ALLOWED"
        ):
            return "BLOCKED"
        return "ACCESSIBLE"

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
            reasons.append("No exported certificate fixture is available.")
        elif certificate_state == "LIVE_READ_UNAVAILABLE":
            reasons.append("Certificate live read is unavailable.")
        elif certificate_exists is False:
            reasons.append("Certificate is not registered.")
        elif certificate_state == "EXPIRED":
            reasons.append("Certificate is expired.")
        elif certificate_state == "REVOKED":
            reasons.append("Certificate is revoked.")
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
        request: MarketEligibilityRequest,
        verification_result: str,
        reason_codes: list[str],
        certificate_exists: bool | None,
        certificate_state: str,
        policygate_outcome: str,
        recommendation: str,
    ) -> list[str]:
        claim = EXPECTED_CLAIMS[request.asset]
        explanation = [f"{claim} verification returned {verification_result}."]
        if reason_codes:
            explanation.append(
                "ProofLayer returned reason codes: " + ", ".join(reason_codes) + "."
            )
        if certificate_state == "NO_CERTIFICATE_FIXTURE":
            explanation.append(
                "No exported certificate fixture is mapped; no on-chain state was inferred."
            )
        elif certificate_exists is False:
            explanation.append("The mapped certificate is not registered on-chain.")
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
        label = recommendation.replace("_", " ").lower()
        explanation.append(
            f"The market eligibility check returns {label} for {request.asset} {request.action}."
        )
        return explanation

    def _unavailable(
        self,
        request: MarketEligibilityRequest,
        trace: list[MarketTraceStep],
        reason: str,
    ) -> MarketEligibilityResult:
        return MarketEligibilityResult(
            asset=request.asset,
            action=request.action,
            verification_status="UNAVAILABLE",
            certificate_status="NOT_CHECKED",
            certificate_state="NOT_CHECKED",
            policygate_outcome="NOT_CHECKED",
            recommendation="UNAVAILABLE",
            blocking_reasons=[reason, "PolicyGate was not checked."],
            explanation=[reason, "The market eligibility check returns unavailable."],
            trace=trace,
        )


__all__ = ["MarketEligibilityError", "MarketEligibilityEvaluator"]
