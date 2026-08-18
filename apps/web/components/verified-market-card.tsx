"use client";

import { useEffect, useState } from "react";

import {
  fetchMarketEligibility,
  type MarketTraceStep,
  type SupportedMarketAsset,
  type MarketEligibilityResult,
} from "@/lib/markets";

type Props = {
  asset: SupportedMarketAsset;
};

export function VerifiedMarketCard({ asset }: Props) {
  const [result, setResult] = useState<MarketEligibilityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchMarketEligibility(asset, "swap")
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Request failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asset]);

  const isAccessible = result?.recommendation === "ACCESSIBLE";
  const isBlocked = result?.recommendation === "BLOCKED";

  return (
    <article className="overflow-hidden rounded-[10px] border border-edge bg-surface">
      <div className="border-b border-edge px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-brand">
            {asset} Market
          </p>
          <span className="rounded-[3px] border border-success/20 bg-success-soft/[0.045] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-success">
            X Layer Testnet
          </span>
        </div>
        <h2 className="mt-2 text-lg font-semibold tracking-[-0.025em] text-primary">
          Verification-Gated Access
        </h2>
        <p className="mt-1.5 text-[11px] leading-5 text-tertiary">
          Market actions require a valid PASS certificate enforced on-chain via PolicyGate.
        </p>
      </div>

      <div className="p-5 sm:p-6">
        {loading && (
          <div className="flex items-center gap-2 text-[11px] text-tertiary">
            <span className="size-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            Checking eligibility...
          </div>
        )}

        {error && (
          <div className="rounded-[6px] border border-warning/20 bg-warning/[0.04] px-4 py-3 text-[11px] text-warning">
            <p className="font-semibold">Backend unavailable</p>
            <p className="mt-1 text-secondary">Start the Python API to check market eligibility.</p>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* Recommendation — BLOCKED is success for enforcement */}
            <div
              className={`rounded-[6px] border px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] ${
                isAccessible
                  ? "border-success/25 bg-success-soft/[0.045] text-success"
                  : isBlocked
                    ? "border-success/25 bg-success-soft/[0.045] text-success"
                    : "border-warning/25 bg-warning-soft/[0.045] text-warning"
              }`}
            >
              {isAccessible
                ? "ACCESSIBLE"
                : isBlocked
                  ? "ENFORCEMENT ACTIVE — BLOCKED"
                  : "UNAVAILABLE"}
            </div>

            {isBlocked && (
              <p className="text-[10px] leading-4 text-secondary text-center">
                BLOCK is a successful ProofLayer enforcement result.
                The certificate is not usable, so PolicyGate correctly blocks market access.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 text-[10px]">
              <div className="rounded-[6px] border border-edge bg-scrim px-3 py-2.5">
                <p className="text-[8px] uppercase tracking-[0.08em] text-tertiary">RVC Result</p>
                <p className={`mt-1 font-semibold ${
                  result.verification_result === "PASS" ? "text-success" :
                  result.verification_result === "FAIL" ? "text-fail" : "text-warning"
                }`}>
                  {result.verification_result ?? "--"}
                </p>
              </div>
              <div className="rounded-[6px] border border-edge bg-scrim px-3 py-2.5">
                <p className="text-[8px] uppercase tracking-[0.08em] text-tertiary">Certificate</p>
                <p className="mt-1 font-semibold text-primary">
                  {result.certificate_state}
                </p>
              </div>
              <div className="rounded-[6px] border border-edge bg-scrim px-3 py-2.5">
                <p className="text-[8px] uppercase tracking-[0.08em] text-tertiary">PolicyGate</p>
                <p className="mt-1 font-semibold text-primary">
                  {result.policygate_outcome}
                </p>
              </div>
              <div className="rounded-[6px] border border-edge bg-scrim px-3 py-2.5">
                <p className="text-[8px] uppercase tracking-[0.08em] text-tertiary">Chain</p>
                <p className="mt-1 font-mono font-semibold text-primary">
                  {result.chain_id}
                </p>
              </div>
            </div>

            {result.blocking_reasons.length > 0 && (
              <div className="space-y-1">
                <p className="text-[8px] font-semibold uppercase tracking-[0.09em] text-tertiary">
                  Blocking reasons
                </p>
                <ul className="space-y-1">
                  {result.blocking_reasons.map((reason: string, i: number) => (
                    <li key={i} className="text-[10px] leading-4 text-secondary">
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.explanation.length > 0 && (
              <div className="space-y-1.5 border-t border-edge pt-4">
                <p className="text-[8px] font-semibold uppercase tracking-[0.09em] text-tertiary">
                  Explanation
                </p>
                <ol className="space-y-1">
                  {result.explanation.map((line: string, i: number) => (
                    <li key={i} className="flex gap-2 text-[10px] leading-4 text-secondary">
                      <span className="mt-0.5 shrink-0 font-mono text-[8px] text-tertiary">{i + 1}.</span>
                      {line}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {result.trace.length > 0 && (
              <div className="space-y-1.5 border-t border-edge pt-4">
                <p className="text-[8px] font-semibold uppercase tracking-[0.09em] text-tertiary">
                  Tool trace
                </p>
                <ol className="space-y-1">
                  {result.trace.map((step: MarketTraceStep) => (
                    <li key={step.step} className="flex items-baseline gap-2 text-[10px] text-secondary">
                      <span className="font-mono text-[8px] text-tertiary">{step.step}.</span>
                      <span className="font-mono text-[9px] text-accent">{step.tool}</span>
                      <span className="text-[8px] text-tertiary">{step.outcome}</span>
                      <span className="ml-auto font-mono text-[8px] text-tertiary">{step.duration_ms.toFixed(1)}ms</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
