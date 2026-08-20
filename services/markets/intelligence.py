"""Market AI Intelligence — grounded natural-language market analysis.

Collects authoritative data from existing read-only ProofLayer market
services and passes it as grounding context to the configured AI provider.
The model synthesizes natural language from the data but cannot fabricate
values not present in the grounding payload.

No wallet writes. No transaction execution. Read-only.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

import openai
from openai import AsyncOpenAI

from services.agent.verification_agent import (
    AgentExecutionError,
    AgentUnavailableError,
    configured_api_key,
    configured_base_url,
    configured_model,
    configured_provider_name,
    is_agent_configured,
)
from services.markets.aave.reader import get_borrow_opportunities, get_earn_opportunities
from services.markets.models import (
    MarketIntelligenceRequest,
    MarketIntelligenceResponse,
    MarketIntelligenceTrace,
)
from services.markets.trust import (
    MarketComparisonRequest,
    MarketComparisonResponse,
    build_comparison_grounding,
    get_market_trust,
)
from services.markets.xlayer.assets import get_all_assets

logger = logging.getLogger(__name__)

_MODEL_CALL_TIMEOUT_SECONDS = 45.0
_MAX_TURNS = 1
_SYSTEM_PROMPT = """You are the ProofLayer Market Intelligence assistant. You answer questions about X Layer Mainnet markets, assets, DeFi opportunities, and market conditions.

You are given authoritative market data collected server-side from ProofLayer read-only services. Use ONLY the data provided in the grounding context. Never fabricate values, APYs, addresses, or market conditions not present in the data.

Rules:
1. Base every factual claim on the grounding data provided. If data is missing, say so.
2. Never invent APYs, TVL, prices, or addresses.
3. Distinguish between on-chain data and supplementary sources (e.g. DeFi Llama TVL).
4. Keep the response concise and plain-English.
5. If the query concerns assets not in the grounding data, say they are not available.
6. Do not make investment recommendations or risk assessments.
7. Return only the answer text — no JSON, no tool calls."""


_COMPARISON_SYSTEM_PROMPT = """You are the ProofLayer Market Intelligence assistant. You compare two X Layer Mainnet assets side-by-side using authoritative data.

You are given market data and ProofLayer verification data for two assets. Use ONLY the data provided. Never fabricate values.

You MUST structure your response with these exact sections, each on its own line:

MARKET COMPARISON
- Compare: supply APY, borrow APY, LTV, liquidation threshold, available liquidity, collateral status
- Use exact values from the data

VERIFICATION COMPARISON
- Compare: RVC result, reason codes, evidence coverage, certificate state, certificate usability, PolicyGate state, freshness state, limitations
- Use exact values from the data

TRADE-OFFS
- Identify concrete differences between the two assets
- Reference specific data points (APY differences, verification status differences)

RISKS
- Note what data is available vs missing
- Note verification limitations or stale data
- Never call either asset "safe", "guaranteed", or "approved"
- Never say either asset is "risk-free" or "low risk"

DATA LIMITATIONS
- Note what data was not available for comparison
- Note any verification gaps
- Note data freshness concerns

Rules:
1. Never call either asset "safe", "guaranteed", or "approved".
2. Never use the words "safe", "guaranteed", "approved", or "risk-free".
3. Keep the response factual and data-driven.
4. Use the exact section headings above.
5. Return only the structured comparison — no JSON, no tool calls."""


def _collect_market_context() -> tuple[
    dict[str, Any],
    dict[str, Any],
    dict[str, Any],
    list[str],
    list[MarketIntelligenceTrace],
]:
    """Collect authoritative market data from existing services.

    Returns (assets_ctx, earn_ctx, borrow_ctx, sources_used, trace).
    Each context dict is JSON-serializable and safe to send to the model.
    """
    sources: list[str] = []
    trace: list[MarketIntelligenceTrace] = []
    now = datetime.now(timezone.utc).isoformat()

    # Assets
    assets_ctx: dict[str, Any] = {"assets": [], "total": 0}
    try:
        assets = get_all_assets()
        assets_ctx = {
            "assets": [
                {
                    "symbol": a.symbol,
                    "name": a.name,
                    "address": a.address,
                    "decimals": a.decimals,
                    "category": a.category.value,
                    "total_supply": a.total_supply,
                    "aave_available": a.aave_available,
                }
                for a in assets
            ],
            "total": len(assets),
            "chain_id": 196,
            "network": "X Layer Mainnet",
            "observed_at": now,
        }
        sources.append("xlayer_assets")
        trace.append(MarketIntelligenceTrace(
            source="xlayer_assets",
            status="ok",
            record_count=len(assets),
            summary=f"Loaded {len(assets)} verified X Layer Mainnet assets.",
        ))
    except Exception as exc:
        logger.warning("Asset collection failed: %s", type(exc).__name__)
        trace.append(MarketIntelligenceTrace(
            source="xlayer_assets",
            status="error",
            record_count=0,
            summary=f"Asset collection failed: {type(exc).__name__}.",
        ))

    # Aave earn
    earn_ctx: dict[str, Any] = {"opportunities": [], "total": 0}
    try:
        earn = get_earn_opportunities()
        earn_ctx = {
            "opportunities": [
                {
                    "asset": o.asset,
                    "symbol": o.symbol,
                    "supply_apy": o.supply_apy,
                    "supply_apy_display": o.supply_apy_display,
                    "total_supplied_usd": o.total_supplied_usd,
                    "available_liquidity": o.available_liquidity,
                    "collateral_enabled": o.collateral_enabled,
                    "source": o.source,
                }
                for o in earn
            ],
            "total": len(earn),
            "chain_id": 196,
            "observed_at": now,
        }
        sources.append("aave_earn")
        trace.append(MarketIntelligenceTrace(
            source="aave_earn",
            status="ok",
            record_count=len(earn),
            summary=f"Loaded {len(earn)} Aave V3 supply opportunities.",
        ))
    except Exception as exc:
        logger.warning("Earn collection failed: %s", type(exc).__name__)
        trace.append(MarketIntelligenceTrace(
            source="aave_earn",
            status="error",
            record_count=0,
            summary=f"Earn collection failed: {type(exc).__name__}.",
        ))

    # Aave borrow
    borrow_ctx: dict[str, Any] = {"opportunities": [], "total": 0}
    try:
        borrow = get_borrow_opportunities()
        borrow_ctx = {
            "opportunities": [
                {
                    "asset": o.asset,
                    "symbol": o.symbol,
                    "borrow_apy": o.borrow_apy,
                    "borrow_apy_display": o.borrow_apy_display,
                    "available_liquidity": o.available_liquidity,
                    "ltv": o.ltv,
                    "liquidation_threshold": o.liquidation_threshold,
                    "borrowable": o.borrowable,
                    "collateral_requirements": o.collateral_requirements,
                    "source": o.source,
                }
                for o in borrow
            ],
            "total": len(borrow),
            "chain_id": 196,
            "observed_at": now,
        }
        sources.append("aave_borrow")
        trace.append(MarketIntelligenceTrace(
            source="aave_borrow",
            status="ok",
            record_count=len(borrow),
            summary=f"Loaded {len(borrow)} Aave V3 borrow opportunities.",
        ))
    except Exception as exc:
        logger.warning("Borrow collection failed: %s", type(exc).__name__)
        trace.append(MarketIntelligenceTrace(
            source="aave_borrow",
            status="error",
            record_count=0,
            summary=f"Borrow collection failed: {type(exc).__name__}.",
        ))

    return assets_ctx, earn_ctx, borrow_ctx, sources, trace


def _build_grounding_context(
    assets_ctx: dict[str, Any],
    earn_ctx: dict[str, Any],
    borrow_ctx: dict[str, Any],
) -> str:
    """Build the grounding context string for the model."""
    parts = [
        "=== X Layer Mainnet Market Data ===",
        "",
        "--- Assets ---",
        json.dumps(assets_ctx, indent=2, default=str),
        "",
        "--- Aave V3 Supply Opportunities ---",
        json.dumps(earn_ctx, indent=2, default=str),
        "",
        "--- Aave V3 Borrow Opportunities ---",
        json.dumps(borrow_ctx, indent=2, default=str),
    ]
    return "\n".join(parts)


async def run_market_intelligence(
    request: MarketIntelligenceRequest,
) -> MarketIntelligenceResponse:
    """Run one grounded market intelligence query via the configured AI provider.

    Collects authoritative market data, passes it as context to the model,
    and returns the synthesized answer. The model cannot fabricate values
    not present in the grounding payload.
    """
    if not is_agent_configured():
        raise AgentUnavailableError(
            "Market AI unavailable: configure the provider key (e.g. NVIDIA_API_KEY "
            "for the nvidia provider) or AI_API_KEY in the server environment."
        )

    now = datetime.now(timezone.utc).isoformat()

    # Step 1: Collect authoritative market data
    assets_ctx, earn_ctx, borrow_ctx, sources, trace = _collect_market_context()

    # Step 2: Build grounding context
    grounding = _build_grounding_context(assets_ctx, earn_ctx, borrow_ctx)

    # Step 3: Call the AI provider
    provider = AsyncOpenAI(
        api_key=configured_api_key(),
        base_url=configured_base_url(),
        timeout=_MODEL_CALL_TIMEOUT_SECONDS,
        max_retries=1,
    )

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Market data grounding context:\n\n{grounding}\n\n"
                f"User query: {request.query}"
            ),
        },
    ]

    try:
        response = await provider.chat.completions.create(
            model=configured_model(),
            messages=messages,
            max_tokens=700,
            temperature=0.0,
            timeout=_MODEL_CALL_TIMEOUT_SECONDS,
        )
        if not response.choices:
            raise AgentExecutionError("The model returned no completion.")
        answer = response.choices[0].message.content or ""
        answer = answer.strip()
        if not answer:
            answer = (
                "The market intelligence query could not produce an answer from "
                "the available data. No market data was fabricated."
            )
    except AgentExecutionError:
        raise
    except Exception as exc:
        logger.error("Market intelligence AI call failed: %s", type(exc).__name__)
        raise AgentExecutionError(
            "The market intelligence query could not complete. "
            f"Provider error: {type(exc).__name__}."
        ) from exc

    return MarketIntelligenceResponse(
        answer=answer,
        query=request.query,
        data_sources=sources,
        trace=trace,
        observed_at=now,
    )


async def run_market_comparison(
    request: MarketComparisonRequest,
) -> MarketComparisonResponse:
    """Run an AI-grounded comparison of two X Layer assets.

    Collects trust data for both assets, builds comparison grounding,
    and returns a structured AI comparison. Read-only, no transactions.
    """
    if not is_agent_configured():
        raise AgentUnavailableError(
            "Market AI unavailable: configure the provider key (e.g. NVIDIA_API_KEY "
            "for the nvidia provider) or AI_API_KEY in the server environment."
        )

    now = datetime.now(timezone.utc).isoformat()

    # Collect trust data for both assets
    trust_a = get_market_trust(request.asset_a)
    trust_b = get_market_trust(request.asset_b)

    if trust_a is None:
        raise AgentExecutionError(
            f"Asset {request.asset_a} not found in X Layer Mainnet asset registry."
        )
    if trust_b is None:
        raise AgentExecutionError(
            f"Asset {request.asset_b} not found in X Layer Mainnet asset registry."
        )

    # Build comparison grounding
    grounding = build_comparison_grounding(trust_a, trust_b)

    # Collect data sources
    sources: list[str] = ["xlayer_assets", "aave_earn", "aave_borrow", "prooflayer_verification"]

    # Call the AI provider
    provider = AsyncOpenAI(
        api_key=configured_api_key(),
        base_url=configured_base_url(),
        timeout=_MODEL_CALL_TIMEOUT_SECONDS,
        max_retries=1,
    )

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": _COMPARISON_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Comparison grounding context:\n\n{grounding}\n\n"
                f"Compare {trust_a.symbol} and {trust_b.symbol} using the data above."
            ),
        },
    ]

    try:
        response = await provider.chat.completions.create(
            model=configured_model(),
            messages=messages,
            max_tokens=1_200,
            temperature=0.0,
            timeout=_MODEL_CALL_TIMEOUT_SECONDS,
        )
        if not response.choices:
            raise AgentExecutionError("The model returned no completion.")
        answer = response.choices[0].message.content or ""
        answer = answer.strip()
        if not answer:
            answer = (
                "The comparison could not produce an answer from the available data. "
                "No market data was fabricated."
            )
    except AgentExecutionError:
        raise
    except Exception as exc:
        logger.error("Market comparison AI call failed: %s", type(exc).__name__)
        raise AgentExecutionError(
            "The market comparison query could not complete. "
            f"Provider error: {type(exc).__name__}."
        ) from exc

    return MarketComparisonResponse(
        answer=answer,
        asset_a=trust_a,
        asset_b=trust_b,
        data_sources=sources,
        observed_at=now,
    )
