# ProofLayer AI Verification Agent

The AI agent is an investigation layer over ProofLayer. It chooses read-only tools and explains their results; the existing deterministic RVC code remains the only verification authority, and the deployed X Layer contracts remain the only source of certificate, PolicyGate, and DecisionLog state.

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
OpenAI-compatible chat-completions gateway (bounded to 8 turns by default)
        |
        v
JSON-action router (model emits tool_call / final actions in strict JSON)
        |
        v
Existing ProofLayer read-only tools executed locally
        +-- existing USDY/PAXG evidence adapters
        +-- existing provenance engine
        +-- existing TreasuryBacking/GoldBacking RVC verifiers
        +-- read-only X Layer Registry/PolicyGate/DecisionLog calls
```

The agent has no signing key and exposes no write tool. PolicyGate inspection is a read-only assessment; it does not execute a protected action.

The gateway model does not expose native function calling, so ProofLayer routes tool actions in-band: the model replies with exactly one strict JSON object per turn — either `{"type": "tool_call", "tool": "...", "arguments": {...}}` or `{"type": "final", "answer": "..."}` — and ProofLayer executes the action locally. Every authoritative field in the response (result, reason codes, certificate status, PolicyGate outcome, trace) is reconstructed from actual tool outputs, never from the model's prose. The standalone MCP server in `services/mcp_server` remains available for external clients; the agent no longer spawns it.

## Supported scope

- USDY / `TreasuryBacking`
- PAXG / `GoldBacking`

Unsupported assets and claims are rejected. The repository's current official USDY snapshot is missing required deterministic policy inputs, and the current PAXG snapshot has stale and missing inputs. The agent must preserve the resulting `INDETERMINATE` semantics. The exported USDY demo certificate is a separate, previously issued on-chain artifact whose current usability is read from X Layer.

## Setup

From the repository root:

```powershell
python -m pip install -r requirements-agent.txt
Copy-Item .env.example .env
```

Set the following server-side values in `.env`:

```dotenv
OPENAI_API_KEY=any-value
OPENAI_MODEL=chatgpt-web
OPENAI_BASE_URL=http://localhost:5000/v1
PROOFLAYER_AGENT_MAX_TURNS=8
PROOFLAYER_AGENT_HOST=127.0.0.1
PROOFLAYER_AGENT_PORT=8010
XLAYER_TESTNET_RPC_URL=https://testrpc.xlayer.tech/terigon
```

### Local OpenAI-compatible gateway

The agent runs through a local OpenAI-compatible gateway by default (`OPENAI_BASE_URL=http://localhost:5000/v1`, model `chatgpt-web`). The gateway does not validate the key, so `OPENAI_API_KEY` can be any non-empty value such as `any-value`; the OpenAI SDK still sends it as a Bearer token because the SDK requires the field. To use a different provider, override `OPENAI_BASE_URL`, `OPENAI_MODEL`, and `OPENAI_API_KEY` in `.env`.

The implementation forces the OpenAI Agents SDK into **chat-completions** mode because the local gateway only implements `/v1/chat/completions` (the SDK's default Responses API is not exposed by the gateway).

`OPENAI_API_KEY` and `OPENAI_BASE_URL` are read only by the Python agent process. They are not placed in `NEXT_PUBLIC_` variables and are not forwarded to the MCP child process. Never commit `.env` or a real API key.

The default model is intentionally configurable. The implementation caps agent runs at 10 turns even if the environment requests more, uses 8 by default, disables parallel tool calls, and limits final model output.

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

The agent run is bounded by `AGENT_TIMEOUT_SECONDS` (240s by default); the web gateway keeps a slightly larger proxy timeout. If the gateway is configured but unreachable or too slow, the run fails with an explicit error rather than a fabricated result.

When neither an API key nor `OPENAI_BASE_URL` is configured, `POST /agent/verify` returns HTTP 503 and the frontend shows an unavailable state. It never substitutes a fake AI or verification response.

## MCP server

The agent starts the single MCP server over stdio for each bounded investigation. It can also be inspected independently:

```powershell
python -m services.mcp_server.server
```

Tools:

- `discover_assets`
- `get_asset_metadata`
- `get_evidence`
- `analyze_provenance`
- `verify_claim`
- `get_certificate_state`
- `get_policygate_state`
- `get_decision_history`

## Tests

Offline tests mock X Layer state where needed and never call OpenAI:

```powershell
python -m unittest discover -s tests -v
```

The opt-in live smoke test performs one agent request through the configured gateway and is never run by the automated suite:

```powershell
python scripts/test_agent_live.py
```

## Response boundary

The public trace contains tool names, completion status, and concise factual summaries only. It does not expose model chain-of-thought. Deterministic result, reason codes, evidence-root count, certificate status, PolicyGate outcome, tool list, and trace are reconstructed from actual MCP tool outputs before the response leaves the API.
