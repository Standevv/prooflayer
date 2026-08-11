"""FastAPI boundary for ProofLayer read-only orchestration modes."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from services.api_hardening import ApiConcurrencyLimiter, ApiRateLimiter, RequestSizeGuard

from services.certificate_explorer.lookup import (
    CertificateLookupError,
    CertificateLookupService,
)
from services.certificate_explorer.models import CertificateExplorerRecord
from services.evidence_explorer.lookup import (
    EvidenceExplorerError,
    EvidenceExplorerService,
)
from services.evidence_explorer.models import EvidenceAssetDetail, EvidenceExplorerIndex
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
    is_agent_configured,
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


app = FastAPI(
    title="ProofLayer AI Verification Agent",
    version="0.1.0",
    description="Read-only AI investigation over deterministic ProofLayer tools.",
)

request_size_guard = RequestSizeGuard(max_request_bytes=1_048_576)
api_rate_limiter = ApiRateLimiter(max_requests=60, window_seconds=60.0)
api_concurrency_limiter = ApiConcurrencyLimiter(max_active_requests=4)

demo_runner = DeterministicDemoRunner()
protocol_evaluator = ProtocolPolicyEvaluator()
certificate_explorer = CertificateLookupService()
evidence_explorer = EvidenceExplorerService(
    tools=certificate_explorer.tools,
    certificate_lookup=certificate_explorer,
)
developer_status = DeveloperStatusService(tools=certificate_explorer.tools)
continuous_verification = ContinuousVerificationEngine(tools=certificate_explorer.tools)
policy_studio = PolicyStudioService(
    evaluator=InstitutionalPolicyEvaluator(continuous_verification)
)


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


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "status": "ok",
        "agent_configured": is_agent_configured(),
        "deterministic_demo_available": True,
        "model": configured_model(),
        "write_capabilities": False,
    }


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
