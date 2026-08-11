"""Bounded chat-completions agent backed by deterministic read-only ProofLayer tools.

The configured gateway model (chatgpt-web by default) does not expose native
function calling, so the agent routes tool actions in-band: the model emits a
strict JSON action (tool_call or final) and ProofLayerTools executes it locally.
All authoritative fields are reconstructed from actual tool outputs before the
response leaves the API.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from collections.abc import Mapping
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from openai import AsyncOpenAI

from services.mcp_server.tools import ProofLayerTools

from .models import AgentResponse, ToolTraceArguments, ToolTraceStep
from .prompts import PROOFLAYER_AGENT_INSTRUCTIONS


PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env", override=False)

# The agent routes through the local OpenAI-compatible gateway by default.
# The gateway does not validate the key, so any non-empty value is accepted.
DEFAULT_MODEL = "chatgpt-web"
DEFAULT_BASE_URL = "http://localhost:5000/v1"
DEFAULT_API_KEY = "any-value"
DEFAULT_MAX_TURNS = 8
MAX_ALLOWED_TURNS = 10
AGENT_TIMEOUT_SECONDS = 240
_BYTES32_PATTERN = re.compile(r"0x[a-fA-F0-9]{64}")

# The local gateway model does not expose native function calling, so the agent
# routes tool actions in-band: the model emits a strict JSON action and the
# executor (ProofLayerTools) runs it locally. The manifest below is the only
# tool surface the model sees.
_TOOL_MANIFEST: list[dict[str, Any]] = [
    {
        "name": "discover_assets",
        "description": "List ProofLayer assets and claims that can be deterministically verified.",
        "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        "required": [],
    },
    {
        "name": "get_asset_metadata",
        "description": "Return metadata for one supported asset, including its expected claim and policy ID.",
        "parameters": {
            "type": "object",
            "properties": {"asset": {"type": "string", "enum": ["USDY", "PAXG"]}},
            "additionalProperties": False,
        },
        "required": ["asset"],
    },
    {
        "name": "get_evidence",
        "description": "Return the normalized evidence records for one asset claim.",
        "parameters": {
            "type": "object",
            "properties": {
                "asset": {"type": "string", "enum": ["USDY", "PAXG"]},
                "claim": {"type": "string", "enum": ["TreasuryBacking", "GoldBacking"]},
            },
            "additionalProperties": False,
        },
        "required": ["asset", "claim"],
    },
    {
        "name": "analyze_provenance",
        "description": "Analyze evidence provenance and report independent trust roots.",
        "parameters": {
            "type": "object",
            "properties": {
                "asset": {"type": "string", "enum": ["USDY", "PAXG"]},
                "claim": {"type": "string", "enum": ["TreasuryBacking", "GoldBacking"]},
            },
            "additionalProperties": False,
        },
        "required": ["asset", "claim"],
    },
    {
        "name": "verify_claim",
        "description": "Run the deterministic RVC verifier for one asset claim and return the authoritative result.",
        "parameters": {
            "type": "object",
            "properties": {
                "asset": {"type": "string", "enum": ["USDY", "PAXG"]},
                "claim": {"type": "string", "enum": ["TreasuryBacking", "GoldBacking"]},
            },
            "additionalProperties": False,
        },
        "required": ["asset", "claim"],
    },
    {
        "name": "get_certificate_state",
        "description": "Read the current X Layer registry state for a known 0x bytes32 certificate ID.",
        "parameters": {
            "type": "object",
            "properties": {
                "certificate_id": {"type": "string", "pattern": "^0x[0-9a-fA-F]{64}$"}
            },
            "additionalProperties": False,
        },
        "required": ["certificate_id"],
    },
    {
        "name": "get_policygate_state",
        "description": "Read-only PolicyGate assessment for a certificate ID against an asset, claim, and policy.",
        "parameters": {
            "type": "object",
            "properties": {
                "certificate_id": {"type": "string", "pattern": "^0x[0-9a-fA-F]{64}$"},
                "asset": {"type": "string", "enum": ["USDY", "PAXG"]},
                "claim": {"type": "string", "enum": ["TreasuryBacking", "GoldBacking"]},
                "policy": {
                    "type": "string",
                    "enum": ["default-treasury-policy", "default-gold-policy"],
                },
            },
            "additionalProperties": False,
        },
        "required": ["certificate_id", "asset", "claim", "policy"],
    },
    {
        "name": "get_decision_history",
        "description": "Read the X Layer DecisionLog history for a certificate ID.",
        "parameters": {
            "type": "object",
            "properties": {
                "certificate_id": {"type": "string", "pattern": "^0x[0-9a-fA-F]{64}$"}
            },
            "additionalProperties": False,
        },
        "required": ["certificate_id"],
    },
]
_TOOL_MANIFEST_BY_NAME = {item["name"]: item for item in _TOOL_MANIFEST}
_ACTION_JSON_PATTERN = re.compile(r"\{.*\}", re.DOTALL)
_ROUTER_RETRY_HINT = (
    "Your previous reply was not a valid action. Reply with exactly one strict JSON object "
    "and nothing else: "
    '{"type": "tool_call", "tool": "<tool name>", "arguments": {"...": "..."}} or '
    '{"type": "final", "answer": "<text>"}. '
    "The ProofLayer tools ARE available; request them with a tool_call action."
)


class AgentUnavailableError(RuntimeError):
    """Raised when the service has no API key and cannot run a real agent."""


class AgentExecutionError(RuntimeError):
    """Raised when a configured agent run fails safely."""


def is_agent_configured() -> bool:
    """True when a key or an explicit gateway base URL is configured."""
    return bool(os.getenv("OPENAI_API_KEY", "").strip()) or bool(
        os.getenv("OPENAI_BASE_URL", "").strip()
    )


def configured_model() -> str:
    return os.getenv("OPENAI_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL


def configured_base_url() -> str:
    """Resolve the OpenAI-compatible endpoint for the model provider."""
    return os.getenv("OPENAI_BASE_URL", "").strip() or DEFAULT_BASE_URL


def configured_api_key() -> str:
    """Resolve the provider key; the local gateway does not validate it."""
    return os.getenv("OPENAI_API_KEY", "").strip() or DEFAULT_API_KEY


def configured_max_turns() -> int:
    raw_value = os.getenv("PROOFLAYER_AGENT_MAX_TURNS", str(DEFAULT_MAX_TURNS))
    try:
        turns = int(raw_value)
    except ValueError:
        turns = DEFAULT_MAX_TURNS
    return max(1, min(turns, MAX_ALLOWED_TURNS))


def tool_route_hint(query: str) -> str:
    """Give the model a bounded route while leaving final tool selection to it."""
    lowered = query.lower()
    mentions_both = "usdy" in lowered and "paxg" in lowered
    asks_coverage = any(
        phrase in lowered
        for phrase in ("what can prooflayer verify", "supported assets", "what can you verify")
    )
    asks_chain_state = any(
        phrase in lowered
        for phrase in (
            "certificate",
            "policygate",
            "policy gate",
            "blocked",
            "on-chain",
            "onchain",
            "decision",
            "usable",
            "safe to use",
        )
    )
    if asks_coverage and not mentions_both:
        return "Begin with discover_assets; inspect metadata only if the question needs detail."
    if mentions_both:
        return (
            "Discover support, then inspect metadata, evidence, provenance, and deterministic "
            "verification for both USDY and PAXG before comparing them."
        )
    if asks_chain_state:
        return (
            "Inspect asset metadata and deterministic verification, then use any known live "
            "certificate ID to read registry, PolicyGate, and DecisionLog state."
        )
    return (
        "Confirm support, then inspect metadata, evidence, provenance, and deterministic "
        "verification for the requested claim."
    )


def _trace_summary(tool: str, result: Mapping[str, Any], is_error: bool) -> str:
    if is_error:
        return "The tool rejected the request or could not return authoritative data."
    if tool == "discover_assets":
        return f"Discovered {len(result.get('assets', []))} deterministic asset integrations."
    if tool == "get_asset_metadata":
        return f"Loaded metadata for {result.get('asset', 'the requested asset')}."
    if tool == "get_evidence":
        return (
            f"Loaded {result.get('evidence_count', 0)} normalized evidence records "
            f"for {result.get('asset', 'the requested asset')}."
        )
    if tool == "analyze_provenance":
        return (
            f"Provenance analysis found {result.get('independent_root_count', 0)} "
            "independent evidence roots."
        )
    if tool == "verify_claim":
        outcome = result.get("verification_result", "UNKNOWN")
        reasons = result.get("reason_codes") or []
        suffix = f" Reasons: {', '.join(map(str, reasons))}." if reasons else ""
        return f"Deterministic RVC returned {outcome}.{suffix}"
    if tool == "get_certificate_state":
        return f"Registry state: {result.get('certificate_status', 'UNAVAILABLE')}."
    if tool == "get_policygate_state":
        return (
            "Read-only PolicyGate assessment: "
            f"{result.get('policygate_outcome', 'UNAVAILABLE')}; no action executed."
        )
    if tool == "get_decision_history":
        return (
            f"Found {result.get('matching_decision_count', 0)} matching successful "
            "DecisionLog entries in the queried range."
        )
    return "Tool completed."


def _trace(records: list[dict[str, Any]]) -> list[ToolTraceStep]:
    return [
        ToolTraceStep(
            tool=str(record.get("tool", "unknown")),
            arguments=ToolTraceArguments(
                **{
                    name: str(record["arguments"][name])
                    for name in ("asset", "claim", "certificate_id", "policy")
                    if isinstance(record.get("arguments"), Mapping)
                    and record["arguments"].get(name) is not None
                }
            ),
            status="error" if record.get("is_error") else "completed",
            summary=_trace_summary(
                str(record.get("tool", "unknown")),
                record.get("result") if isinstance(record.get("result"), Mapping) else {},
                bool(record.get("is_error")),
            ),
        )
        for record in records
    ]


def _last_result(records: list[dict[str, Any]], tool: str) -> dict[str, Any] | None:
    for record in reversed(records):
        if record.get("tool") == tool and not record.get("is_error"):
            result = record.get("result")
            if isinstance(result, dict):
                return result
    return None


def _known_identifiers(records: list[dict[str, Any]]) -> set[str]:
    rendered = json.dumps(records, sort_keys=True, default=str)
    return {item.lower() for item in _BYTES32_PATTERN.findall(rendered)}


def _model_answer_is_grounded(
    response: AgentResponse,
    records: list[dict[str, Any]],
    deterministic_result: str | None,
) -> bool:
    lowered = response.answer.lower()
    if any(term in lowered for term in (" is safe", " completely safe", "guaranteed safe")):
        return False
    if deterministic_result and response.verification_result not in {
        None,
        deterministic_result,
    }:
        return False
    known_identifiers = _known_identifiers(records)
    answer_identifiers = {item.lower() for item in _BYTES32_PATTERN.findall(response.answer)}
    return answer_identifiers.issubset(known_identifiers)


_REASON_EXPLANATIONS = {
    "MISSING_EVIDENCE": "one or more required policy inputs are absent",
    "STALE_ATTESTATION": "the reserve attestation is older than policy permits",
    "INVALID_EVIDENCE": "a required evidence value is malformed",
    "UNDERCOLLATERALIZED": "reported backing is below the outstanding claim",
    "LOW_COLLATERALIZATION_RATIO": "the collateralization ratio is below policy",
    "INSUFFICIENT_TREASURY_EXPOSURE": "Treasury exposure is below policy",
    "UNVERIFIED_ISSUER_CONTRACT": "the issuer contract is not verified",
    "MISSING_ONCHAIN_SUPPLY": "the required on-chain supply observation is absent",
}


def _fallback_answer(
    verification: Mapping[str, Any] | None,
    certificate: Mapping[str, Any] | None,
    policygate: Mapping[str, Any] | None,
    discovery: Mapping[str, Any] | None,
) -> str:
    if verification:
        outcome = str(verification.get("verification_result", "INDETERMINATE"))
        asset = str(verification.get("asset", "The asset"))
        claim = str(verification.get("claim", "the claim"))
        reasons = [str(value) for value in verification.get("reason_codes", [])]
        answer = f"ProofLayer's deterministic RVC returned {outcome} for {asset} {claim}."
        if reasons:
            explanations = [
                _REASON_EXPLANATIONS.get(reason, reason.replace("_", " ").lower())
                for reason in reasons
            ]
            answer += " The controlling issues are that " + "; and ".join(explanations) + "."
        if certificate:
            answer += (
                " The separately issued on-chain certificate is "
                + str(certificate.get("certificate_status", "UNAVAILABLE")).lower().replace("_", " ")
                + "."
            )
        if policygate:
            answer += (
                " PolicyGate's current read-only assessment is "
                + str(policygate.get("policygate_outcome", "UNAVAILABLE"))
                + "; no protected action was executed."
            )
        return answer
    if discovery:
        assets = discovery.get("assets", [])
        pairs = [
            f"{item.get('asset')} {', '.join(item.get('supported_claims', []))}"
            for item in assets
            if isinstance(item, Mapping)
        ]
        return "ProofLayer currently has deterministic verification support for " + " and ".join(pairs) + "."
    return "The investigation did not return enough authoritative ProofLayer data to answer."


def ground_agent_response(
    model_response: AgentResponse,
    records: list[dict[str, Any]],
) -> AgentResponse:
    """Force authoritative fields and safe trace from actual MCP outputs."""
    verification = _last_result(records, "verify_claim")
    certificate = _last_result(records, "get_certificate_state")
    policygate = _last_result(records, "get_policygate_state")
    discovery = _last_result(records, "discover_assets")

    deterministic_result = (
        str(verification.get("verification_result")) if verification else None
    )
    answer = model_response.answer.strip()
    if not _model_answer_is_grounded(model_response, records, deterministic_result):
        answer = _fallback_answer(verification, certificate, policygate, discovery)
    elif verification:
        authoritative = _fallback_answer(verification, certificate, policygate, None)
        if not answer.startswith(authoritative):
            answer = f"{authoritative} AI interpretation: {answer}"

    return AgentResponse(
        answer=answer,
        asset=(
            str(verification.get("asset"))
            if verification
            else model_response.asset
        ),
        claim=(
            str(verification.get("claim"))
            if verification
            else model_response.claim
        ),
        verification_result=(
            deterministic_result if deterministic_result in {"PASS", "FAIL", "INDETERMINATE"} else None
        ),
        certificate_status=(
            certificate.get("certificate_status") if certificate else None
        ),
        policygate_outcome=(
            policygate.get("policygate_outcome") if policygate else None
        ),
        evidence_root_count=(
            int(verification["evidence_root_count"])
            if verification and verification.get("evidence_root_count") is not None
            else None
        ),
        reason_codes=(
            [str(value) for value in verification.get("reason_codes", [])]
            if verification
            else model_response.reason_codes
        ),
        tools_used=list(dict.fromkeys(str(record.get("tool")) for record in records)),
        trace=_trace(records),
    )


def _json_safe(value: Any) -> Any:
    """Convert tool payloads to JSON-safe values without losing numeric precision."""
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Mapping):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _router_system_prompt(route_hint: str) -> str:
    """Instruct the model to route read-only ProofLayer actions in strict JSON."""
    tool_lines = "\n".join(
        f"- {item['name']}: {item['description']}"
        for item in _TOOL_MANIFEST
    )
    return (
        PROOFLAYER_AGENT_INSTRUCTIONS
        + "\n\n"
        + "You route, you do not execute. A separate executor runs every ProofLayer "
        "tool for you and returns its output as the next user message. All tools "
        "listed below ARE available; never claim one is unavailable. If you need "
        "any data, request it with a tool_call action before answering.\n\n"
        + "Available tools:\n"
        + tool_lines
        + "\n\n"
        + "Reply with exactly ONE strict JSON object and nothing else (no markdown "
        "fences, no prose). Choose exactly one form:\n"
        + '{"type": "tool_call", "tool": "<tool name>", "arguments": {"asset": "USDY"}}\n'
        + '{"type": "final", "answer": "<concise grounded answer>"}\n\n'
        + "Only emit a final answer after you hold the authoritative tool outputs "
        + "needed for the user's question.\n\n"
        + f"Bounded investigation route: {route_hint}"
    )


def _parse_action(content: str) -> dict[str, Any] | None:
    """Extract the single JSON action from model output, tolerating fences/wrapping."""
    text = str(content).strip()
    if text.startswith("```"):
        text = re.sub(r"^```[A-Za-z]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text).strip()
    match = _ACTION_JSON_PATTERN.search(text)
    if match is None:
        return None
    try:
        payload = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    if isinstance(payload, Mapping) and "AgentResponse" in payload:
        payload = payload["AgentResponse"]
    if not isinstance(payload, Mapping):
        return None
    return dict(payload)


def _execute_tool(
    tools: ProofLayerTools,
    name: str,
    arguments: Mapping[str, Any],
) -> tuple[bool, dict[str, Any]]:
    """Validate and run one read-only ProofLayer tool, returning a JSON-safe payload."""
    definition = _TOOL_MANIFEST_BY_NAME.get(name)
    if definition is None:
        return False, {"error": f"unknown tool {name!r}"}
    cleaned: dict[str, str] = {}
    for key, value in arguments.items():
        if not isinstance(key, str):
            return False, {"error": "tool arguments must use string keys"}
        if isinstance(value, bool):
            cleaned[key] = str(value).lower()
        elif isinstance(value, (str, int, float)):
            cleaned[key] = str(value)
        else:
            return False, {"error": f"argument {key!r} must be a string or number"}
    missing = [required for required in definition["required"] if required not in cleaned]
    if missing:
        return False, {"error": f"missing required arguments: {', '.join(missing)}"}
    try:
        result = getattr(tools, name)(**cleaned)
    except Exception as error:
        message = " ".join(str(error).split())
        return False, {"error": f"{type(error).__name__}: {message[:280]}"}
    if isinstance(result, Mapping):
        return True, _json_safe(dict(result))
    return True, {"result": _json_safe(result)}


def _tool_result_message(name: str, ok: bool, payload: dict[str, Any]) -> str:
    rendered = json.dumps(payload, ensure_ascii=False, default=str)
    if len(rendered) > 6_000:
        rendered = rendered[:6_000] + "...(truncated)"
    status = "returned" if ok else "failed"
    return (
        f"Executor result for {name} {status}:\n{rendered}\n\n"
        "Continue: emit another tool_call if you need more data, otherwise emit a final answer."
    )


async def _chat_completion(
    provider: AsyncOpenAI,
    messages: list[dict[str, Any]],
) -> str:
    """One bounded chat-completions call against the configured gateway."""
    response = await provider.chat.completions.create(
        model=configured_model(),
        messages=messages,
        max_tokens=700,
        temperature=0.0,
    )
    try:
        content = response.choices[0].message.content
    except (IndexError, AttributeError) as error:
        raise AgentExecutionError("The model returned no completion.") from error
    if not isinstance(content, str) or not content.strip():
        raise AgentExecutionError("The model returned an empty response.")
    return content


async def run_verification_agent(query: str) -> AgentResponse:
    """Run one bounded, grounded investigation via the configured chat-completions gateway."""
    if not is_agent_configured():
        raise AgentUnavailableError(
            "AI Agent unavailable: configure OPENAI_API_KEY or OPENAI_BASE_URL in the "
            "server environment."
        )

    provider = AsyncOpenAI(
        api_key=configured_api_key(),
        base_url=configured_base_url(),
        timeout=45.0,
    )
    tools = ProofLayerTools()
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": _router_system_prompt(tool_route_hint(query))},
        {"role": "user", "content": f"User query: {query}"},
    ]
    records: list[dict[str, Any]] = []
    final_text: str | None = None
    try:
        async with asyncio.timeout(AGENT_TIMEOUT_SECONDS):
            for _turn in range(configured_max_turns()):
                content = await _chat_completion(provider, messages)
                messages.append({"role": "assistant", "content": content})
                action = _parse_action(content)
                if action is None or action.get("type") not in {"tool_call", "final"}:
                    messages.append({"role": "user", "content": _ROUTER_RETRY_HINT})
                    continue
                if action["type"] == "final":
                    final_text = str(action.get("answer", "")).strip() or None
                    break
                tool_name = str(action.get("tool") or "").strip()
                raw_arguments = action.get("arguments")
                arguments = (
                    dict(raw_arguments) if isinstance(raw_arguments, Mapping) else {}
                )
                ok, payload = _execute_tool(tools, tool_name, arguments)
                records.append(
                    {
                        "tool": tool_name,
                        "arguments": arguments,
                        "result": payload,
                        "is_error": not ok,
                    }
                )
                messages.append(
                    {"role": "user", "content": _tool_result_message(tool_name, ok, payload)}
                )
    except AgentUnavailableError:
        raise
    except Exception as error:
        raise AgentExecutionError(
            "The AI investigation could not complete. No verification result was fabricated."
        ) from error

    if not records:
        raise AgentExecutionError(
            "The investigation finished without using any ProofLayer tool. "
            "No verification result was fabricated."
        )
    return ground_agent_response(AgentResponse(answer=final_text or ""), records)


__all__ = [
    "AgentExecutionError",
    "AgentUnavailableError",
    "configured_api_key",
    "configured_base_url",
    "configured_max_turns",
    "configured_model",
    "ground_agent_response",
    "is_agent_configured",
    "run_verification_agent",
    "tool_route_hint",
]
