import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isValidAddress,
  isValidISO,
  guardMarketAsset,
  guardEarnOpportunity,
  guardBorrowOpportunity,
  isVerifiedAaveReserve,
  timeAgo,
  resolveEarn,
  resolveBorrow,
  isValidAmount,
  humanToRaw,
  projectHealthFactor,
  isSupportedToken,
  getTokenDecimals,
  XLAYER_CHAIN_ID,
  XLAYER_CHAIN_HEX,
  AAVE_V3_POOL,
  VERIFIED_AAVE_RESERVES,
  TOKEN_DECIMALS,
} from "../lib/markets-guards.ts";

const VALID_ADDR = "0xE3F3Caefdd7180F884c01E57f65Df979Af84f116";
const NOW_ISO = new Date().toISOString();
const MINUTE_AGO = new Date(Date.now() - 60_000).toISOString();
const HOUR_AGO = new Date(Date.now() - 3_600_000).toISOString();

/* ── 1. Address validation ───────────────────────────────────────── */

describe("isValidAddress", () => {
  it("accepts valid hex address", () => {
    assert.ok(isValidAddress(VALID_ADDR));
  });

  it("rejects non-hex characters", () => {
    assert.ok(!isValidAddress("0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"));
  });

  it("rejects short address", () => {
    assert.ok(!isValidAddress("0x1234"));
  });

  it("rejects null", () => {
    assert.ok(!isValidAddress(null));
  });

  it("rejects empty string", () => {
    assert.ok(!isValidAddress(""));
  });
});

/* ── 2. ISO validation ──────────────────────────────────────────── */

describe("isValidISO", () => {
  it("accepts valid ISO timestamp", () => {
    assert.ok(isValidISO("2026-08-19T12:00:00.000Z"));
  });

  it("rejects non-date string", () => {
    assert.ok(!isValidISO("not-a-date"));
  });

  it("rejects null", () => {
    assert.ok(!isValidISO(null));
  });

  it("rejects empty string", () => {
    assert.ok(!isValidISO(""));
  });
});

/* ── 3. MarketAsset guard ───────────────────────────────────────── */

describe("guardMarketAsset", () => {
  const valid = {
    address: VALID_ADDR,
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    category: "stablecoin",
    chain_id: 196,
    observed_at: NOW_ISO,
  };

  it("accepts valid asset object", () => {
    assert.ok(guardMarketAsset(valid));
  });

  it("rejects null", () => {
    assert.ok(!guardMarketAsset(null));
  });

  it("rejects missing address", () => {
    assert.ok(!guardMarketAsset({ ...valid, address: undefined }));
  });

  it("rejects invalid address", () => {
    assert.ok(!guardMarketAsset({ ...valid, address: "bad" }));
  });

  it("rejects missing symbol", () => {
    assert.ok(!guardMarketAsset({ ...valid, symbol: undefined }));
  });

  it("rejects missing decimals", () => {
    assert.ok(!guardMarketAsset({ ...valid, decimals: undefined }));
  });

  it("rejects wrong type decimals", () => {
    assert.ok(!guardMarketAsset({ ...valid, decimals: "six" }));
  });
});

/* ── 4. EarnOpportunity guard ───────────────────────────────────── */

describe("guardEarnOpportunity", () => {
  const valid = {
    asset_address: VALID_ADDR,
    symbol: "USDT",
    protocol: "aave-v3",
    observed_at: NOW_ISO,
  };

  it("accepts valid earn opportunity", () => {
    assert.ok(guardEarnOpportunity(valid));
  });

  it("rejects null", () => {
    assert.ok(!guardEarnOpportunity(null));
  });

  it("rejects missing asset_address", () => {
    assert.ok(!guardEarnOpportunity({ ...valid, asset_address: undefined }));
  });

  it("rejects invalid asset_address", () => {
    assert.ok(!guardEarnOpportunity({ ...valid, asset_address: "bad" }));
  });
});

/* ── 5. BorrowOpportunity guard ─────────────────────────────────── */

describe("guardBorrowOpportunity", () => {
  const valid = {
    asset_address: VALID_ADDR,
    symbol: "USDT",
    protocol: "aave-v3",
    observed_at: NOW_ISO,
  };

  it("accepts valid borrow opportunity", () => {
    assert.ok(guardBorrowOpportunity(valid));
  });

  it("rejects null", () => {
    assert.ok(!guardBorrowOpportunity(null));
  });

  it("rejects missing asset_address", () => {
    assert.ok(!guardBorrowOpportunity({ ...valid, asset_address: undefined }));
  });
});

/* ── 6. Verified Aave reserves ──────────────────────────────────── */

describe("isVerifiedAaveReserve", () => {
  it("accepts known reserve (lowercase)", () => {
    assert.ok(isVerifiedAaveReserve("0x779ded0c9e1022225f8e0630b35a9b54be713736"));
  });

  it("accepts known reserve (mixed case)", () => {
    assert.ok(isVerifiedAaveReserve("0x779DED0C9E1022225F8E0630B35A9B54BE713736"));
  });

  it("rejects unknown address", () => {
    assert.ok(!isVerifiedAaveReserve("0x0000000000000000000000000000000000000001"));
  });
});

/* ── 7. Constants ───────────────────────────────────────────────── */

describe("constants", () => {
  it("XLAYER_CHAIN_ID is 196", () => {
    assert.equal(XLAYER_CHAIN_ID, 196);
  });

  it("XLAYER_CHAIN_HEX is 0xC4", () => {
    assert.equal(XLAYER_CHAIN_HEX, "0xC4");
  });

  it("AAVE_V3_POOL is valid address", () => {
    assert.ok(isValidAddress(AAVE_V3_POOL));
  });

  it("VERIFIED_AAVE_RESERVES.size is 8", () => {
    assert.equal(VERIFIED_AAVE_RESERVES.size, 8);
  });

  it("all TOKEN_DECIMALS entries have valid decimals (1-18)", () => {
    for (const [addr, dec] of Object.entries(TOKEN_DECIMALS)) {
      assert.ok(isValidAddress(addr), `key ${addr} is not a valid address`);
      assert.ok(typeof dec === "number" && dec >= 1 && dec <= 18, `${addr} decimals ${dec} out of range`);
    }
  });
});

/* ── 8. Time ago ────────────────────────────────────────────────── */

describe("timeAgo", () => {
  it("returns seconds ago for recent timestamps", () => {
    const ts = new Date(Date.now() - 5_000).toISOString();
    const result = timeAgo(ts);
    assert.match(result, /^\d+s ago$/);
  });

  it("returns minutes ago for minute-old timestamps", () => {
    const result = timeAgo(MINUTE_AGO);
    assert.match(result, /^\d+m ago$/);
  });

  it("returns hours ago for hour-old timestamps", () => {
    const result = timeAgo(HOUR_AGO);
    assert.match(result, /^\d+h ago$/);
  });
});

/* ── 9. Opportunity matching ────────────────────────────────────── */

describe("resolveEarn", () => {
  const opp = { asset_address: VALID_ADDR, symbol: "USDT" };
  const addrMap = new Map([[VALID_ADDR.toLowerCase(), opp]]);
  const symMap = new Map([["usdt", opp]]);

  it("matches by address first", () => {
    const result = resolveEarn({ address: VALID_ADDR, symbol: "USDT" }, addrMap, symMap);
    assert.equal(result, opp);
  });

  it("falls back to symbol when no address match", () => {
    const otherAddr = "0x1111111111111111111111111111111111111111";
    const result = resolveEarn({ address: otherAddr, symbol: "USDT" }, addrMap, symMap);
    assert.equal(result, opp);
  });

  it("returns undefined when no match", () => {
    const result = resolveEarn({ address: "0x1111111111111111111111111111111111111111", symbol: "DAI" }, addrMap, symMap);
    assert.equal(result, undefined);
  });
});

describe("resolveBorrow", () => {
  const opp = { asset_address: VALID_ADDR, symbol: "USDT" };
  const addrMap = new Map([[VALID_ADDR.toLowerCase(), opp]]);
  const symMap = new Map([["usdt", opp]]);

  it("matches by address first", () => {
    const result = resolveBorrow({ address: VALID_ADDR, symbol: "USDT" }, addrMap, symMap);
    assert.equal(result, opp);
  });

  it("falls back to symbol when no address match", () => {
    const otherAddr = "0x2222222222222222222222222222222222222222";
    const result = resolveBorrow({ address: otherAddr, symbol: "USDT" }, addrMap, symMap);
    assert.equal(result, opp);
  });

  it("returns undefined when no match", () => {
    const result = resolveBorrow({ address: "0x2222222222222222222222222222222222222222", symbol: "DAI" }, addrMap, symMap);
    assert.equal(result, undefined);
  });
});

/* ── 10. Amount validation ──────────────────────────────────────── */

describe("isValidAmount", () => {
  it("accepts '1.5'", () => assert.ok(isValidAmount("1.5")));
  it("accepts '0.001'", () => assert.ok(isValidAmount("0.001")));
  it("accepts '100'", () => assert.ok(isValidAmount("100")));

  it("rejects empty string", () => assert.ok(!isValidAmount("")));
  it("rejects '0'", () => assert.ok(!isValidAmount("0")));
  it("rejects '-1'", () => assert.ok(!isValidAmount("-1")));
  it("rejects 'abc'", () => assert.ok(!isValidAmount("abc")));
  it("rejects NaN input", () => assert.ok(!isValidAmount("NaN")));
});

/* ── 11. Human to raw ───────────────────────────────────────────── */

describe("humanToRaw", () => {
  it("'1.0' with 18 decimals => 1000000000000000000n", () => {
    assert.equal(humanToRaw("1.0", 18), 1_000_000_000_000_000_000n);
  });

  it("'1.0' with 6 decimals => 1000000n", () => {
    assert.equal(humanToRaw("1.0", 6), 1_000_000n);
  });

  it("'0.5' with 18 decimals => 500000000000000000n", () => {
    assert.equal(humanToRaw("0.5", 18), 500_000_000_000_000_000n);
  });

  it("throws on invalid amount", () => {
    assert.throws(() => humanToRaw("abc", 18));
    assert.throws(() => humanToRaw("0", 18));
    assert.throws(() => humanToRaw("-1", 18));
  });
});

/* ── 12. Health factor projection ───────────────────────────────── */

describe("projectHealthFactor", () => {
  const ONE = 1n * 10n ** 18n;
  const THRESHOLD = 8000n; // 80%

  it("no debt => Infinity and safe", () => {
    const result = projectHealthFactor(ONE, 0n, 0n, THRESHOLD);
    assert.equal(result.projectedHF, Infinity);
    assert.equal(result.safe, true);
  });

  it("healthy HF (2.0) => safe", () => {
    const collateral = 5n * 10n ** 18n;
    const debt = 2n;
    const result = projectHealthFactor(collateral, debt, 0n, 8000n);
    assert.equal(result.projectedHF, 2);
    assert.equal(result.safe, true);
  });

  it("risky HF (1.02) => not safe", () => {
    const collateral = 5100n * 10n ** 15n;
    const debt = 4n;
    const result = projectHealthFactor(collateral, debt, 0n, 8000n);
    assert.equal(result.projectedHF, 1.02);
    assert.equal(result.safe, false);
  });

  it("critical HF (0.8) => not safe", () => {
    const collateral = 3n * 10n ** 18n;
    const debt = 3n;
    const result = projectHealthFactor(collateral, debt, 0n, 8000n);
    assert.equal(result.projectedHF, 0.8);
    assert.equal(result.safe, false);
  });
});

/* ── 13. Token validation ───────────────────────────────────────── */

describe("isSupportedToken & getTokenDecimals", () => {
  it("known reserve is supported", () => {
    assert.ok(isSupportedToken("0x779ded0c9e1022225f8e0630b35a9b54be713736"));
  });

  it("unknown address is not supported", () => {
    assert.ok(!isSupportedToken("0x0000000000000000000000000000000000000001"));
  });

  it("known token returns correct decimals", () => {
    assert.equal(getTokenDecimals("0x779ded0c9e1022225f8e0630b35a9b54be713736"), 6);
    assert.equal(getTokenDecimals("0xe538905cf8410324e03a5a23c1c177a474d59b2b"), 18);
  });

  it("unknown token returns null", () => {
    assert.equal(getTokenDecimals("0x0000000000000000000000000000000000000001"), null);
  });
});

/* ── 14. ExploreTab address-based matching ──────────────────────── */

describe("ExploreTab address-based matching", () => {
  const earnOpp = { asset_address: VALID_ADDR, symbol: "USDT" };
  const earnByAddr = new Map([[VALID_ADDR.toLowerCase(), earnOpp]]);
  const earnBySymbol = new Map([["usdt", earnOpp]]);

  it("asset with matching address gets earn data", () => {
    const result = resolveEarn({ address: VALID_ADDR, symbol: "USDT" }, earnByAddr, earnBySymbol);
    assert.equal(result, earnOpp);
  });

  it("asset with no matching address but matching symbol gets fallback", () => {
    const otherAddr = "0x3333333333333333333333333333333333333333";
    const result = resolveEarn({ address: otherAddr, symbol: "USDT" }, earnByAddr, earnBySymbol);
    assert.equal(result, earnOpp);
  });

  it("asset with no match gets no data", () => {
    const result = resolveEarn({ address: "0x4444444444444444444444444444444444444444", symbol: "DAI" }, earnByAddr, earnBySymbol);
    assert.equal(result, undefined);
  });
});
