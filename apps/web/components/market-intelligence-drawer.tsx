"use client";

import { useEffect, useState } from "react";
import { SafeMarkdown } from "@/components/safe-markdown";

/* ── Types ─────────────────────────────────────────────────────────── */

interface IntelligenceTrace {
  source: string;
  status: string;
  record_count: number;
  summary: string;
}

interface IntelligenceResponse {
  answer: string;
  query: string;
  data_sources: string[];
  trace: IntelligenceTrace[];
  observed_at: string;
}

interface MarketIntelligenceDrawerProps {
  open: boolean;
  onClose: () => void;
  query: string;
  context?: string;
}

/* ── Source Label Map ──────────────────────────────────────────────── */

const SOURCE_LABELS: Record<string, string> = {
  xlayer_assets: "X Layer Asset Registry",
  aave_earn: "Aave V3 Supply Rates",
  aave_borrow: "Aave V3 Borrow Rates",
};

/* ── Inner Drawer (remounted per query via key) ───────────────────── */

function DrawerContent({
  query,
  context,
  onClose,
}: {
  query: string;
  context?: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<IntelligenceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fullQuery = context ? `${context}: ${query}` : query;

    fetch("/api/markets/intelligence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: fullQuery }),
    })
      .then((res) => {
        if (!res.ok) {
          return res.json().then((body) => {
            throw new Error(body?.error ?? `Intelligence request failed (${res.status})`);
          });
        }
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Request failed";
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [query, context]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-scrim" onClick={onClose} />

      {/* Panel */}
      <div className="relative h-full w-full max-w-[520px] overflow-y-auto border-l border-edge bg-elevated shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-edge bg-elevated px-5 py-4">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-brand">
              Market Intelligence
            </div>
            <div className="mt-1 text-[12px] text-secondary line-clamp-1">{query}</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-[4px] border border-edge px-2 py-1 text-[10px] text-tertiary hover:text-primary"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Loading */}
          {loading && (
            <div className="border border-edge bg-surface p-6 text-center">
              <div className="text-[11px] text-secondary">Collecting market data &amp; running AI analysis…</div>
              <div className="mt-3 h-[2px] w-full overflow-hidden bg-overlay-hover">
                <div className="h-full w-1/3 animate-pulse bg-brand" />
              </div>
            </div>
          )}

          {/* Error — AI analysis unavailable, markets continue working */}
          {error && !loading && (
            <div className="border border-warning/20 bg-warning-soft/[0.06] p-4">
              <div className="text-[11px] font-semibold text-warning">AI analysis unavailable</div>
              <div className="mt-1 text-[10px] text-secondary">
                {error}. Market data and transactions continue to work normally.
              </div>
            </div>
          )}

          {/* Results */}
          {data && !loading && (
            <>
              {/* ── AI Interpretation ──────────────────────────────── */}
              <Section label="AI INTERPRETATION" tone="brand">
                <div className="text-[11px] leading-5 text-primary">
                  <SafeMarkdown content={data.answer} />
                </div>
              </Section>

              {/* ── Market State ───────────────────────────────────── */}
              <Section label="MARKET STATE" tone="default">
                <div className="space-y-2">
                  {data.trace.filter((t) => t.source === "xlayer_assets").map((t) => (
                    <div key={t.source} className="text-[10px]">
                      <span className="font-semibold text-primary">{t.record_count} verified assets</span>
                      <span className="text-tertiary"> on X Layer Mainnet</span>
                    </div>
                  ))}
                  {data.trace.filter((t) => t.source === "aave_earn").map((t) => (
                    <div key={t.source} className="text-[10px]">
                      <span className="font-semibold text-success">{t.record_count} supply opportunities</span>
                      <span className="text-tertiary"> via Aave V3</span>
                    </div>
                  ))}
                  {data.trace.filter((t) => t.source === "aave_borrow").map((t) => (
                    <div key={t.source} className="text-[10px]">
                      <span className="font-semibold text-primary">{t.record_count} borrow opportunities</span>
                      <span className="text-tertiary"> via Aave V3</span>
                    </div>
                  ))}
                </div>
              </Section>

              {/* ── ProofLayer Verification ─────────────────────────── */}
              <Section label="PROOFLAYER VERIFICATION" tone="success">
                <div className="text-[10px] text-secondary">
                  All market data is collected from on-chain read-only services.
                  No data is fabricated by the AI model. The grounding context
                  is built from ProofLayer&apos;s verified market data pipelines.
                </div>
              </Section>

              {/* ── Onchain Fact ───────────────────────────────────── */}
              <Section label="ONCHAIN FACT" tone="default">
                <div className="space-y-1.5">
                  {data.data_sources.map((src) => (
                    <div key={src} className="flex items-center gap-2 text-[10px]">
                      <span className="inline-block h-[6px] w-[6px] rounded-full bg-success" />
                      <span className="font-semibold text-primary">
                        {SOURCE_LABELS[src] ?? src}
                      </span>
                      <span className="text-tertiary">— on-chain verified</span>
                    </div>
                  ))}
                </div>
              </Section>

              {/* ── Risk Factors ────────────────────────────────────── */}
              <Section label="RISK FACTORS" tone="warning">
                <div className="text-[10px] text-secondary">
                  AI-generated analysis is informational only. Market conditions
                  change rapidly. Rates shown are point-in-time snapshots from
                  Aave V3 and Uniswap V3 contracts. Always verify independently
                  before transacting.
                </div>
              </Section>

              {/* ── Opportunity Factors ─────────────────────────────── */}
              <Section label="OPPORTUNITY FACTORS" tone="brand">
                <div className="text-[10px] text-secondary">
                  Supply APYs and borrow APRs reflect current on-chain rates.
                  Liquidity depth and utilization may affect execution. Collateral
                  requirements and LTV ratios are protocol-defined parameters.
                </div>
              </Section>

              {/* ── Data Limitations ────────────────────────────────── */}
              <Section label="DATA LIMITATIONS" tone="default">
                <div className="text-[10px] text-secondary">
                  The AI model can only reference data present in the grounding
                  context. Historical trends, cross-chain data, and off-chain
                  analytics are not included. No price oracle data is queried.
                </div>
              </Section>

              {/* ── Sources & Trace ─────────────────────────────────── */}
              <Section label="SOURCES" tone="default">
                <div className="space-y-2">
                  {data.trace.map((t) => (
                    <div key={t.source} className="border border-edge bg-surface p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-primary">
                          {SOURCE_LABELS[t.source] ?? t.source}
                        </span>
                        <span className={`rounded-[3px] px-1.5 py-0.5 text-[8px] font-bold uppercase ${
                          t.status === "ok"
                            ? "border border-success/20 bg-success-soft/[0.06] text-success"
                            : "border border-fail/20 bg-fail-soft/[0.06] text-fail"
                        }`}>
                          {t.status}
                        </span>
                      </div>
                      <div className="mt-1 text-[9px] text-tertiary">{t.summary}</div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* ── Observed Timestamp ──────────────────────────────── */}
              <div className="border-t border-edge pt-3">
                <div className="text-[8px] text-tertiary">
                  Observed: {new Date(data.observed_at).toLocaleString()} · Query: {data.query}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Public Drawer Component ──────────────────────────────────────── */

export function MarketIntelligenceDrawer({
  open,
  onClose,
  query,
  context,
}: MarketIntelligenceDrawerProps) {
  if (!open) return null;

  return (
    <DrawerContent
      key={`${query}-${context ?? ""}`}
      query={query}
      context={context}
      onClose={onClose}
    />
  );
}

/* ── Section Wrapper ────────────────────────────────────────────────── */

function Section({
  label,
  tone,
  children,
}: {
  label: string;
  tone: "default" | "brand" | "success" | "warning";
  children: React.ReactNode;
}) {
  const toneBorder: Record<string, string> = {
    default: "border-edge",
    brand: "border-brand/20",
    success: "border-success/20",
    warning: "border-warning/20",
  };
  const toneLabel: Record<string, string> = {
    default: "text-tertiary",
    brand: "text-brand",
    success: "text-success",
    warning: "text-warning",
  };

  return (
    <div className={`border ${toneBorder[tone]} bg-surface p-4`}>
      <div className={`mb-2 text-[8px] font-bold uppercase tracking-[0.14em] ${toneLabel[tone]}`}>
        {label}
      </div>
      {children}
    </div>
  );
}
