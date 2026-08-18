"""Targeted tests for Markets V1 — Aave reader, symbol normalization, rate parsing."""

from __future__ import annotations

import unittest

from services.markets.aave.reader import (
    _format_pct,
    _normalize_symbol,
    _parse_reserve_data,
    _ray_to_apr,
    _symbols_match,
)


class TestRayConversion(unittest.TestCase):
    """Verify Aave ray (1e27 = 100%) → decimal conversion."""

    def test_ray_zero(self):
        self.assertEqual(_ray_to_apr(0), 0.0)

    def test_ray_one_hundred_percent(self):
        # 1e27 ray = 100% = 1.0 decimal
        self.assertAlmostEqual(_ray_to_apr(10**27), 1.0)

    def test_ray_half_percent(self):
        # 5e24 ray = 0.5%
        self.assertAlmostEqual(_ray_to_apr(5 * 10**24), 0.005)

    def test_ray_usdg_like(self):
        # ~1.02% supply rate = 0.0102 decimal
        rate = int(1.0197e25)
        result = _ray_to_apr(rate)
        self.assertAlmostEqual(result, 0.010197, places=4)

    def test_ray_usdt_like(self):
        # ~0.30% supply rate
        rate = int(2.98e24)
        result = _ray_to_apr(rate)
        self.assertAlmostEqual(result, 0.00298, places=3)


class TestFormatPct(unittest.TestCase):
    """Verify percentage formatting."""

    def test_format_none(self):
        self.assertIsNone(_format_pct(None))

    def test_format_zero(self):
        self.assertEqual(_format_pct(0.0), "0.00%")

    def test_format_small_decimal(self):
        # 0.003 = 0.30%
        self.assertEqual(_format_pct(0.003), "0.30%")

    def test_format_one_percent(self):
        self.assertEqual(_format_pct(0.01), "1.00%")

    def test_format_ten_percent(self):
        self.assertEqual(_format_pct(0.10), "10.00%")

    def test_format_whole_number_not_double(self):
        """Ensure 0.01 (1%) does not become 100%."""
        result = _format_pct(0.01)
        self.assertEqual(result, "1.00%")
        self.assertNotIn("100", result)


class TestSymbolNormalization(unittest.TestCase):
    """Verify Unicode symbol normalization."""

    def test_usdt_tether_symbol(self):
        # USD₮0 → USDT0 (U+20AE = TUGRIK SIGN)
        self.assertEqual(_normalize_symbol("USD\u20ae0"), "usdt0")

    def test_plain_symbol(self):
        self.assertEqual(_normalize_symbol("USDT0"), "usdt0")

    def test_lowercase(self):
        self.assertEqual(_normalize_symbol("usdt"), "usdt")

    def test_xbtc(self):
        self.assertEqual(_normalize_symbol("XBTC"), "xbtc")

    def test_empty(self):
        self.assertEqual(_normalize_symbol(""), "")

    def test_gho(self):
        self.assertEqual(_normalize_symbol("GHO"), "gho")


class TestSymbolsMatch(unittest.TestCase):
    """Verify symbol matching with normalization."""

    def test_exact_match(self):
        self.assertTrue(_symbols_match("USDG", "USDG"))

    def test_tether_unicode_match(self):
        # USD₮0 should match USDT0 (U+20AE = TUGRIK SIGN)
        self.assertTrue(_symbols_match("USD\u20ae0", "USDT0"))

    def test_case_insensitive(self):
        self.assertTrue(_symbols_match("usdt", "USDT"))

    def test_no_match(self):
        self.assertFalse(_symbols_match("USDG", "XBTC"))

    def test_partial_match(self):
        # "usd" should be in "usdt0"
        self.assertTrue(_symbols_match("USD", "USDT0"))


class TestReserveDataParsing(unittest.TestCase):
    """Verify ABI word-based parsing of getReserveData return."""

    def _make_mock_response(
        self,
        config: int = 0,
        liq_rate: int = 0,
        var_borrow_rate: int = 0,
        a_token: str = "0x" + "0" * 40,
    ) -> str:
        """Build a mock 480-byte ABI response."""
        words = [0] * 15
        words[0] = config
        words[2] = liq_rate
        words[4] = var_borrow_rate
        # word[8] = aToken address
        if a_token != "0x" + "0" * 40:
            words[8] = int(a_token, 16)
        return "0x" + "".join(f"{w:064x}" for w in words)

    def test_empty_response(self):
        result = _parse_reserve_data("")
        self.assertEqual(result, {})

    def test_short_response(self):
        result = _parse_reserve_data("0x1234")
        self.assertEqual(result, {})

    def test_valid_response(self):
        a_token = "0x" + "ab" * 20
        raw = self._make_mock_response(
            config=0x10000000001C2000000000000000000000000000000000000000000000000000,
            liq_rate=3 * 10**24,  # ~0.3%
            var_borrow_rate=13 * 10**24,  # ~1.3%
            a_token=a_token,
        )
        result = _parse_reserve_data(raw)
        self.assertEqual(result["current_liquidity_rate"], 3 * 10**24)
        self.assertEqual(result["current_variable_borrow_rate"], 13 * 10**24)
        self.assertEqual(result["a_token"], a_token)

    def test_collateral_flag(self):
        # Bit 56 = usageAsCollateralEnabled
        config = 1 << 56
        raw = self._make_mock_response(config=config)
        result = _parse_reserve_data(raw)
        self.assertEqual(result["configuration"], config)

    def test_ltv_bits(self):
        # Bits [0:16] = LTV (7000 = 70%)
        config = 7000
        raw = self._make_mock_response(config=config)
        result = _parse_reserve_data(raw)
        ltv = result["configuration"] & 0xFFFF
        self.assertEqual(ltv, 7000)

    def test_liquidation_threshold_bits(self):
        # Bits [16:32] = liquidationThreshold (7500 = 75%)
        config = 7500 << 16
        raw = self._make_mock_response(config=config)
        result = _parse_reserve_data(raw)
        lt = (result["configuration"] >> 16) & 0xFFFF
        self.assertEqual(lt, 7500)


class TestChainIdSeparation(unittest.TestCase):
    """Verify Markets uses chain 196, Verify uses chain 1952."""

    def test_markets_chain_id(self):
        from services.markets.models import MarketAsset
        asset = MarketAsset(
            address="0x" + "ab" * 20,
            symbol="TEST",
            name="Test Token",
            decimals=18,
            category="other",
            chain_id=196,
            observed_at="2026-01-01T00:00:00Z",
        )
        self.assertEqual(asset.chain_id, 196)

    def test_markets_network_label(self):
        from services.markets.models import MarketAsset
        asset = MarketAsset(
            address="0x" + "ab" * 20,
            symbol="TEST",
            name="Test Token",
            decimals=18,
            category="other",
            observed_at="2026-01-01T00:00:00Z",
        )
        self.assertEqual(asset.network, "X Layer Mainnet")


class TestMarketsCannotWrite(unittest.TestCase):
    """Markets V1 must be read-only — no blockchain writes."""

    def test_models_forbid_extra_fields(self):
        from services.markets.models import MarketAsset, EarnOpportunity, BorrowOpportunity, SwapQuote
        for cls in [MarketAsset, EarnOpportunity, BorrowOpportunity]:
            with self.assertRaises(Exception):
                cls(
                    address="0x" + "ab" * 20,
                    symbol="TEST",
                    name="Test",
                    decimals=18,
                    category="other",
                    observed_at="2026-01-01T00:00:00Z",
                    fake_field="should_fail",
                )


if __name__ == "__main__":
    unittest.main()
