# ProofLayer AI Verification Agent

The AI agent is an investigation layer over ProofLayer. The provider selects bounded read-only tools; the server renders returned factual explanations only from successful tool records. Deterministic RVC code remains the only verification authority, and read-only X Layer calls remain the authority for current CertificateRegistry, PolicyGate, and DecisionLog state. See [ProofLayer architecture](prooflayer-architecture.md) for the repository-grounded current/target system map and trust boundaries.

## Architecture

```text
Next.js verification console
        |
        v
Next.js POST /api/agent/verify (thin server-only gateway)
        |
        v
FastAPI POST /agent/verify
        |
        v
Configured OpenAI-compatible model provider (replaceable and bounded)
        |
        v
Tool router (native function calls where supported; strict JSON fallback)
        |
        v
ProofLayerTools executed directly in the FastAPI process
        +-- versioned architecture catalog
        +-- existing USDY/PAXG evidence adapters
        +-- existing provenance engine
        +-- existing TreasuryBacking/GoldBacking RVC verifiers
        +-- read-only X Layer Registry/PolicyGate/DecisionLog calls
```

The agent has no signing key and exposes no write tool. PolicyGate inspection is a read-only assessment; it does not execute a protected action.

Providers known to support OpenAI-compatible function calling receive the native tool manifest. Other providers use the in-band JSON action protocol: exactly one `tool_call` or `final` object per turn. In both modes, ProofLayer executes tools locally and reconstructs authoritative response fields and public factual prose from their outputs, never from model prose. Provider text can drive orchestration, but it is not appended to the public explanation. The standalone MCP server in `services/mcp_server` is available for external clients but is not spawned by the application agent.

## Supported scope

- USDY / `TreasuryBacking`
- PAXG / `GoldBacking`

Unsupported assets and claims are rejected. At this repository checkpoint, a current USDY/TreasuryBacking RVC run is `FAIL` with `STALE_ATTESTATION`; the agent must preserve that result. The repository-known historical USDY `PASS` certificate is separate, expired, and unusable, so it must never be presented as current `PASS`. PAXG currently depends on snapshot evidence with stale/missing inputs and can produce `INDETERMINATE` under the GoldBacking semantics. Runtime questions must still execute the relevant read-only tool rather than rely on this static status note.

## Setup

From the repository root:

```powershell
python -m pip install -r requirements-agent.txt
Copy-Item .env.example .env
```

Set the following server-side values in `.env`:

```dotenv
# Example provider configuration (NVIDIA NIM shown; any compatible endpoint
# can be selected). A real key is required; placeholder values such as
# `any-value` are rejected.
AI_PROVIDER=nvidia
AI_BASE_URL=https://integrate.api.nvidia.com/v1
AI_MODEL=nvidia/nemotron-3-ultra-550b-a55b
# Provider-specific key (used when AI_PROVIDER=nvidia)
NVIDIA_API_KEY=
# Generic override (optional; used only when the provider-specific key is empty)
AI_API_KEY=
# Alternative: OpenRouter
# AI_PROVIDER=openrouter
# AI_BASE_URL=https://openrouter.ai/api/v1
# AI_MODEL=<model, e.g. nvidia/nemotron-3-ultra-550b-a55b:free>
# OPENROUTER_API_KEY=
# Alternative: Cerebras
# AI_PROVIDER=cerebras
# AI_BASE_URL=https://api.cerebras.ai/v1
# AI_MODEL=gpt-oss-120b
# CEREBRAS_API_KEY=
# Legacy fallback (optional, supported temporarily):
# OPENAI_API_KEY=
# OPENAI_MODEL=gpt-4o-mini
# OPENAI_BASE_URL=https://api.openai.com/v1
PROOFLAYER_AGENT_MAX_TURNS=4
PROOFLAYER_AGENT_HOST=127.0.0.1
PROOFLAYER_AGENT_PORT=8010
XLAYER_TESTNET_RPC_URL=https://testrpc.xlayer.tech/terigon
```

### OpenAI-compatible provider abstraction

The agent talks to a configured OpenAI-compatible Chat Completions endpoint using the official OpenAI Python SDK (`AsyncOpenAI`). The example above selects NVIDIA NIM, but the provider is replaceable infrastructure and never participates in verification authority. Runtime selection is controlled by `AI_PROVIDER`, `AI_BASE_URL`, and `AI_MODEL` (with legacy compatibility variables where implemented).

When those model/base variables are entirely unset, the current code-level compatibility fallback is Gemini (`gemini-3.5-flash-lite` through Google's OpenAI-compatible endpoint). That fallback is implementation configuration, not the product architecture or verification authority; an actual provider key is still required before the agent is considered configured.

`AI_*` variables are the preferred configuration: `AI_BASE_URL`, `AI_MODEL`, `AI_PROVIDER`, plus a key. The agent resolves the key in this order: the active provider's dedicated variable (e.g. `NVIDIA_API_KEY` when `AI_PROVIDER=nvidia`), then `AI_API_KEY` (generic override), then the legacy `OPENAI_API_KEY`. `OPENAI_*` variables remain supported as a backward-compatible fallback, with `AI_*` taking precedence.

A real, non-placeholder API key is required. `is_agent_configured()` treats documented dummy values (such as `any-value`) as *not* configured. `/health` is a fast backend/configuration check and does not call the provider; `/health/provider` performs the bounded, cached live connectivity probe. If that probe fails, a sanitized error category is surfaced without exposing the key.

The agent classifies provider failures into sanitized categories so the UI can explain exactly what is wrong without exposing the key: a 401 becomes `AUTHENTICATION_ERROR`, a 404 model `MODEL_NOT_FOUND`, rate limiting `RATE_LIMIT`, and a `402 payment_required` response (e.g. an account without billing credit) becomes `INSUFFICIENT_QUOTA`. The agent always reports the honest state rather than fabricating a result.

Keys (`NVIDIA_API_KEY`, `AI_API_KEY`, and the legacy `OPENAI_API_KEY`) are read only by the Python agent process. They are not placed in `NEXT_PUBLIC_` variables and are never exposed in API responses or logs. Never commit `.env` or a real API key.

The model and run budget are configurable, but the implementation defaults to four turns and enforces a maximum of six, serial tool execution, bounded provider calls, and a final-output limit.

## Run locally

Terminal 1, from the repository root:

```powershell
python scripts/run_agent_api.py
```

Terminal 2:

```powershell
npm --prefix apps/web run dev
```

The web gateway defaults to `http://127.0.0.1:8010`. To use another internal API address, set this server-only value in `apps/web/.env.local`:

```dotenv
PROOFLAYER_AGENT_API_URL=http://127.0.0.1:8010
```

The agent run is bounded by a server-side aggregate timeout; the web gateway keeps a corresponding proxy timeout. If the provider is configured but unreachable or too slow, the run fails with an explicit error rather than a fabricated result.

When no real API key is configured, `POST /agent/verify` returns HTTP 503 and the frontend shows an unavailable state. It never substitutes a fake AI or verification response.

## Read-only tools and MCP facade

The application agent instantiates `ProofLayerTools` and calls it directly in-process. It does not start an MCP subprocess for each investigation. A standalone stdio MCP facade exposes the same read-only class for external clients and can be inspected independently:

```powershell
python -m services.mcp_server.server
```

Tools:

- `discover_assets`
- `get_system_architecture`
- `get_asset_metadata`
- `get_evidence`
- `analyze_provenance`
- `verify_claim`
- `get_certificate_state`
- `get_policygate_state`
- `get_decision_history`

`get_system_architecture` accepts bounded `topic` and `audience` arguments and returns the `prooflayer-architecture-v1` catalog. Architecture answers use response mode `ARCHITECTURE_EXPLANATION`. Catalog output distinguishes current, partial/reference, and target architecture; it does not replace a current RVC execution or live X Layer read.

## Tests

Offline tests mock X Layer state where needed and never call an external model provider:

```powershell
python -m unittest discover -s tests -v
```

The opt-in live smoke test performs one agent request through the configured provider and is never run by the automated suite:

```powershell
python scripts/test_agent_live.py
```

## Response boundary

The public trace contains tool names, sanitized arguments, completion status, and concise factual summaries only. It does not expose model chain-of-thought. Deterministic results, reason codes, evidence-root count, certificate status, PolicyGate outcome, supported assets, source authenticity, provenance counts, decision history, tool list, trace, and the public explanation are reconstructed from actual ProofLayer tool outputs before the response leaves the API. Architecture explanations use the versioned repository catalog, while time-sensitive verification and chain facts always come from the relevant runtime tool.
