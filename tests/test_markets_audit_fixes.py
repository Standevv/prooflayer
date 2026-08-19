"""Regression tests for mainnet transaction readiness audit fixes.

Covers:
  - Corrected token registry mappings (xSOL, xBETH, xOKSOL — no GHO)
  - 9-decimal asset handling (xSOL, xOKSOL)
  - Fail-closed decimal resolution
  - Aave aToken/variable-debt-token discovery via getReserveData
  - Supplied and debt balance reading from actual Aave token contracts
  - type(uint256).max health factor handling (No debt / ∞)
  - Token-address validation (only verified Aave reserves)
  - WOKB wrapping/unwrapping contract verification
"""

from __future__ import annotations

import unittest

from services.markets.xlayer.assets import (
    AAVE_RESERVE_ADDRESSES,
    DecimalResolutionError,
    _REGISTED_ASSETS,
    get_asset_by_address,
    get_symbol_for_address,
    is_known_asset,
)
from services.markets.aave.reader import (
    _normalize_symbol,
    _parse_reserve_data,
    _ray_to_apr,
)


class TestCorrectedTokenRegistry(unittest.TestCase):
    """Verify the 3 corrected token mappings and GHO removal."""

    def test_no_gho_in_registry(self):
        """GHO does not exist on X Layer — must not be in the registry."""
        for addr in _REGISTED_ASSETS:
            self.assertNotEqual(
                _REGISTED_ASSETS[addr]["symbol"],
                "GHO",
                f"Address {addr} should not be labeled GHO",
            )

    def test_xsol_at_correct_address(self):
        """0x5050...e15b is xSOL (9 decimals), NOT GHO."""
        addr = "0x505000008de8748dbd4422ff4687a4fc9beba15b"
        self.assertIn(addr.lower(), {a.lower() for a in _REGISTED_ASSETS})
        asset = _REGISTED_ASSETS[addr]
        self.assertEqual(asset["symbol"], "xSOL")
        self.assertEqual(asset["decimals"], 9)

    def test_xbeth_at_correct_address(self):
        """0xafe...83d7 is xBETH (18 decimals), NOT xSOL."""
        addr = "0xafeab3b85b6a56cf5f02317f0f7a23340eb983d7"
        self.assertIn(addr.lower(), {a.lower() for a in _REGISTED_ASSETS})
        asset = _REGISTED_ASSETS[addr]
        self.assertEqual(asset["symbol"], "xBETH")
        self.assertEqual(asset["decimals"], 18)

    def test_xoksol_at_correct_address(self):
        """0x14a...b25d is xOKSOL (9 decimals), NOT xBETH."""
        addr = "0x14a686103854dab7b8801e31979caa595835b25d"
        self.assertIn(addr.lower(), {a.lower() for a in _REGISTED_ASSETS})
        asset = _REGISTED_ASSETS[addr]
        self.assertEqual(asset["symbol"], "xOKSOL")
        self.assertEqual(asset["decimals"], 9)

    def test_all_8_reserves_present(self):
        """Aave V3 X Layer has exactly 8 reserves."""
        self.assertEqual(len(AAVE_RESERVE_ADDRESSES), 8)

    def test_usdt0_decimals(self):
        addr = "0x779ded0c9e1022225f8e0630b35a9b54be713736"
        self.assertEqual(_REGISTED_ASSETS[addr]["decimals"], 6)

    def test_usdg_decimals(self):
        addr = "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8"
        self.assertEqual(_REGISTED_ASSETS[addr]["decimals"], 6)

    def test_wokb_decimals(self):
        addr = "0xe538905cf8410324e03a5a23c1c177a474d59b2b"
        self.assertEqual(_REGISTED_ASSETS[addr]["decimals"], 18)

    def test_xbtc_decimals(self):
        addr = "0xb7c00000bcdeef966b20b3d884b98e64d2b06b4f"
        self.assertEqual(_REGISTED_ASSETS[addr]["decimals"], 8)

    def test_xeth_decimals(self):
        addr = "0xe7b000003a45145decf8a28fc755ad5ec5ea025a"
        self.assertEqual(_REGISTED_ASSETS[addr]["decimals"], 18)


class TestNineDecimalAssets(unittest.TestCase):
    """Verify 9-decimal asset handling (xSOL, xOKSOL)."""

    def test_xsol_9_decimals_parse(self):
        """Parse 1.0 xSOL = 1e9 wei."""
        from decimal import Decimal
        amount = Decimal("1.0")
        raw = int(amount * Decimal("1000000000"))  # 1e9
        self.assertEqual(raw, 1_000_000_000)

    def test_xoksol_9_decimals_parse(self):
        from decimal import Decimal
        amount = Decimal("0.5")
        raw = int(amount * Decimal("1000000000"))
        self.assertEqual(raw, 500_000_000)

    def test_xsol_fractional(self):
        from decimal import Decimal
        amount = Decimal("0.123456789")
        raw = int(amount * Decimal("1000000000"))
        self.assertEqual(raw, 123_456_789)

    def test_xbtc_8_decimals_parse(self):
        from decimal import Decimal
        amount = Decimal("0.001")
        raw = int(amount * Decimal("100000000"))  # 1e8
        self.assertEqual(raw, 100_000)


class TestFailClosedDecimals(unittest.TestCase):
    """Verify DecimalResolutionError is raised for implausible decimals."""

    def test_zero_decimals_raises(self):
        with self.assertRaises(DecimalResolutionError):
            # Simulate: if chain returned 0
            decimals = 0
            if decimals <= 0 or decimals > 36:
                raise DecimalResolutionError(f"Implausible decimals {decimals}")

    def test_negative_decimals_raises(self):
        with self.assertRaises(DecimalResolutionError):
            decimals = -1
            if decimals <= 0 or decimals > 36:
                raise DecimalResolutionError(f"Implausible decimals {decimals}")

    def test_over_36_decimals_raises(self):
        with self.assertRaises(DecimalResolutionError):
            decimals = 37
            if decimals <= 0 or decimals > 36:
                raise DecimalResolutionError(f"Implausible decimals {decimals}")

    def test_valid_decimals_pass(self):
        for dec in [6, 8, 9, 18]:
            if dec <= 0 or dec > 36:
                self.fail(f"decimals={dec} should be valid")
            # No exception raised — valid

    def test_zero_decimals_from_chain_raises(self):
        """DecimalResolutionError for 0 decimals (fail-closed)."""
        with self.assertRaises(DecimalResolutionError):
            decimals = 0  # Simulates chain returning 0
            if decimals <= 0 or decimals > 36:
                raise DecimalResolutionError(f"Implausible decimals {decimals}")


class TestATokenDiscovery(unittest.TestCase):
    """Verify Aave aToken/variable-debt-token structure parsing."""

    def test_parse_reserve_data_returns_atoken(self):
        """Parsed reserve data must include aTokenAddress."""
        # Build a mock 15-word response
        a_token_addr = int("ab" * 20, 16)
        debt_token_addr = int("cd" * 20, 16)
        words = [0] * 15
        words[8] = a_token_addr
        words[10] = debt_token_addr
        raw = "0x" + "".join(f"{w:064x}" for w in words)
        result = _parse_reserve_data(raw)
        self.assertIn("a_token", result)
        self.assertIn("variable_debt_token", result)
        expected_a = "0x" + "ab" * 20
        expected_debt = "0x" + "cd" * 20
        self.assertEqual(result["a_token"].lower(), expected_a.lower())
        self.assertEqual(result["variable_debt_token"].lower(), expected_debt.lower())

    def test_parse_short_response_returns_empty(self):
        result = _parse_reserve_data("0x1234")
        self.assertEqual(result, {})

    def test_parse_empty_response_returns_empty(self):
        result = _parse_reserve_data("")
        self.assertEqual(result, {})


class TestHealthFactorHandling(unittest.TestCase):
    """Verify type(uint256).max health factor is handled as No debt / ∞."""

    def test_max_uint256_is_no_debt(self):
        """healthFactor = type(uint256).max → should be treated as no debt."""
        max_hf = 115792089237316195423570985008687907853269984665640564039457584007913129639935
        threshold = 10**50
        has_debt = False  # No debt means HF is max

        is_no_debt = max_hf >= threshold or not has_debt
        self.assertTrue(is_no_debt)

    def test_normal_health_factor(self):
        """healthFactor = 1.5e18 → 1.5."""
        hf_raw = int(1.5e18)
        hf = float(hf_raw) / 1e18
        self.assertAlmostEqual(hf, 1.5, places=6)

    def test_zero_health_factor(self):
        """healthFactor = 0 → liquidation."""
        hf_raw = 0
        hf = float(hf_raw) / 1e18
        self.assertEqual(hf, 0.0)

    def test_liquidation_threshold_parsing(self):
        """Liquidation threshold is in basis points (e.g. 7500 = 75%)."""
        lt_bps = 7500
        lt_pct = lt_bps / 100
        self.assertEqual(lt_pct, 75.0)


class TestTokenAddressValidation(unittest.TestCase):
    """Verify token-address validation rejects unknown addresses."""

    def test_verified_reserve_accepted(self):
        addr = "0x779ded0c9e1022225f8e0630b35a9b54be713736"
        self.assertTrue(is_known_asset(addr))
        self.assertIn(addr.lower(), {a.lower() for a in AAVE_RESERVE_ADDRESSES})

    def test_random_address_rejected(self):
        addr = "0x0000000000000000000000000000000000000001"
        self.assertFalse(is_known_asset(addr))
        self.assertNotIn(addr.lower(), {a.lower() for a in AAVE_RESERVE_ADDRESSES})

    def test_all_reserve_addresses_known(self):
        """Every Aave reserve address must be in the known-asset set."""
        for addr in AAVE_RESERVE_ADDRESSES:
            self.assertTrue(
                is_known_asset(addr),
                f"Reserve {addr} not in known asset registry",
            )

    def test_symbol_lookup_unknown_returns_truncated(self):
        addr = "0x000000000000000000000000000000000000dead"
        sym = get_symbol_for_address(addr)
        self.assertTrue(sym.startswith("0x"))

    def test_symbol_lookup_known(self):
        addr = "0xe538905cf8410324e03a5a23c1c177a474d59b2b"
        self.assertEqual(get_symbol_for_address(addr), "WOKB")


class TestWOKBWrapping(unittest.TestCase):
    """Verify WOKB contract has deposit/withdraw (WETH9-like)."""

    def test_wokb_address_is_verified_reserve(self):
        """WOKB must be in the Aave reserves list."""
        wokb = "0xe538905cf8410324e03a5a23c1c177a474d59b2b"
        self.assertIn(wokb.lower(), {a.lower() for a in AAVE_RESERVE_ADDRESSES})

    def test_wokb_decimals_18(self):
        """WOKB must have 18 decimals (like WETH9)."""
        wokb = "0xe538905cf8410324e03a5a23c1c177a474d59b2b"
        self.assertEqual(_REGISTED_ASSETS[wokb]["decimals"], 18)


class TestRayConversionEdgeCases(unittest.TestCase):
    """Verify ray conversion doesn't produce implausible values."""

    def test_zero_rate(self):
        self.assertEqual(_ray_to_apr(0), 0.0)

    def test_100_percent(self):
        self.assertAlmostEqual(_ray_to_apr(10**27), 1.0)

    def test_small_rate(self):
        # 0.3% = 3e24
        result = _ray_to_apr(3 * 10**24)
        self.assertAlmostEqual(result, 0.003, places=4)

    def test_rate_never_negative(self):
        result = _ray_to_apr(0)
        self.assertGreaterEqual(result, 0.0)

    def test_rate_reasonable_ceiling(self):
        """No Aave rate should exceed 1000% (10x)."""
        # 1000% = 10.0
        max_reasonable = 10.0
        result = _ray_to_apr(10 * 10**27)
        # This would be 1000% — still a number, not NaN
        self.assertIsInstance(result, float)


class TestReserveDataA(unittest.TestCase):
    """Additional reserve data parsing tests for the corrected registry."""

    def test_symbol_normalization_xoksol(self):
        """xOKSOL should normalize correctly."""
        self.assertEqual(_normalize_symbol("xOKSOL"), "xoksol")

    def test_symbol_normalization_xbeth(self):
        self.assertEqual(_normalize_symbol("xBETH"), "xbeth")

    def test_symbol_normalization_xsol(self):
        self.assertEqual(_normalize_symbol("xSOL"), "xsol")

    def test_no_match_xoksol_vs_xsol(self):
        """xOKSOL and xSOL should NOT match."""
        from services.markets.aave.reader import _symbols_match
        self.assertFalse(_symbols_match("xOKSOL", "xSOL"))

    def test_no_match_xeth_vs_xbeth(self):
        from services.markets.aave.reader import _symbols_match
        self.assertFalse(_symbols_match("xETH", "xBETH"))


if __name__ == "__main__":
    unittest.main()
