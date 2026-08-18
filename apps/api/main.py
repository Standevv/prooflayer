"""FastAPI boundary for ProofLayer read-only orchestration modes."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict

logger = logging.getLogger(__name__)

from services.api_hardening import ApiConcurrencyLimiter, ApiRateLimiter, RequestSizeGuard
from services.blockchain.issuer import (
    check_issuance_readiness,
    issue_certificate,
)
from services.blockchain.issuance_control import (
    IdempotencyConflictError,
    IdempotencyInProgressError,
    IdempotencyKeyError,
    OperatorAuthenticationError,
    OperatorConfigurationError,
    append_issuance_audit,
    authenticate_operator,
    idempotency_key_hash,
    issuance_coordinator,
    issuance_enabled,
    request_fingerprint,
    validate_idempotency_key,
)
from services.mcp_server.tools import XLAYER_CHAIN_ID
from services.rvc.models import (
    PredicateResult,
    VerificationCertificate,
    VerificationResult,
)

from services.certificate_explorer.lookup import (
    CertificateLookupError,
    CertificateLookupService,
)
from services.certificate_explorer.models import CertificateExplorerRecord
from services.evidence.ondo import DEFAULT_ETHEREUM_MAINNET_RPC_URL
from services.evidence.usdy_attestation import DEFAULT_USDY_ATTESTATION_SNAPSHOT
from services.evidence_explorer.lookup import (
    EvidenceExplorerError,
    EvidenceExplorerService,
)
from services.evidence_explorer.models import EvidenceAssetDetail, EvidenceExplorerIndex
from services.mcp_server.tools import ProofLayerTools
from services.developer_platform.models import DeveloperPlatformStatus
from services.developer_platform.status import DeveloperStatusService
from services.continuous_verification.engine import (
    ContinuousVerificationEngine,
    MonitoringError,
)
from services.continuous_verification.models import (
    MonitoringAssetDetail,
    MonitoringCheckRequest,
    MonitoringCheckResult,
    MonitoringOverview,
)
from services.continuous_verification.store import MonitoringStoreError
from services.agent.models import AgentRequest, AgentResponse
from services.agent.demo_models import DemoRunnerRequest, DemoRunnerResponse
from services.agent.demo_runner import DemoRunnerError, DeterministicDemoRunner
from services.agent.verification_agent import (
    AgentExecutionError,
    AgentUnavailableError,
    configured_model,
    configured_provider_name,
    is_agent_configured,
    probe_agent_connectivity,
    run_verification_agent,
)
from services.policy_integration.evaluator import (
    ProtocolIntegrationError,
    ProtocolPolicyEvaluator,
)
from services.policy_integration.models import ProtocolCheckRequest, ProtocolDecision
from services.policy_studio.evaluator import (
    InstitutionalPolicyEvaluator,
    PolicyEvaluationError,
    PolicyStudioService,
)
from services.policy_studio.models import (
    InstitutionalPolicy,
    InstitutionalPolicyDraft,
    PolicyDetail,
    PolicyEvaluation,
    PolicyEvaluationRequest,
    PolicyStudioOverview,
)
from services.policy_studio.store import PolicyStoreError
from services.policy_studio.validator import PolicyValidationError
from services.verified_markets.eligibility import (
    MarketEligibilityError,
    MarketEligibilityEvaluator,
)
from services.verified_markets.models import MarketEligibilityRequest, MarketEligibilityResult


class IssuanceRequest(BaseModel):
    """Request body for certificate issuance.

    The operator selects only the asset, claim, and policy.
    Every on-chain truth field (certificate ID, asset/claim/policy
    identifiers, evidence root, independent root count, result) is derived
    server-side from the authoritative RVC evidence composition. Client
    claims about PASS, validity, evidence roots, or root counts are never
    trusted. Unknown fields are rejected so a caller cannot imply authority
    over certificate truth fields.
    """

    model_config = ConfigDict(extra="forbid")

    asset: str
    claim: str
    policy_id: str


class IssuanceResponse(BaseModel):
    """Response body for certificate issuance."""

    success: bool
    certificate_id: str | None
    transaction_hash: str | None
    block_number: int | None
    read_back: dict[str, bool] | None
    error: str | None
    error_code: str | None
    network: str
    chain_id: int
    request_id: str
    operator_id: str
    idempotent_replay: bool
    authoritative_observed_at: str | None = None
    authoritative_valid_until: str | None = None
    audit_status: str


class IssuanceReadinessView(BaseModel):
    """Read-only readiness report for the X Layer Testnet signing path."""

    ready: bool
    static_ready: bool
    chain_matches: bool
    registry_has_code: bool
    signer_key_present: bool
    rpc_reachable: bool
    note: str
    enabled: bool
    operator_auth_configured: bool
    control_scope: str


class HealthResponse(BaseModel):
    """Fast health check — no live provider probe."""

    status: str
    backend_status: str
    agent_configured: bool
    ai_provider: str
    model: str
    write_capabilities: bool
    issuance_readiness: IssuanceReadinessView


class ProviderHealthResponse(BaseModel):
    """Live provider probe — expensive, called separately."""

    provider_status: str
    provider_error: str | None
    model: str
    ai_provider: str


app = FastAPI(
    title="ProofLayer AI Verification Agent",
    version="0.1.0",
    description=(
        "Read-only AI investigation over deterministic ProofLayer tools. "
        "Authenticated X Layer Testnet operator issuance is a separate, "
        "disabled-by-default development capability."
    ),
)

request_size_guard = RequestSizeGuard(max_request_bytes=1_048_576)
api_rate_limiter = ApiRateLimiter(max_requests=60, window_seconds=60.0)
api_concurrency_limiter = ApiConcurrencyLimiter(max_active_requests=4)

shared_tools = ProofLayerTools(
    ethereum_rpc_url=os.getenv("ETHEREUM_MAINNET_RPC_URL")
    or DEFAULT_ETHEREUM_MAINNET_RPC_URL,
    usdy_attestation_path=DEFAULT_USDY_ATTESTATION_SNAPSHOT,
)
demo_runner = DeterministicDemoRunner(shared_tools)
protocol_evaluator = ProtocolPolicyEvaluator()
certificate_explorer = CertificateLookupService(tools=shared_tools)
evidence_explorer = EvidenceExplorerService(
    tools=shared_tools,
    certificate_lookup=certificate_explorer,
)
developer_status = DeveloperStatusService(tools=shared_tools)
continuous_verification = ContinuousVerificationEngine(tools=shared_tools)
policy_studio = PolicyStudioService(
    evaluator=InstitutionalPolicyEvaluator(continuous_verification)
)
market_eligibility = MarketEligibilityEvaluator(tools=shared_tools)


@app.middleware("http")
async def prooflayer_api_hardening_middleware(request: Request, call_next):
    """Minimal public-proof MVP hardening at the FastAPI boundary."""
    if request.method in {"POST", "PUT", "PATCH"}:
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                payload_size = int(content_length)
            except ValueError:
                return JSONResponse(
                    status_code=400,
                    content={"available": False, "error": "Malformed content-length header."},
                )
            if not request_size_guard.allow(payload_size):
                return JSONResponse(
                    status_code=413,
                    content={"available": False, "error": "Request body exceeds the configured API limit."},
                )

        client_key = request.client.host if request.client else "unknown"
        if not api_rate_limiter.allow(client_key, request.url.path):
            return JSONResponse(
                status_code=429,
                content={"available": False, "error": "Too many requests. Please retry later."},
            )

        async with api_concurrency_limiter:
            return await call_next(request)

    return await call_next(request)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Fast backend health — no live provider probe."""
    readiness = check_issuance_readiness(shared_tools.chain)
    return HealthResponse(
        status="ok",
        backend_status="ONLINE",
        agent_configured=is_agent_configured(),
        ai_provider=configured_provider_name(),
        model=configured_model(),
        write_capabilities=readiness.ready,
        issuance_readiness=IssuanceReadinessView(**readiness.to_dict()),
    )


@app.get("/health/provider", response_model=ProviderHealthResponse)
async def health_provider() -> ProviderHealthResponse:
    """Live provider probe — expensive, cached for PROBE_TTL_SECONDS."""
    agent_ready, agent_status = await probe_agent_connectivity()
    return ProviderHealthResponse(
        provider_status="ONLINE" if agent_ready else "OFFLINE",
        provider_error=agent_status,
        model=configured_model(),
        ai_provider=configured_provider_name(),
    )


@app.get("/developer/status", response_model=DeveloperPlatformStatus)
def get_developer_status() -> DeveloperPlatformStatus:
    """Return safe read-only availability and fixed testnet integration metadata."""

    return developer_status.get_status()


@app.post("/monitoring/check", response_model=MonitoringCheckResult)
def run_monitoring_check(
    request: MonitoringCheckRequest,
) -> MonitoringCheckResult | JSONResponse:
    """Run and persist one explicit read-only trust-state check."""

    try:
        return continuous_verification.run_monitoring_check(
            request.asset, request.claim
        )
    except MonitoringError as error:
        return JSONResponse(
            status_code=400,
            content={"available": False, "error": str(error)},
        )
    except MonitoringStoreError:
        return JSONResponse(
            status_code=500,
            content={
                "available": False,
                "error": "Local monitoring history is unavailable or malformed.",
            },
        )


@app.get("/monitoring", response_model=MonitoringOverview)
def get_monitoring_overview() -> MonitoringOverview | JSONResponse:
    """Return configured assets and their latest persisted trust state."""

    try:
        return continuous_verification.overview()
    except MonitoringStoreError:
        return JSONResponse(
            status_code=500,
            content={
                "available": False,
                "error": "Local monitoring history is unavailable or malformed.",
            },
        )


@app.get("/monitoring/{asset}", response_model=MonitoringAssetDetail)
def get_monitoring_asset(asset: str) -> MonitoringAssetDetail | JSONResponse:
    """Return one asset's local snapshots, transitions, and monitoring config."""

    try:
        return continuous_verification.asset_detail(asset)
    except MonitoringError as error:
        return JSONResponse(
            status_code=400,
            content={"available": False, "error": str(error)},
        )
    except MonitoringStoreError:
        return JSONResponse(
            status_code=500,
            content={
                "available": False,
                "error": "Local monitoring history is unavailable or malformed.",
            },
        )


@app.get("/policies", response_model=PolicyStudioOverview)
def list_policies() -> PolicyStudioOverview | JSONResponse:
    """List immutable demo presets and latest saved policy versions."""

    try:
        return policy_studio.overview()
    except PolicyStoreError:
        return JSONResponse(
            status_code=500,
            content={"available": False, "error": "Local policy history is unavailable or malformed."},
        )


@app.post("/policies", response_model=InstitutionalPolicy)
def create_policy(draft: InstitutionalPolicyDraft) -> InstitutionalPolicy | JSONResponse:
    """Validate and append a custom policy version without any blockchain write."""

    try:
        return policy_studio.create_policy(draft)
    except (PolicyValidationError, PolicyEvaluationError) as error:
        return JSONResponse(status_code=400, content={"available": False, "error": str(error)})
    except PolicyStoreError:
        return JSONResponse(
            status_code=500,
            content={"available": False, "error": "Local policy history is unavailable or malformed."},
        )


@app.get("/policies/{policy_id}/evaluations", response_model=list[PolicyEvaluation])
def list_policy_evaluations(policy_id: str) -> list[PolicyEvaluation] | JSONResponse:
    """Return local evaluation history bound to policy versions and commitments."""

    try:
        return policy_studio.evaluations(policy_id)
    except PolicyEvaluationError as error:
        return JSONResponse(status_code=404, content={"available": False, "error": str(error)})
    except PolicyStoreError:
        return JSONResponse(
            status_code=500,
            content={"available": False, "error": "Local policy history is unavailable or malformed."},
        )


@app.post("/policies/{policy_id}/evaluate", response_model=PolicyEvaluation)
def evaluate_policy(
    policy_id: str,
    request: PolicyEvaluationRequest,
) -> PolicyEvaluation | JSONResponse:
    """Evaluate current ProofLayer state against one exact off-chain policy version."""

    try:
        return policy_studio.evaluate_policy(policy_id, request)
    except PolicyEvaluationError as error:
        return JSONResponse(status_code=400, content={"available": False, "error": str(error)})
    except PolicyStoreError:
        return JSONResponse(
            status_code=500,
            content={"available": False, "error": "Local policy history is unavailable or malformed."},
        )


@app.get("/policies/{policy_id}", response_model=PolicyDetail)
def get_policy(policy_id: str) -> PolicyDetail | JSONResponse:
    """Return policy requirements and factual local evaluation history."""

    try:
        return policy_studio.detail(policy_id)
    except PolicyEvaluationError as error:
        return JSONResponse(status_code=404, content={"available": False, "error": str(error)})
    except PolicyStoreError:
        return JSONResponse(
            status_code=500,
            content={"available": False, "error": "Local policy history is unavailable or malformed."},
        )
@app.post("/agent/verify", response_model=AgentResponse)
async def verify(request: AgentRequest) -> AgentResponse | JSONResponse:
    try:
        return await run_verification_agent(request.investigation_query)
    except AgentUnavailableError as error:
        return JSONResponse(
            status_code=503,
            content={"available": False, "error": str(error)},
        )
    except AgentExecutionError as error:
        return JSONResponse(
            status_code=502,
            content={"available": False, "error": str(error)},
        )


@app.post("/demo/run", response_model=DemoRunnerResponse)
def run_demo(request: DemoRunnerRequest) -> DemoRunnerResponse | JSONResponse:
    """Run a predefined workflow without an OpenAI request or transaction."""

    try:
        return demo_runner.run(request)
    except DemoRunnerError as error:
        return JSONResponse(
            status_code=400,
            content={"available": False, "error": str(error)},
        )


@app.post("/markets/eligibility", response_model=MarketEligibilityResult)
def check_market_eligibility(
    request: MarketEligibilityRequest,
) -> MarketEligibilityResult | JSONResponse:
    """Check whether an asset is eligible for a protected market action."""

    try:
        return market_eligibility.check(request)
    except MarketEligibilityError as error:
        return JSONResponse(
            status_code=400,
            content={"available": False, "error": str(error)},
        )


@app.post("/protocol/check", response_model=ProtocolDecision)
def check_protocol(
    request: ProtocolCheckRequest,
) -> ProtocolDecision | JSONResponse:
    """Simulate a protocol acceptance policy using read-only ProofLayer state."""

    try:
        return protocol_evaluator.check(request)
    except ProtocolIntegrationError as error:
        return JSONResponse(
            status_code=400,
            content={"available": False, "error": str(error)},
        )


@app.get("/certificates", response_model=list[CertificateExplorerRecord])
def list_certificates() -> list[CertificateExplorerRecord]:
    """Return only genuine exported ProofLayer certificate fixtures with live state."""

    return certificate_explorer.list_known()


@app.get(
    "/certificates/{certificate_id}",
    response_model=CertificateExplorerRecord,
)
def get_certificate(
    certificate_id: str,
) -> CertificateExplorerRecord | JSONResponse:
    """Inspect one bytes32 certificate ID using read-only ProofLayer tools."""

    try:
        return certificate_explorer.lookup(certificate_id)
    except CertificateLookupError as error:
        return JSONResponse(
            status_code=400,
            content={"available": False, "error": str(error)},
        )


@app.get("/evidence", response_model=EvidenceExplorerIndex)
def list_evidence_assets() -> EvidenceExplorerIndex:
    """Compare current repository evidence using existing read-only engines."""

    return evidence_explorer.list_assets()


@app.get("/evidence/{asset}", response_model=EvidenceAssetDetail)
def get_evidence_asset(asset: str) -> EvidenceAssetDetail | JSONResponse:
    """Explain one supported asset's evidence, provenance, and RVC result."""

    try:
        return evidence_explorer.get_asset(asset)
    except EvidenceExplorerError as error:
        return JSONResponse(
            status_code=400,
            content={"available": False, "error": str(error)},
        )


def _issuance_error(
    error: str,
    error_code: str,
    status_code: int = 400,
) -> JSONResponse:
    """Structured issuance failure with a consistent body shape."""

    return JSONResponse(
        status_code=status_code,
        content={
            "available": False,
            "error": error,
            "error_code": error_code,
            "network": "X Layer Testnet",
            "chain_id": XLAYER_CHAIN_ID,
        },
    )


@dataclass(frozen=True)
class _IssuanceHttpOutcome:
    status_code: int
    content: dict[str, Any]


def _authoritative_datetime(value: Any, field_name: str) -> datetime:
    """Parse an RVC timestamp without substituting API/server time."""

    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    else:
        raise ValueError(f"Authoritative {field_name} is missing or invalid")
    if parsed.tzinfo is None:
        raise ValueError(f"Authoritative {field_name} must include a timezone")
    return parsed.astimezone(timezone.utc)


def _controlled_issuance_error(
    *,
    request_id: str,
    operator_id: str,
    error: str,
    error_code: str,
    status_code: int = 400,
    audit_status: str = "RECORDED",
) -> _IssuanceHttpOutcome:
    return _IssuanceHttpOutcome(
        status_code=status_code,
        content={
            "available": False,
            "success": False,
            "certificate_id": None,
            "transaction_hash": None,
            "block_number": None,
            "read_back": None,
            "error": error,
            "error_code": error_code,
            "network": "X Layer Testnet",
            "chain_id": XLAYER_CHAIN_ID,
            "request_id": request_id,
            "operator_id": operator_id,
            "idempotent_replay": False,
            "authoritative_observed_at": None,
            "authoritative_valid_until": None,
            "audit_status": audit_status,
        },
    )


def _finalize_issuance_audit(
    outcome: _IssuanceHttpOutcome,
    *,
    request_id: str,
    operator_id: str,
    key_hash: str,
    fingerprint: str,
) -> _IssuanceHttpOutcome:
    content = dict(outcome.content)
    try:
        append_issuance_audit(
            {
                "event": "ISSUANCE_REQUEST_COMPLETED",
                "request_id": request_id,
                "operator_id": operator_id,
                "idempotency_key_hash": key_hash,
                "request_fingerprint": fingerprint,
                "success": bool(content.get("success")),
                "error_code": content.get("error_code"),
                "certificate_id": content.get("certificate_id"),
                "transaction_hash": content.get("transaction_hash"),
                "block_number": content.get("block_number"),
                "read_back": content.get("read_back"),
            }
        )
        content["audit_status"] = "RECORDED"
    except Exception as exc:
        # A start record was fsynced before any signer process could run. If
        # finalization fails after a transaction, preserve the result and mark
        # the local audit limitation explicitly rather than encouraging a
        # second transaction.
        logger.error("Issuance audit finalization failed: %s", type(exc).__name__)
        content["audit_status"] = "START_RECORDED_FINALIZATION_FAILED"
    return _IssuanceHttpOutcome(outcome.status_code, content)


def _run_authoritative_issuance(
    issuance_request: IssuanceRequest,
    *,
    request_id: str,
    operator_id: str,
    key_hash: str,
    fingerprint: str,
) -> _IssuanceHttpOutcome:
    """Run one authenticated/idempotent request through the RVC boundary."""

    try:
        append_issuance_audit(
            {
                "event": "ISSUANCE_REQUEST_AUTHORIZED",
                "request_id": request_id,
                "operator_id": operator_id,
                "idempotency_key_hash": key_hash,
                "request_fingerprint": fingerprint,
                "asset": issuance_request.asset,
                "claim": issuance_request.claim,
                "policy_id": issuance_request.policy_id,
            }
        )
    except Exception as exc:
        logger.error("Issuance audit start failed: %s", type(exc).__name__)
        return _controlled_issuance_error(
            request_id=request_id,
            operator_id=operator_id,
            error="The local testnet issuance audit store is unavailable",
            error_code="AUDIT_UNAVAILABLE",
            status_code=503,
            audit_status="UNAVAILABLE",
        )

    def finish(outcome: _IssuanceHttpOutcome) -> _IssuanceHttpOutcome:
        return _finalize_issuance_audit(
            outcome,
            request_id=request_id,
            operator_id=operator_id,
            key_hash=key_hash,
            fingerprint=fingerprint,
        )

    readiness = check_issuance_readiness(shared_tools.chain)
    if not readiness.ready:
        return finish(
            _controlled_issuance_error(
                request_id=request_id,
                operator_id=operator_id,
                error=readiness.note or "Issuance infrastructure is not available",
                error_code="SIGNER_UNAVAILABLE",
                status_code=503,
            )
        )

    # Authoritative re-verification: never trust a client's claimed result,
    # timestamps, evidence root, provenance count, predicates, or reasons.
    try:
        detail = evidence_explorer.get_asset(
            issuance_request.asset,
            include_certificate=False,
        )
    except EvidenceExplorerError as error:
        return finish(
            _controlled_issuance_error(
                request_id=request_id,
                operator_id=operator_id,
                error=str(error),
                error_code="UNSUPPORTED_ASSET",
            )
        )

    if detail.claim != issuance_request.claim:
        return finish(
            _controlled_issuance_error(
                request_id=request_id,
                operator_id=operator_id,
                error=(
                    f"Claim {issuance_request.claim!r} does not match the "
                    f"authoritative claim {detail.claim!r} for {detail.asset}."
                ),
                error_code="CLAIM_MISMATCH",
            )
        )

    authoritative_result = str(detail.verification.current_rvc_result)
    if authoritative_result != str(detail.verification.result):
        return finish(
            _controlled_issuance_error(
                request_id=request_id,
                operator_id=operator_id,
                error="The current RVC result fields do not match",
                error_code="RVC_RESULT_MISMATCH",
            )
        )
    if authoritative_result != "PASS":
        reasons = ", ".join(detail.verification.reason_codes) or "no reason codes"
        return finish(
            _controlled_issuance_error(
                request_id=request_id,
                operator_id=operator_id,
                error=(
                    f"Authoritative RVC for {detail.asset}/{detail.claim} is "
                    f"{authoritative_result} ({reasons}); only PASS certificates can be issued"
                ),
                error_code="RVC_NOT_PASS",
            )
        )

    if detail.verification.simulation:
        return finish(
            _controlled_issuance_error(
                request_id=request_id,
                operator_id=operator_id,
                error="Simulated verification results cannot be issued",
                error_code="SIMULATED_VERIFICATION",
            )
        )

    if detail.verification.policy_id != issuance_request.policy_id:
        return finish(
            _controlled_issuance_error(
                request_id=request_id,
                operator_id=operator_id,
                error=(
                    f"Policy {issuance_request.policy_id!r} does not match the "
                    f"authoritative policy {detail.verification.policy_id!r}."
                ),
                error_code="POLICY_MISMATCH",
            )
        )

    try:
        observed_at = _authoritative_datetime(
            detail.verification.observed_at, "observed_at"
        )
        valid_until = _authoritative_datetime(
            detail.verification.valid_until, "valid_until"
        )
    except (TypeError, ValueError, OverflowError, OSError):
        return finish(
            _controlled_issuance_error(
                request_id=request_id,
                operator_id=operator_id,
                error="The authoritative RVC validity window is invalid",
                error_code="INVALID_RVC_VALIDITY",
            )
        )
    if valid_until <= observed_at or valid_until <= datetime.now(timezone.utc):
        return finish(
            _controlled_issuance_error(
                request_id=request_id,
                operator_id=operator_id,
                error="The authoritative RVC validity window has expired",
                error_code="RVC_EXPIRED",
            )
        )

    # The Evidence Explorer composes the deterministic verification and the
    # provenance view through separate bounded reads. Never merge two
    # disagreeing root counts into one certificate. The commitment count is
    # the value emitted by the authoritative RVC alongside its evidence root.
    authoritative_root_count = detail.evidence_commitment.independent_root_count
    if authoritative_root_count != detail.provenance.independent_root_count:
        return finish(
            _controlled_issuance_error(
                request_id=request_id,
                operator_id=operator_id,
                error="The authoritative RVC and provenance root counts do not match",
                error_code="RVC_PROVENANCE_MISMATCH",
            )
        )

    predicate_results = [
        PredicateResult(
            predicate=item.predicate,
            passed=item.passed,
            expected=item.expected,
            observed=item.observed,
            reason_code=item.reason_code,
        )
        for item in detail.verification.predicates
    ]
    certificate = VerificationCertificate(
        certificate_id="",
        asset_id=detail.asset,
        claim_type=detail.claim,
        claim_version="1.0",
        policy_id=detail.verification.policy_id,
        policy_version=detail.verification.policy_version,
        result=VerificationResult.PASS,
        predicate_results=predicate_results,
        reason_codes=list(detail.verification.reason_codes),
        evidence_root=detail.evidence_commitment.value,
        independent_root_count=authoritative_root_count,
        observed_at=observed_at,
        valid_until=valid_until,
        simulation_flag=detail.verification.simulation,
    )

    try:
        result = issue_certificate(
            certificate,
            request_id=request_id,
            operator_id=operator_id,
        )
    except Exception as exc:
        logger.error(
            "Certificate issuance raised an unexpected error: %s",
            type(exc).__name__,
        )
        return finish(
            _controlled_issuance_error(
                request_id=request_id,
                operator_id=operator_id,
                error="Certificate issuance failed unexpectedly",
                error_code="UNKNOWN_ERROR",
                status_code=500,
            )
        )

    content = {
        "success": result.success,
        "certificate_id": result.certificate_id,
        "transaction_hash": result.transaction_hash,
        "block_number": result.block_number,
        "read_back": result.read_back.__dict__ if result.read_back else None,
        "error": result.error,
        "error_code": result.error_code,
        "network": result.network,
        "chain_id": result.chain_id,
        "request_id": request_id,
        "operator_id": operator_id,
        "idempotent_replay": False,
        "authoritative_observed_at": observed_at.isoformat(),
        "authoritative_valid_until": valid_until.isoformat(),
        "audit_status": "PENDING",
    }
    return finish(
        _IssuanceHttpOutcome(
            status_code=200 if result.success else 400,
            content=content,
        )
    )


@app.post("/certificates/issue", response_model=IssuanceResponse)
def issue_certificate_endpoint(
    issuance_request: IssuanceRequest,
    http_request: Request,
) -> JSONResponse:
    """Issue an authoritative certificate under local testnet controls.

    The route is disabled by default. When explicitly enabled it requires a
    configured bearer-token operator and idempotency key. These single-process
    development controls do not claim production KMS/multisig security.
    """

    # Authorization gates precede readiness probes, evidence work, and any
    # possible signer/Hardhat process.
    if not issuance_enabled():
        return _issuance_error(
            "X Layer Testnet certificate issuance is disabled",
            "ISSUANCE_DISABLED",
            status_code=503,
        )
    try:
        operator_id = authenticate_operator(http_request.headers.get("authorization"))
    except OperatorConfigurationError:
        return _issuance_error(
            "Testnet operator authentication is not configured",
            "OPERATOR_AUTH_NOT_CONFIGURED",
            status_code=503,
        )
    except OperatorAuthenticationError:
        response = _issuance_error(
            "Operator authorization failed",
            "UNAUTHORIZED_OPERATOR",
            status_code=401,
        )
        response.headers["WWW-Authenticate"] = "Bearer"
        return response

    try:
        idempotency_key = validate_idempotency_key(
            http_request.headers.get("idempotency-key")
        )
    except IdempotencyKeyError as error:
        return _issuance_error(str(error), "INVALID_IDEMPOTENCY_KEY")

    canonical_request = issuance_request.model_dump()
    fingerprint = request_fingerprint(operator_id, canonical_request)
    key_hash = idempotency_key_hash(idempotency_key)

    try:
        coordinated = issuance_coordinator.execute(
            operator_id=operator_id,
            idempotency_key=idempotency_key,
            fingerprint=fingerprint,
            operation=lambda request_id: _run_authoritative_issuance(
                issuance_request,
                request_id=request_id,
                operator_id=operator_id,
                key_hash=key_hash,
                fingerprint=fingerprint,
            ),
        )
    except IdempotencyConflictError as error:
        return _issuance_error(str(error), "IDEMPOTENCY_CONFLICT", status_code=409)
    except IdempotencyInProgressError as error:
        return _issuance_error(str(error), "IDEMPOTENCY_IN_PROGRESS", status_code=409)
    except Exception as exc:
        logger.error("Issuance coordination failed: %s", type(exc).__name__)
        return _issuance_error(
            "Certificate issuance coordination failed",
            "UNKNOWN_ERROR",
            status_code=500,
        )

    outcome = coordinated.value
    content = dict(outcome.content)
    content["request_id"] = coordinated.request_id
    content["idempotent_replay"] = coordinated.idempotent_replay
    if coordinated.idempotent_replay:
        try:
            append_issuance_audit(
                {
                    "event": "ISSUANCE_REQUEST_REPLAYED",
                    "request_id": coordinated.request_id,
                    "operator_id": operator_id,
                    "idempotency_key_hash": key_hash,
                    "request_fingerprint": fingerprint,
                }
            )
        except Exception as exc:
            logger.error("Issuance replay audit failed: %s", type(exc).__name__)
            content["audit_status"] = "REPLAY_AUDIT_FAILED"
    return JSONResponse(status_code=outcome.status_code, content=content)
