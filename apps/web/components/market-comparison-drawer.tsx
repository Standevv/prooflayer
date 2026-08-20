"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SafeMarkdown } from "@/components/safe-markdown";
import type { MarketTrustData } from "@/components/market-trust-badge";

type ComparisonResponse = {
  answer: string;
  asset_a: MarketTrustData;
  asset_b: MarketTrustData;
  data_sources: string[];
  observed_at: string;
};

type MarketComparisonDrawerProps = {
  open: boolean;
  onClose: () => void;
  assetA: string | null;
  assetB: string | null;
};

function ComparisonFetcher({
  assetA,
  assetB,
  onClose,
}: {
  assetA: string;
  assetB: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ComparisonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    const id = ++fetchIdRef.current;

    fetch("/api/markets/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_a: assetA, asset_b: assetB }),
    })
      .then((res) => {
        if (!res.ok) {
          return res.json().then((body) => {
            throw new Error(body?.error ?? `Comparison failed (${res.status})`);
          });
        }
        return res.json();
      })
      .then((json) => {
        if (id === fetchIdRef.current) setData(json);
      })
      .catch((err: unknown) => {
        if (id === fetchIdRef.current) {
          const msg = err instanceof Error ? err.message : "Comparison failed";
          setError(msg);
        }
      })
      .finally(() => {
        if (id === fetchIdRef.current) setLoading(false);
      });
  }, [assetA, assetB]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (assetA === assetB) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={handleBackdropClick}
      >
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-lg mx-4 p-6 shadow-2xl">
          <div className="text-center text-zinc-400 text-sm">
            Select two different assets to compare.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-[4px] border border-zinc-700 px-3 py-2 text-[10px] font-semibold text-zinc-400 hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              Asset Comparison
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              AI-grounded side-by-side analysis
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className="p-4">
          {/* Loading */}
          {loading && (
            <div className="border border-zinc-800 rounded-lg p-6 text-center">
              <div className="text-[11px] text-zinc-400">
                Collecting data &amp; running AI comparison...
              </div>
              <div className="mt-3 h-[2px] w-full overflow-hidden bg-zinc-800">
                <div className="h-full w-1/3 animate-pulse bg-emerald-500" />
              </div>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="border border-yellow-500/20 bg-yellow-500/5 rounded-lg p-4">
              <div className="text-[11px] font-semibold text-yellow-400">
                AI comparison unavailable
              </div>
              <div className="mt-1 text-[10px] text-zinc-400">
                {error}. Market data and verification continue to work normally.
              </div>
            </div>
          )}

          {/* Results */}
          {data && !loading && (
            <>
              {/* Asset summary */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="border border-zinc-800 rounded-lg p-3">
                  <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Asset A
                  </div>
                  <div className="mt-1 text-[13px] font-semibold text-zinc-100">
                    {data.asset_a.symbol}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {data.asset_a.name}
                  </div>
                  <div className="mt-1">
                    <span
                      className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
                        data.asset_a.verification_coverage.verification_status === "VERIFIED"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : data.asset_a.verification_coverage.verification_status === "BLOCKED"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-zinc-500/20 text-zinc-400"
                      }`}
                    >
                      {data.asset_a.verification_coverage.verification_status}
                    </span>
                  </div>
                </div>
                <div className="border border-zinc-800 rounded-lg p-3">
                  <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Asset B
                  </div>
                  <div className="mt-1 text-[13px] font-semibold text-zinc-100">
                    {data.asset_b.symbol}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {data.asset_b.name}
                  </div>
                  <div className="mt-1">
                    <span
                      className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
                        data.asset_b.verification_coverage.verification_status === "VERIFIED"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : data.asset_b.verification_coverage.verification_status === "BLOCKED"
                            ? "bg-red-500/20 text-red-400"
                            : "bg-zinc-500/20 text-zinc-400"
                      }`}
                    >
                      {data.asset_b.verification_coverage.verification_status}
                    </span>
                  </div>
                </div>
              </div>

              {/* AI Comparison */}
              <div className="border border-zinc-800 rounded-lg p-4 mb-3">
                <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-emerald-400 mb-2">
                  AI COMPARISON
                </div>
                <div className="text-[11px] leading-5 text-zinc-300">
                  <SafeMarkdown content={data.answer} />
                </div>
              </div>

              {/* Raw Data Tables */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="border border-zinc-800 rounded-lg p-3">
                  <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-zinc-500 mb-2">
                    {data.asset_a.symbol} DATA
                  </div>
                  <div className="space-y-1 text-[10px]">
                    <Row label="Supply APY" value={data.asset_a.supply_apy_display} />
                    <Row label="Borrow APY" value={data.asset_a.borrow_apy_display} />
                    <Row label="LTV" value={data.asset_a.ltv != null ? `${(data.asset_a.ltv * 100).toFixed(0)}%` : null} />
                    <Row label="Liq. Threshold" value={data.asset_a.liquidation_threshold != null ? `${(data.asset_a.liquidation_threshold * 100).toFixed(0)}%` : null} />
                    <Row label="Liquidity" value={data.asset_a.available_liquidity} />
                    <Row label="Collateral" value={data.asset_a.collateral_enabled != null ? (data.asset_a.collateral_enabled ? "Yes" : "No") : null} />
                    <Row label="RVC" value={data.asset_a.raw_rvc_result} />
                    <Row label="Certificate" value={data.asset_a.raw_certificate_state} />
                    <Row label="PolicyGate" value={data.asset_a.raw_policygate_outcome} />
                    <Row label="Freshness" value={data.asset_a.verification_coverage.freshness_state} />
                  </div>
                </div>
                <div className="border border-zinc-800 rounded-lg p-3">
                  <div className="text-[8px] font-bold uppercase tracking-[0.14em] text-zinc-500 mb-2">
                    {data.asset_b.symbol} DATA
                  </div>
                  <div className="space-y-1 text-[10px]">
                    <Row label="Supply APY" value={data.asset_b.supply_apy_display} />
                    <Row label="Borrow APY" value={data.asset_b.borrow_apy_display} />
                    <Row label="LTV" value={data.asset_b.ltv != null ? `${(data.asset_b.ltv * 100).toFixed(0)}%` : null} />
                    <Row label="Liq. Threshold" value={data.asset_b.liquidation_threshold != null ? `${(data.asset_b.liquidation_threshold * 100).toFixed(0)}%` : null} />
                    <Row label="Liquidity" value={data.asset_b.available_liquidity} />
                    <Row label="Collateral" value={data.asset_b.collateral_enabled != null ? (data.asset_b.collateral_enabled ? "Yes" : "No") : null} />
                    <Row label="RVC" value={data.asset_b.raw_rvc_result} />
                    <Row label="Certificate" value={data.asset_b.raw_certificate_state} />
                    <Row label="PolicyGate" value={data.asset_b.raw_policygate_outcome} />
                    <Row label="Freshness" value={data.asset_b.verification_coverage.freshness_state} />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="text-[10px] text-zinc-600 mt-3 pt-3 border-t border-zinc-800">
                <p>Observed: {new Date(data.observed_at).toLocaleString()}</p>
                <p className="mt-1">
                  AI comparison is informational only. Never uses &quot;safe&quot;, &quot;guaranteed&quot;, or &quot;approved&quot;.
                  No transactions triggered. Read-only.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Public Drawer Component ──────────────────────────────────────── */

export function MarketComparisonDrawer({
  open,
  onClose,
  assetA,
  assetB,
}: MarketComparisonDrawerProps) {
  if (!open || !assetA || !assetB) return null;

  return (
    <ComparisonFetcher
      key={`${assetA}-${assetB}`}
      assetA={assetA}
      assetB={assetB}
      onClose={onClose}
    />
  );
}

function Row({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-zinc-500 shrink-0">{label}</span>
      <span className="text-zinc-300 text-right font-mono">
        {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
      </span>
    </div>
  );
}
