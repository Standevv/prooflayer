"""Markets V1 data models."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class AssetCategory(str, Enum):
    STABLECOIN = "stablecoin"
    WRAPPED_NATIVE = "wrapped_native"
    WRAPPED_CRYPTO = "wrapped_crypto"
    GOVERNANCE = "governance"
    YIELD_BEARING = "yield_bearing"
    OTHER = "other"


class MarketAsset(BaseModel):
    """A tradeable asset on X Layer Mainnet."""

    model_config = ConfigDict(extra="forbid")

    address: str
    symbol: str
    name: str
    decimals: int
    category: AssetCategory
    chain_id: int = 196
    network: str = "X Layer Mainnet"
    total_supply: Optional[str] = None
    wallet_supported: bool = True
    prooflayer_verification_available: bool = False
    prooflayer_verification_result: Optional[str] = None
    aave_available: bool = False
    observed_at: str = Field(description="ISO-8601 timestamp of data retrieval")


class EarnOpportunity(BaseModel):
    """A real Aave V3 supply opportunity on X Layer."""

    model_config = ConfigDict(extra="forbid")

    asset: str
    symbol: str
    asset_address: str
    protocol: str = "Aave V3"
    supply_apy: Optional[float] = Field(
        default=None, description="Supply APY as decimal (e.g. 0.031 = 3.1%)"
    )
    supply_apy_display: Optional[str] = None
    total_supplied_usd: Optional[float] = None
    available_liquidity: Optional[str] = None
    available_liquidity_usd: Optional[float] = None
    utilization: Optional[float] = Field(
        default=None, description="Utilization as decimal"
    )
    collateral_enabled: bool = False
    supply_cap: Optional[str] = None
    source: str = "Aave V3 / X Layer"
    chain_id: int = 196
    observed_at: str


class BorrowOpportunity(BaseModel):
    """A real Aave V3 borrow opportunity on X Layer."""

    model_config = ConfigDict(extra="forbid")

    asset: str
    symbol: str
    asset_address: str
    protocol: str = "Aave V3"
    borrow_apy: Optional[float] = Field(
        default=None, description="Variable borrow APY as decimal"
    )
    borrow_apy_display: Optional[str] = None
    available_liquidity: Optional[str] = None
    available_liquidity_usd: Optional[float] = None
    borrow_cap: Optional[str] = None
    collateral_requirements: Optional[str] = None
    ltv: Optional[float] = Field(default=None, description="LTV as decimal (0.70 = 70%)")
    liquidation_threshold: Optional[float] = None
    borrowable: bool = False
    source: str = "Aave V3 / X Layer"
    chain_id: int = 196
    observed_at: str


class SwapQuote(BaseModel):
    """A read-only Uniswap V3 quote on X Layer."""

    model_config = ConfigDict(extra="forbid")

    token_in: str
    token_out: str
    symbol_in: str
    symbol_out: str
    amount_in: str
    amount_out: Optional[str] = None
    minimum_received: Optional[str] = None
    fee_tier: Optional[str] = None
    estimated_price_impact: Optional[str] = None
    route: Optional[str] = None
    source: str = "Uniswap V3 / X Layer"
    chain_id: int = 196
    available: bool = True
    error: Optional[str] = None
    observed_at: str


class MarketOverview(BaseModel):
    """Combined market intelligence for the frontend."""

    model_config = ConfigDict(extra="forbid")

    chain_id: int = 196
    network: str = "X Layer Mainnet"
    assets: list[MarketAsset] = []
    earn_opportunities: list[EarnOpportunity] = []
    borrow_opportunities: list[BorrowOpportunity] = []
    protocols: list[dict] = []
    observed_at: str


class SwapQuoteRequest(BaseModel):
    """Request body for read-only swap quote."""

    model_config = ConfigDict(extra="forbid")

    token_in: str
    token_out: str
    amount: str


# ── Markets AI Intelligence ──────────────────────────────────────────


class MarketIntelligenceRequest(BaseModel):
    """Request body for the Markets AI intelligence endpoint.

    The query is a natural-language question about X Layer Mainnet markets,
    assets, DeFi opportunities, or market conditions. The AI response is
    grounded with authoritative data collected from existing read-only
    ProofLayer market services.
    """

    model_config = ConfigDict(extra="forbid")

    query: str = Field(..., min_length=3, max_length=2_000, description="Natural-language market question")


class MarketIntelligenceTrace(BaseModel):
    """One data-collection step used to ground the AI response."""

    model_config = ConfigDict(extra="forbid")

    source: str
    status: str
    record_count: int = 0
    summary: str


class MarketIntelligenceResponse(BaseModel):
    """Grounded AI response for a market intelligence query.

    Every answer is composed from authoritative market data collected
    server-side. The AI model synthesizes the data into natural language
    but cannot fabricate values not present in the grounding context.
    """

    model_config = ConfigDict(extra="forbid")

    answer: str
    query: str
    data_sources: list[str] = Field(default_factory=list)
    trace: list[MarketIntelligenceTrace] = Field(default_factory=list)
    observed_at: str
