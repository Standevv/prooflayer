"use client";

import { useCallback, useEffect, useState } from "react";

import { Sidebar } from "@/components/sidebar";

/* ── Types ─────────────────────────────────────────────────────────── */

interface MarketAsset {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  category: string;
  chain_id: number;
  network: string;
  total_supply: string | null;
  wallet_supported: boolean;
  aave_available: boolean;
  observed_at: string;
}

interface EarnOpportunity {
  asset: string;
  symbol: string;
  asset_address: string;
  protocol: string;
  supply_apy: number | null;
  supply_apy_display: string | null;
  total_supplied_usd: number | null;
  available_liquidity: string | null;
  collateral_enabled: boolean;
  source: string;
  chain_id: number;
  observed_at: string;
}

interface BorrowOpportunity {
  asset: string;
  symbol: string;
  asset_address: string;
  protocol: string;
  borrow_apy: number | null;
  borrow_apy_display: string | null;
  available_liquidity: string | null;
  ltv: number | null;
  liquidation_threshold: number | null;
  borrowable: boolean;
  collateral_requirements: string | null;
  source: string;
  chain_id: number;
  observed_at: string;
}

interface SwapQuote {
  token_in: string;
  token_out: string;
  symbol_in: string;
  symbol_out: string;
  amount_in: string;
  amount_out: string | null;
  minimum_received: string | null;
  fee_tier: string | null;
  route: string | null;
  source: string;
  chain_id: number;
  available: boolean;
  error: string | null;
  observed_at: string;
}

type Tab = "explore" | "earn" | "borrow" | "swap";

/* ── Helpers ───────────────────────────────────────────────────────── */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

/* ── Tab components ────────────────────────────────────────────────── */

function ExploreTab({ assets }: { assets: MarketAsset[] }) {
  const [earnData, setEarnData] = useState<EarnOpportunity[]>([]);
  const [borrowData, setBorrowData] = useState<BorrowOpportunity[]>([]);

  useEffect(() => {
    fetch("/api/proxy?target=earn")
      .then((r) => r.json())
      .then(setEarnData)
      .catch(() => {});
    fetch("/api/proxy?target=borrow")
      .then((r) => r.json())
      .then(setBorrowData)
      .catch(() => {});
  }, []);

  const earnMap = new Map(earnData.map((e) => [e.symbol.toUpperCase(), e]));
  const borrowMap = new Map(borrowData.map((b) => [b.symbol.toUpperCase(), b]));

  return (
    <div className="overflow-hidden border border-edge bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-edge bg-elevated">
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-tertiary">Asset</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-tertiary">Type</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-tertiary">Supply APY</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-tertiary">Borrow APR</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-tertiary">LTV</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-tertiary">Liquidity</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-tertiary">Protocol</th>
              <th className="px-4 py-3 font-semibold uppercase tracking-wider text-tertiary">Updated</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => {
              const earn = earnMap.get(a.symbol.toUpperCase());
              const borrow = borrowMap.get(a.symbol.toUpperCase());
              return (
                <tr key={a.address} className="border-b border-edge last:border-b-0 hover:bg-overlay-hover transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-primary">{a.symbol}</div>
                    <div className="text-[9px] text-tertiary">{a.name}</div>
                  </td>
                  <td className="px-4 py-3 capitalize text-secondary">{a.category.replace("_", " ")}</td>
                  <td className="px-4 py-3 font-mono text-brand-bright">
                    {earn?.supply_apy_display ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-primary">
                    {borrow?.borrow_apy_display ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-secondary">
                    {borrow?.ltv != null ? `${(borrow.ltv * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-secondary">
                    {earn?.available_liquidity ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {a.aave_available ? (
                      <span className="inline-block rounded-[3px] border border-brand/15 bg-brand/[0.06] px-1.5 py-0.5 text-[8px] font-bold uppercase text-brand">Aave V3</span>
                    ) : (
                      <span className="text-tertiary">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[9px] text-tertiary">
                    {timeAgo(a.observed_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EarnTab({ opportunities }: { opportunities: EarnOpportunity[] }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-secondary">
        Real Aave V3 supply opportunities on X Layer Mainnet. All rates are on-chain.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {opportunities.map((o) => (
          <div key={o.symbol} className="border border-edge bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-primary">{o.symbol}</span>
              <span className="rounded-[3px] border border-brand/15 bg-brand/[0.06] px-1.5 py-0.5 text-[8px] font-bold uppercase text-brand">
                {o.protocol}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <div className="text-tertiary">Supply APY</div>
                <div className="mt-0.5 font-mono text-[12px] font-semibold text-success">
                  {o.supply_apy_display ?? "0.00%"}
                </div>
              </div>
              <div>
                <div className="text-tertiary">Liquidity</div>
                <div className="mt-0.5 font-mono text-[12px] text-primary">
                  {o.available_liquidity ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-tertiary">Collateral</div>
                <div className="mt-0.5 text-[12px] text-primary">
                  {o.collateral_enabled ? "✓ Enabled" : "✗ No"}
                </div>
              </div>
              <div>
                <div className="text-tertiary">Source</div>
                <div className="mt-0.5 text-[9px] text-secondary">{o.source}</div>
              </div>
            </div>
            <div className="mt-3 text-[8px] text-tertiary">
              Updated {timeAgo(o.observed_at)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BorrowTab({ opportunities }: { opportunities: BorrowOpportunity[] }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-secondary">
        Real Aave V3 borrow parameters on X Layer Mainnet. Wallet execution coming soon.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {opportunities.map((o) => (
          <div key={o.symbol} className="border border-edge bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-primary">{o.symbol}</span>
              {o.borrowable ? (
                <span className="rounded-[3px] border border-success/20 bg-success-soft/[0.06] px-1.5 py-0.5 text-[8px] font-bold uppercase text-success">Borrowable</span>
              ) : (
                <span className="rounded-[3px] border border-edge bg-elevated px-1.5 py-0.5 text-[8px] font-bold uppercase text-tertiary">Supply Only</span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <div className="text-tertiary">Borrow APR</div>
                <div className="mt-0.5 font-mono text-[12px] font-semibold text-primary">
                  {o.borrow_apy_display ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-tertiary">Liquidity</div>
                <div className="mt-0.5 font-mono text-[12px] text-primary">
                  {o.available_liquidity ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-tertiary">LTV</div>
                <div className="mt-0.5 font-mono text-[12px] text-primary">
                  {o.ltv != null ? `${(o.ltv * 100).toFixed(0)}%` : "—"}
                </div>
              </div>
              <div>
                <div className="text-tertiary">Liquidation Threshold</div>
                <div className="mt-0.5 font-mono text-[12px] text-primary">
                  {o.liquidation_threshold != null ? `${(o.liquidation_threshold * 100).toFixed(0)}%` : "—"}
                </div>
              </div>
            </div>
            {o.collateral_requirements && (
              <div className="mt-2 rounded-[3px] bg-elevated px-2 py-1 text-[9px] text-secondary">
                {o.collateral_requirements}
              </div>
            )}
            <div className="mt-3 text-[8px] text-tertiary">
              Updated {timeAgo(o.observed_at)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SwapTab({ assets }: { assets: MarketAsset[] }) {
  const [tokenIn, setTokenIn] = useState("");
  const [tokenOut, setTokenOut] = useState("");
  const [amount, setAmount] = useState("1000000");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [loading, setLoading] = useState(false);

  const getQuote = useCallback(async () => {
    if (!tokenIn || !tokenOut || !amount) return;
    setLoading(true);
    try {
      const res = await fetch("/api/markets/quote/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_in: tokenIn, token_out: tokenOut, amount }),
      });
      const data = await res.json();
      setQuote(data);
    } catch {
      setQuote(null);
    }
    setLoading(false);
  }, [tokenIn, tokenOut, amount]);

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-secondary">
        Read-only Uniswap V3 quotes on X Layer Mainnet. No transaction is created.
      </p>
      <div className="border border-edge bg-surface p-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-[8px] font-semibold uppercase tracking-wider text-tertiary">Token In</label>
            <select
              value={tokenIn}
              onChange={(e) => setTokenIn(e.target.value)}
              className="w-full rounded-[4px] border border-edge bg-elevated px-2 py-1.5 text-[11px] text-primary"
            >
              <option value="">Select…</option>
              {assets.map((a) => (
                <option key={a.address} value={a.address}>{a.symbol}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[8px] font-semibold uppercase tracking-wider text-tertiary">Token Out</label>
            <select
              value={tokenOut}
              onChange={(e) => setTokenOut(e.target.value)}
              className="w-full rounded-[4px] border border-edge bg-elevated px-2 py-1.5 text-[11px] text-primary"
            >
              <option value="">Select…</option>
              {assets.map((a) => (
                <option key={a.address} value={a.address}>{a.symbol}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[8px] font-semibold uppercase tracking-wider text-tertiary">Amount (raw)</label>
            <input
              type="text"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-[4px] border border-edge bg-elevated px-2 py-1.5 text-[11px] font-mono text-primary"
              placeholder="1000000"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={getQuote}
              disabled={loading || !tokenIn || !tokenOut}
              className="w-full rounded-[4px] border border-brand/30 bg-brand/[0.08] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-brand-bright hover:bg-brand/[0.14] disabled:opacity-40"
            >
              {loading ? "Quoting…" : "Get Quote"}
            </button>
          </div>
        </div>
      </div>

      {quote && (
        <div className="border border-edge bg-surface p-4">
          {quote.available ? (
            <div className="grid gap-3 sm:grid-cols-4 text-[10px]">
              <div>
                <div className="text-tertiary">Amount Out</div>
                <div className="mt-0.5 font-mono text-[13px] font-semibold text-primary">
                  {quote.amount_out ? Number(quote.amount_out).toLocaleString() : "—"}
                </div>
              </div>
              <div>
                <div className="text-tertiary">Min Received</div>
                <div className="mt-0.5 font-mono text-[13px] text-primary">
                  {quote.minimum_received ? Number(quote.minimum_received).toLocaleString() : "—"}
                </div>
              </div>
              <div>
                <div className="text-tertiary">Fee Tier</div>
                <div className="mt-0.5 font-mono text-[13px] text-primary">
                  {quote.fee_tier ? `${(Number(quote.fee_tier) / 10000).toFixed(2)}%` : "—"}
                </div>
              </div>
              <div>
                <div className="text-tertiary">Route</div>
                <div className="mt-0.5 text-[11px] text-primary">
                  {quote.route ?? "—"}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-warning">
              {quote.error || "Quote unavailable"}
            </div>
          )}
          <div className="mt-3 text-[8px] text-tertiary">
            {quote.source} · {timeAgo(quote.observed_at)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────────── */

export default function MarketsPage() {
  const [tab, setTab] = useState<Tab>("explore");
  const [assets, setAssets] = useState<MarketAsset[]>([]);
  const [earnOpps, setEarnOpps] = useState<EarnOpportunity[]>([]);
  const [borrowOpps, setBorrowOpps] = useState<BorrowOpportunity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/markets/assets").then((r) => r.json()),
      fetch("/api/markets/opportunities/earn").then((r) => r.json()),
      fetch("/api/markets/opportunities/borrow").then((r) => r.json()),
    ])
      .then(([a, e, b]) => {
        setAssets(Array.isArray(a) ? a : []);
        setEarnOpps(Array.isArray(e) ? e : []);
        setBorrowOpps(Array.isArray(b) ? b : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const tabs: { key: Tab; label: string }[] = [
    { key: "explore", label: "Explore" },
    { key: "earn", label: "Earn" },
    { key: "borrow", label: "Borrow" },
    { key: "swap", label: "Swap" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:ml-[220px]">
        <div className="mx-auto max-w-[1200px] px-5 py-5 sm:px-6 lg:px-8 lg:py-6">
          {/* Header */}
          <section className="px-6 py-7 sm:px-8 border border-edge bg-surface">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-brand">
                    X Layer Markets
                  </p>
                  <span className="rounded-[3px] border border-success/20 bg-success-soft/[0.06] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-success">
                    Chain 196
                  </span>
                  <span className="rounded-[3px] border border-edge bg-elevated px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-tertiary">
                    Read-Only
                  </span>
                </div>
                <h1 className="mt-2 text-[28px] font-semibold leading-none tracking-[-0.04em] text-primary sm:text-[34px]">
                  X Layer Markets
                </h1>
                <p className="mt-2 max-w-xl text-[12px] leading-5 text-secondary">
                  Discover, compare and access onchain opportunities on X Layer Mainnet.
                </p>
              </div>
              <div className="flex gap-5 text-[10px]">
                <div>
                  <div className="text-tertiary">Assets</div>
                  <div className="font-mono text-[14px] font-semibold text-primary">{assets.length}</div>
                </div>
                <div>
                  <div className="text-tertiary">Aave Reserves</div>
                  <div className="font-mono text-[14px] font-semibold text-brand">{earnOpps.length}</div>
                </div>
                <div>
                  <div className="text-tertiary">Network</div>
                  <div className="font-mono text-[14px] font-semibold text-primary">Mainnet</div>
                </div>
              </div>
            </div>
          </section>

          {/* Tabs */}
          <div className="mt-4 flex gap-0.5 border border-edge bg-surface p-0.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 rounded-[4px] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  tab === t.key
                    ? "bg-brand text-white"
                    : "text-secondary hover:bg-overlay-hover"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="mt-4">
            {loading ? (
              <div className="border border-edge bg-surface p-8 text-center text-[11px] text-secondary">
                Loading X Layer mainnet data…
              </div>
            ) : (
              <>
                {tab === "explore" && <ExploreTab assets={assets} />}
                {tab === "earn" && <EarnTab opportunities={earnOpps} />}
                {tab === "borrow" && <BorrowTab opportunities={borrowOpps} />}
                {tab === "swap" && <SwapTab assets={assets} />}
              </>
            )}
          </div>

          <footer className="mt-5 border-t border-edge py-3 text-[9px] text-tertiary">
            All data sourced from X Layer Mainnet (chain 196). Rates from Aave V3 Pool contract. Quotes from Uniswap V3 QuoterV2.
          </footer>
        </div>
      </main>
    </div>
  );
}
