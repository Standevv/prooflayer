"""Markets V1 aggregator — combines Aave, Uniswap, and asset registry."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from services.markets.models import MarketOverview
from services.markets.aave.reader import get_borrow_opportunities, get_earn_opportunities
from services.markets.xlayer.assets import get_all_assets

logger = logging.getLogger(__name__)


def get_market_overview() -> MarketOverview:
    """Aggregate all X Layer Mainnet market intelligence into one response.

    Every value has a source and timestamp. If a data source fails,
    the relevant section is empty rather than fabricated.
    """
    now = datetime.now(timezone.utc).isoformat()

    try:
        assets = get_all_assets()
    except Exception as exc:
        logger.warning("Asset registry failed: %s", type(exc).__name__)
        assets = []

    try:
        earn = get_earn_opportunities()
    except Exception as exc:
        logger.warning("Aave earn fetch failed: %s", type(exc).__name__)
        earn = []

    try:
        borrow = get_borrow_opportunities()
    except Exception as exc:
        logger.warning("Aave borrow fetch failed: %s", type(exc).__name__)
        borrow = []

    protocols = [
        {
            "name": "Aave V3",
            "chain_id": 196,
            "network": "X Layer Mainnet",
            "pool": "0xE3F3Caefdd7180F884c01E57f65Df979Af84f116",
            "status": "active" if earn else "unavailable",
        },
        {
            "name": "Uniswap V3",
            "chain_id": 196,
            "network": "X Layer Mainnet",
            "factory": "0x4B2ab38DBF28D31D467aA8993f6c2585981D6804",
            "status": "active",
        },
    ]

    return MarketOverview(
        chain_id=196,
        network="X Layer Mainnet",
        assets=assets,
        earn_opportunities=earn,
        borrow_opportunities=borrow,
        protocols=protocols,
        observed_at=now,
    )
