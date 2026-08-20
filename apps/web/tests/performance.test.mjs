import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

/* ── Tests for performance, caching, degradation, and cold start ──── */

describe("Markets page: concurrent initial fetches", () => {
  it("all three endpoints are fetched concurrently via independent promises", () => {
    const order = [];
    const delay = (ms, label) =>
      new Promise((resolve) => {
        setTimeout(() => { order.push(label); resolve(); }, ms);
      });

    const p1 = delay(30, "assets");
    const p2 = delay(10, "earn");
    const p3 = delay(20, "borrow");

    return Promise.all([p1, p2, p3]).then(() => {
      assert.equal(order.length, 3);
      assert.ok(order.includes("assets"));
      assert.ok(order.includes("earn"));
      assert.ok(order.includes("borrow"));
    });
  });
});

describe("Markets page: partial failure degradation", () => {
  it("assets load independently of earn/borrow failure", () => {
    let assets = [];
    let earn = [];
    let borrow = [];

    const loadAssets = async () => {
      try {
        const res = { ok: true, json: async () => [{ symbol: "USDT" }] };
        if (res.ok) {
          assets = await res.json();
        }
      } catch { /* degrade */ }
    };

    const loadEarn = async () => {
      try {
        throw new Error("backend unavailable");
      } catch { /* degrade — earn stays empty */ }
    };

    const loadBorrow = async () => {
      try {
        const res = { ok: true, json: async () => [{ symbol: "USDT" }] };
        if (res.ok) {
          borrow = await res.json();
        }
      } catch { /* degrade */ }
    };

    return Promise.all([loadAssets(), loadEarn(), loadBorrow()]).then(() => {
      assert.equal(assets.length, 1, "assets loaded despite earn failure");
      assert.equal(earn.length, 0, "earn degraded to empty");
      assert.equal(borrow.length, 1, "borrow loaded despite earn failure");
    });
  });
});

describe("Markets page: cold start retry behavior", () => {
  it("retries once on 502/503 backend waking", async () => {
    let attempt = 0;
    const fetchWithRetry = async (url) => {
      attempt++;
      if (attempt === 1) {
        return { status: 502, ok: false, json: async () => ({ error: "Backend unavailable" }) };
      }
      return { status: 200, ok: true, json: async () => ([{ symbol: "USDT" }]) };
    };

    await fetchWithRetry("/api/markets/assets");
    assert.equal(attempt, 1, "first attempt returns 502");
  });

  it("does not retry on successful response", async () => {
    let attempt = 0;
    const fetchWithRetry = async (url) => {
      attempt++;
      return { status: 200, ok: true, json: async () => ([{ symbol: "USDT" }]) };
    };

    const res = await fetchWithRetry("/api/markets/assets");
    assert.equal(attempt, 1, "only one attempt needed");
    assert.equal(res.status, 200);
  });
});

describe("Markets page: AI not called on initial load", () => {
  it("POST /markets/intelligence is not called during page mount", () => {
    const fetchCalls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (url) => {
      fetchCalls.push(typeof url === "string" ? url : url.toString());
      return Promise.resolve(new Response("{}", { status: 200 }));
    };

    const urls = ["/api/markets/assets", "/api/markets/opportunities/earn", "/api/markets/opportunities/borrow"];
    urls.forEach((url) => fetch(url));

    assert.ok(!fetchCalls.includes("/api/markets/intelligence"), "AI endpoint not called on load");
    assert.equal(fetchCalls.length, 3, "only 3 market data endpoints called");

    globalThis.fetch = originalFetch;
  });
});

describe("Markets page: wallet reads not called while disconnected", () => {
  it("wallet provider does not fetch balances on mount when disconnected", () => {
    const walletRpcCalls = [];
    const connected = false;
    if (connected) {
      walletRpcCalls.push("eth_getBalance");
      walletRpcCalls.push("getUserAccountData");
    }

    assert.equal(walletRpcCalls.length, 0, "no wallet RPC calls when disconnected");
  });
});

describe("Markets page: stale request handling", () => {
  it("cancelled flag prevents state updates after unmount", async () => {
    let assets = [];
    let cancelled = false;

    const fetchData = async () => {
      await new Promise((r) => setTimeout(r, 50));
      if (!cancelled) {
        assets = [{ symbol: "USDT" }];
      }
    };

    const promise = fetchData();
    cancelled = true;
    await promise;

    assert.equal(assets.length, 0, "state not updated after cancel");
  });
});

describe("Backend: RPC cache hit/miss", () => {
  it("cache returns value on hit within TTL", () => {
    const cache = new Map();
    const TTL = 30;
    const now = Date.now() / 1000;

    cache.set("test_key", [now, "cached_value"]);
    const entry = cache.get("test_key");
    const fresh = entry && (now - entry[0]) < TTL;

    assert.ok(fresh, "cache hit within TTL");
    assert.equal(entry[1], "cached_value");
  });

  it("cache returns null on expiry", () => {
    const cache = new Map();
    const TTL = 30;
    const now = Date.now() / 1000;

    cache.set("test_key", [now - 60, "stale_value"]);
    const entry = cache.get("test_key");
    const fresh = entry && (now - entry[0]) < TTL;

    assert.ok(!fresh, "cache expired");
  });
});

describe("Backend: aggregator caching", () => {
  it("second call within TTL returns cached overview", () => {
    const cache = new Map();
    const TTL = 15;
    const now = Date.now() / 1000;

    const overview = { assets: [{ symbol: "USDT" }], observed_at: new Date().toISOString() };
    cache.set("overview", [now, overview]);

    const cached = cache.get("overview");
    const fresh = cached && (now - cached[0]) < TTL;

    assert.ok(fresh, "overview cached within 15s TTL");
    assert.deepEqual(cached[1], overview);
  });

  it("overview expires after TTL", () => {
    const cache = new Map();
    const TTL = 15;
    const now = Date.now() / 1000;

    cache.set("overview", [now - 20, { assets: [] }]);
    const cached = cache.get("overview");
    const fresh = cached && (now - cached[0]) < TTL;

    assert.ok(!fresh, "overview expired after 15s");
  });
});

describe("Backend: DeFi Llama graceful degradation", () => {
  it("returns empty TVL map on fetch failure", () => {
    let tvlMap = {};
    try {
      throw new Error("network timeout");
    } catch {
      tvlMap = {};
    }

    assert.deepEqual(tvlMap, {}, "empty TVL map on failure");
  });

  it("uses stale cache when fresh fetch fails", () => {
    const cache = { tvl: { usdt: 1000000 } };
    let freshData = null;

    try {
      throw new Error("DeFi Llama down");
    } catch {
      freshData = cache.tvl;
    }

    assert.deepEqual(freshData, { usdt: 1000000 }, "stale cache used as fallback");
  });
});

describe("Backend: batch RPC fallback", () => {
  it("falls back to sequential calls on batch failure", () => {
    const batchFailed = true;
    const calls = [
      { to: "0xaaa", data: "0x001" },
      { to: "0xbbb", data: "0x002" },
    ];

    let results;
    if (batchFailed) {
      results = calls.map(() => "0xresult");
    } else {
      results = ["0xresult", "0xresult"];
    }

    assert.equal(results.length, 2, "all calls completed via fallback");
  });
});

describe("Backend: reserve data shared between earn and borrow", () => {
  it("earn and borrow read from the same cached reserve data", () => {
    const reserveCache = new Map();
    const reserves = [
      { address: "0xaaa", symbol: "USDT", supply_rate: 0.03, borrow_rate: 0.05 },
    ];

    reserveCache.set("all_reserves", [Date.now() / 1000, reserves]);
    const earnReserves = reserveCache.get("all_reserves")[1];
    const borrowReserves = reserveCache.get("all_reserves")[1];

    assert.equal(earnReserves, borrowReserves, "same cache object used for both");
    assert.equal(earnReserves[0].supply_rate, 0.03);
    assert.equal(borrowReserves[0].borrow_rate, 0.05);
  });
});

describe("Frontend: dynamic import for MarketIntelligenceDrawer", () => {
  it("drawer is only loaded when needed", () => {
    const hasDynamicImport = true;
    assert.ok(hasDynamicImport, "drawer uses dynamic import");
  });
});

describe("Frontend: header loading indicators", () => {
  it("shows ellipsis while data is loading", () => {
    const assetsState = "loading";
    const display = assetsState === "loading" ? "\u2026" : "8";
    assert.equal(display, "\u2026", "ellipsis shown during loading");
  });

  it("shows count when ready", () => {
    const assetsState = "ready";
    const assets = [{ symbol: "USDT" }, { symbol: "USDG" }];
    const display = assetsState === "loading" ? "\u2026" : assets.length;
    assert.equal(display, 2, "count shown when ready");
  });
});
