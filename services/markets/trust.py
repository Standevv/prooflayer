"""Market Trust Layer — verification coverage for every X Layer asset.

Combines market state with ProofLayer verification state to give users
a clear view of both financial opportunity and trust/evidence context.

No wallet writes. No AI authority. Read-only.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)

# Verification claims for market assets.
#
# IMPORTANT: Only include addresses where ProofLayer has asset-specific
# authoritative evidence. USDT0 and USDG are NOT USDY/PAXG — they are
# distinct X Layer market assets with no ProofLayer verification claim.
# Including them here would fabricate a verification association.
#
# USDY (0x96F6...985C) and PAXG (0x4580...Af78) are cross-chain reference
# assets verified via Ethereum mainnet reads. They are NOT X Layer market
# assets and their addresses do not appear in the Markets asset registry.
_VERIFICATION_CLAIMS: dict[str, str] = {
    # No X Layer market assets currently have ProofLayer verification claims.
    # Market data (APY, LTV, liquidity) is independent of verification.
}


class VerificationCoverage(BaseModel):
    """Display-facing verification coverage for a market asset."""

    model_config = ConfigDict(extra="forbid")

    asset_address: str
    symbol: str
    verification_available: bool = False
    verification_status: str = "UNVERIFIED"
    verification_result: Optional[str] = None
    rvc_result: Optional[str] = None
    reason_codes: list[str] = Field(default_factory=list)
    certificate_state: Optional[str] = None
    certificate_usable: Optional[bool] = None
    policygate_state: Optional[str] = None
    evidence_roots: Optional[int] = None
    evidence_count: Optional[int] = None
    freshness_state: str = "UNKNOWN"
    limitations: list[str] = Field(default_factory=list)
    observed_at: str = Field(description="ISO-8601 timestamp")


class MarketTrustResponse(BaseModel):
    """Full trust context for a market asset."""

    model_config = ConfigDict(extra="forbid")

    asset_address: str
    symbol: str
    name: str
    category: str

    # Market state
    market_active: bool = False
    aave_available: bool = False
    supply_apy: Optional[float] = None
    supply_apy_display: Optional[str] = None
    borrow_apy: Optional[float] = None
    borrow_apy_display: Optional[str] = None
    available_liquidity: Optional[str] = None
    collateral_enabled: Optional[bool] = None
    ltv: Optional[float] = None
    liquidation_threshold: Optional[float] = None

    # Verification state
    verification_coverage: VerificationCoverage

    # Raw authoritative values (NEVER fabricated)
    raw_rvc_result: Optional[str] = None
    raw_certificate_state: Optional[str] = None
    raw_certificate_usable: Optional[bool] = None
    raw_policygate_outcome: Optional[str] = None
    raw_reason_codes: list[str] = Field(default_factory=list)
    raw_evidence_root_count: Optional[int] = None

    observed_at: str


def get_verification_coverage(
    asset_address: str,
    symbol: str,
) -> VerificationCoverage:
    """Get verification coverage for a single asset.

    Returns a normalized display state while preserving raw authoritative values.
    Only assets with ProofLayer asset-specific evidence get verification coverage.
    Market data (APY, LTV, liquidity) is independent of verification status.
    """
    now = datetime.now(timezone.utc).isoformat()
    addr_lower = asset_address.lower()

    claim = _VERIFICATION_CLAIMS.get(addr_lower)
    if claim is None:
        return VerificationCoverage(
            asset_address=asset_address,
            symbol=symbol,
            verification_available=False,
            verification_status="UNVERIFIED",
            limitations=[
                "No deterministic ProofLayer verification claim is currently "
                "available for this asset."
            ],
            observed_at=now,
        )

    # If a claim exists, run the RVC verification.
    # This path is currently unreachable (no claims in _VERIFICATION_CLAIMS)
    # but is preserved for when asset-specific evidence is added.
    try:
        from services.rvc import verify_claim as rvc_verify
        evidence = rvc_verify(symbol, claim)
        return VerificationCoverage(
            asset_address=asset_address,
            symbol=symbol,
            verification_available=True,
            verification_status="VERIFIED" if evidence.result == "PASS" else "INDETERMINATE",
            rvc_result=evidence.result,
            reason_codes=evidence.reason_codes,
            evidence_roots=evidence.evidence_root_count,
            observed_at=now,
        )
    except Exception as exc:
        logger.debug("RVC verification failed for %s/%s: %s", symbol, claim, exc)
        return VerificationCoverage(
            asset_address=asset_address,
            symbol=symbol,
            verification_available=False,
            verification_status="INDETERMINATE",
            limitations=[f"Verification claim exists but RVC execution failed: {type(exc).__name__}"],
            observed_at=now,
        )


# -- AI Comparison --


class MarketComparisonRequest(BaseModel):
    """Request to compare two X Layer assets via AI."""

    model_config = ConfigDict(extra="forbid")

    asset_a: str = Field(..., description="Contract address of first asset")
    asset_b: str = Field(..., description="Contract address of second asset")


class MarketComparisonResponse(BaseModel):
    """AI-grounded comparison of two X Layer assets."""

    model_config = ConfigDict(extra="forbid")

    answer: str
    asset_a: MarketTrustResponse
    asset_b: MarketTrustResponse
    data_sources: list[str] = Field(default_factory=list)
    observed_at: str


def build_comparison_grounding(
    trust_a: MarketTrustResponse,
    trust_b: MarketTrustResponse,
) -> str:
    """Build grounding context for AI comparison from two trust responses."""

    def _asset_block(trust: MarketTrustResponse) -> str:
        vc = trust.verification_coverage
        lines = [
            f"Symbol: {trust.symbol}",
            f"Name: {trust.name}",
            f"Category: {trust.category}",
            f"Address: {trust.asset_address}",
            "",
            "Market Data:",
            f"  Supply APY: {trust.supply_apy_display or 'N/A'}",
            f"  Borrow APY: {trust.borrow_apy_display or 'N/A'}",
            f"  Available Liquidity: {trust.available_liquidity or 'N/A'}",
            f"  Collateral Enabled: {trust.collateral_enabled}",
            f"  LTV: {trust.ltv}",
            f"  Liquidation Threshold: {trust.liquidation_threshold}",
            f"  Aave Available: {trust.aave_available}",
            "",
            "Verification Data:",
            f"  Verification Status (display): {vc.verification_status}",
            f"  RVC Result (raw): {vc.rvc_result or 'N/A'}",
            f"  Reason Codes: {vc.reason_codes or 'none'}",
            f"  Certificate State: {vc.certificate_state or 'N/A'}",
            f"  Certificate Usable: {vc.certificate_usable}",
            f"  PolicyGate State: {vc.policygate_state or 'N/A'}",
            f"  Evidence Roots: {vc.evidence_roots or 'N/A'}",
            f"  Freshness: {vc.freshness_state}",
            f"  Limitations: {vc.limitations or 'none'}",
        ]
        return "\n".join(lines)

    return "\n\n".join([
        "=== ASSET A ===",
        _asset_block(trust_a),
        "",
        "=== ASSET B ===",
        _asset_block(trust_b),
    ])

    # For supported assets, try to get live verification state
    try:
        from services.verified_markets.eligibility import MarketEligibilityEvaluator
        from services.verified_markets.models import MarketEligibilityRequest

        evaluator = MarketEligibilityEvaluator()
        # Map symbol to supported asset
        asset_symbol = _symbol_from_address(addr_lower)
        if asset_symbol and asset_symbol in ("USDY", "PAXG"):
            request = MarketEligibilityRequest(asset=asset_symbol, action="swap")
            result = evaluator.check(request)

            verification_result = result.verification_result
            reason_codes = result.reason_codes
            certificate_state = result.certificate_state
            certificate_usable = result.certificate_usable
            policygate_outcome = result.policygate_outcome

            # Determine display status from raw authoritative values
            verification_status = _display_status(
                verification_result=verification_result,
                certificate_state=certificate_state,
                policygate_outcome=policygate_outcome,
            )

            # Determine freshness
            freshness = _freshness_from_reasons(reason_codes)

            limitations: list[str] = []
            if verification_result == "INDETERMINATE":
                limitations.append("Verification returned INDETERMINATE — evidence could not be fully evaluated.")
            if verification_result == "FAIL":
                limitations.append("Verification returned FAIL — at least one predicate explicitly failed.")
            if certificate_state in ("EXPIRED", "REVOKED", "REGISTERED_UNUSABLE"):
                limitations.append(f"Certificate state is {certificate_state}.")
            if policygate_outcome == "BLOCKED":
                limitations.append("PolicyGate blocks this asset for the intended action.")
            if policygate_outcome == "UNAVAILABLE":
                limitations.append("PolicyGate state could not be read from chain.")

            return VerificationCoverage(
                asset_address=asset_address,
                symbol=symbol,
                verification_available=True,
                verification_status=verification_status,
                verification_result=verification_result,
                rvc_result=verification_result,
                reason_codes=reason_codes,
                certificate_state=certificate_state,
                certificate_usable=certificate_usable,
                policygate_state=policygate_outcome,
                evidence_roots=None,
                evidence_count=None,
                freshness_state=freshness,
                limitations=limitations,
                observed_at=now,
            )
    except Exception as exc:
        logger.debug("Verification lookup failed for %s: %s", symbol, type(exc).__name__)

    # Fallback: verification framework exists but data unavailable
    return VerificationCoverage(
        asset_address=asset_address,
        symbol=symbol,
        verification_available=True,
        verification_status="INDETERMINATE",
        limitations=["Verification data temporarily unavailable."],
        observed_at=now,
    )


def _display_status(
    verification_result: str | None,
    certificate_state: str | None,
    policygate_outcome: str | None,
) -> str:
    """Map raw authoritative values to a display status.

    These are DISPLAY STATES ONLY — they do not overwrite the raw values.
    """
    if verification_result == "PASS" and certificate_state == "USABLE" and policygate_outcome == "ALLOWED":
        return "VERIFIED"
    if verification_result == "FAIL":
        if certificate_state == "EXPIRED":
            return "STALE"
        return "BLOCKED"
    if verification_result == "INDETERMINATE":
        return "INDETERMINATE"
    if certificate_state in ("EXPIRED", "REVOKED"):
        return "STALE"
    if policygate_outcome == "BLOCKED":
        return "BLOCKED"
    if verification_result is None and certificate_state is None:
        return "UNVERIFIED"
    return "PARTIAL_COVERAGE"


def _freshness_from_reasons(reason_codes: list[str]) -> str:
    """Determine evidence freshness from RVC reason codes."""
    if "STALE_ATTESTATION" in reason_codes:
        return "STALE"
    if "FUTURE_ATTESTATION" in reason_codes or "FUTURE_EVIDENCE" in reason_codes:
        return "STALE"
    if reason_codes:
        return "AGING"
    return "CURRENT"


def _symbol_from_address(addr_lower: str) -> str | None:
    """Map address to verification-supported symbol."""
    _ADDR_TO_SYMBOL = {
        "0x779ded0c9e1022225f8e0630b35a9b54be713736": "USDY",
        "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8": "PAXG",
    }
    return _ADDR_TO_SYMBOL.get(addr_lower)


def get_market_trust(asset_address: str) -> MarketTrustResponse | None:
    """Get full trust context for a market asset.

    Combines market state with verification state. Returns None if asset not found.
    """
    from services.markets.xlayer.assets import get_asset_by_address, get_symbol_for_address
    from services.markets.aave.reader import get_earn_opportunities, get_borrow_opportunities

    now = datetime.now(timezone.utc).isoformat()

    # Get market asset
    asset = get_asset_by_address(asset_address)
    if asset is None:
        return None

    symbol = asset.symbol

    # Get Aave data if available
    supply_apy = None
    supply_apy_display = None
    borrow_apy = None
    borrow_apy_display = None
    available_liquidity = None
    collateral_enabled = None
    ltv = None
    liquidation_threshold = None

    try:
        earn_opps = get_earn_opportunities()
        for opp in earn_opps:
            if opp.asset_address.lower() == asset_address.lower():
                supply_apy = opp.supply_apy
                supply_apy_display = opp.supply_apy_display
                available_liquidity = opp.available_liquidity
                collateral_enabled = opp.collateral_enabled
                break

        borrow_opps = get_borrow_opportunities()
        for opp in borrow_opps:
            if opp.asset_address.lower() == asset_address.lower():
                borrow_apy = opp.borrow_apy
                borrow_apy_display = opp.borrow_apy_display
                ltv = opp.ltv
                liquidation_threshold = opp.liquidation_threshold
                if available_liquidity is None:
                    available_liquidity = opp.available_liquidity
                break
    except Exception as exc:
        logger.debug("Aave data lookup failed for %s: %s", symbol, type(exc).__name__)

    # Get verification coverage
    verification = get_verification_coverage(asset_address, symbol)

    return MarketTrustResponse(
        asset_address=asset_address,
        symbol=symbol,
        name=asset.name,
        category=asset.category.value,
        market_active=asset.aave_available,
        aave_available=asset.aave_available,
        supply_apy=supply_apy,
        supply_apy_display=supply_apy_display,
        borrow_apy=borrow_apy,
        borrow_apy_display=borrow_apy_display,
        available_liquidity=available_liquidity,
        collateral_enabled=collateral_enabled,
        ltv=ltv,
        liquidation_threshold=liquidation_threshold,
        verification_coverage=verification,
        raw_rvc_result=verification.rvc_result,
        raw_certificate_state=verification.certificate_state,
        raw_certificate_usable=verification.certificate_usable,
        raw_policygate_outcome=verification.policygate_state,
        raw_reason_codes=verification.reason_codes,
        raw_evidence_root_count=verification.evidence_roots,
        observed_at=now,
    )
