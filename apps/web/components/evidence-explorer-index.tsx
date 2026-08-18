"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { CopyValue } from "@/components/copy-value";
import { EvidenceSourceBadge } from "@/components/evidence-source-badge";
import {
  evidenceResultStyle,
  freshnessStyle,
  type EvidenceApiError,
  type EvidenceAssetSummary,
  type EvidenceExplorerIndex,
} from "@/lib/evidence";

function LoadingState() {
  return (
    <div className="grid gap-3 lg:grid-cols-2" aria-label="Loading evidence assets">
      {[0, 1].map((item) => (
        <div key={item} className="h-[330px] animate-pulse rounded-[8px] border border-edge bg-overlay-hover" />
      ))}
    </div>
  );
}

function AssetEvidenceCard({ item }: { item: EvidenceAssetSummary }) {
  return (
    <article className="group overflow-hidden rounded-[8px] border border-edge bg-surface transition-colors duration-150 hover:border-brand/30">
      <div className="flex items-start justify-between gap-4 border-b border-edge px-4 py-4 sm:px-5">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-tertiary">Normalized evidence set</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-accent">{item.asset}</h2>
          <p className="mt-1 text-[11px] text-secondary">{item.claim} · {item.asset_class}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`rounded-[4px] border px-2 py-1 text-[8px] font-bold tracking-[0.08em] ${evidenceResultStyle(item.verification_result)}`}>
            {item.verification_result}
          </span>
          <span className={`rounded-[4px] border px-2 py-1 text-[8px] font-bold tracking-[0.08em] ${freshnessStyle(item.freshness_summary)}`}>
            {item.freshness_summary}
          </span>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <dl className="grid grid-cols-3 gap-2">
          {[
            ["Records", item.evidence_record_count],
            ["Sources", item.observed_source_count],
            ["Independent roots", item.independent_root_count],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[6px] border border-edge bg-scrim px-3 py-3">
              <dt className="text-[7px] font-semibold uppercase tracking-[0.09em] text-tertiary">{label}</dt>
              <dd className="mt-1 text-lg font-semibold tracking-[-0.03em] text-primary">{value}</dd>
            </div>
          ))}
        </dl>
        <div>
          <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">Independent root IDs</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.independent_root_ids.map((root) => (
              <span key={root} className="rounded-[3px] border border-brand/20 bg-brand/[0.05] px-2 py-1 font-mono text-[9px] text-accent">{root}</span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">Evidence commitment</p>
          <div className="mt-1"><CopyValue value={item.evidence_commitment} label={`${item.asset} evidence commitment`} /></div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {item.authenticity_labels.map((label) => <EvidenceSourceBadge key={label} label={label} />)}
        </div>
        {item.reason_codes.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 border-t border-edge pt-3">
            {item.reason_codes.map((reason) => (
              <span key={reason} className="font-mono text-[8px] text-warning">{reason}</span>
            ))}
          </div>
        ) : null}
      </div>
      <Link href={item.href} className="surface-transition flex items-center justify-between border-t border-edge px-4 py-3 text-[9px] font-bold uppercase tracking-[0.1em] text-brand-bright hover:bg-brand/[0.05] hover:text-accent sm:px-5">
        Inspect evidence graph <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}

export function EvidenceExplorerIndexView() {
  const [data, setData] = useState<EvidenceExplorerIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/evidence", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as EvidenceExplorerIndex | EvidenceApiError;
        if (!response.ok || !("assets" in payload)) throw new Error("error" in payload ? payload.error : "Evidence service unavailable.");
        setData(payload);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Evidence service unavailable.");
      });
    return () => controller.abort();
  }, []);

  return (
    <>
      <section className="rounded-[9px] border border-edge bg-accent-soft p-4 sm:p-5" aria-labelledby="evidence-assets-heading">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-brand">Current repository truth</p>
            <h2 id="evidence-assets-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-accent">Supported evidence sets</h2>
          </div>
          <p className="max-w-lg text-[10px] leading-4 text-tertiary">{data?.source_mode_note ?? "Loading source classification…"}</p>
        </div>
        {error ? (
          <div className="rounded-[7px] border border-warning/20 bg-warning/[0.05] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-warning">Evidence service unavailable</p>
            <p className="mt-2 text-[11px] leading-5 text-warning">{error}</p>
          </div>
        ) : data === null ? <LoadingState /> : (
          <div className="grid gap-3 lg:grid-cols-2">{data.assets.map((item) => <AssetEvidenceCard key={item.asset} item={item} />)}</div>
        )}
      </section>

      {data ? (
        <section className="mt-4 overflow-hidden rounded-[9px] border border-edge bg-surface" aria-labelledby="evidence-comparison-heading">
          <div className="border-b border-edge px-5 py-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-tertiary">Side-by-side</p>
            <h2 id="evidence-comparison-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-accent">Evidence comparison</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-[10px]">
              <thead><tr className="border-b border-edge text-[8px] uppercase tracking-[0.1em] text-tertiary"><th className="px-5 py-3">Signal</th>{data.assets.map((item) => <th key={item.asset} className="px-5 py-3 text-primary">{item.asset}</th>)}</tr></thead>
              <tbody>
                {[
                  ["Evidence records", (item: EvidenceAssetSummary) => item.evidence_record_count],
                  ["Observed sources", (item: EvidenceAssetSummary) => item.observed_source_count],
                  ["Independent roots", (item: EvidenceAssetSummary) => `${item.independent_root_count} · ${item.independent_root_ids.join(", ")}`],
                  ["Verification", (item: EvidenceAssetSummary) => item.verification_result],
                  ["Attestation freshness", (item: EvidenceAssetSummary) => item.freshness_summary],
                  ["On-chain evidence", (item: EvidenceAssetSummary) => item.authenticity_labels.includes("ON-CHAIN") ? "Present" : "None in current set"],
                  ["Reason codes", (item: EvidenceAssetSummary) => item.reason_codes.join(", ") || "None"],
                ].map(([label, getter]) => {
                  const read = getter as (item: EvidenceAssetSummary) => string | number;
                  return <tr key={label as string} className="border-b border-edge last:border-0"><th className="px-5 py-3 font-medium text-secondary">{label as string}</th>{data.assets.map((item) => <td key={item.asset} className="px-5 py-3 font-mono text-primary">{read(item)}</td>)}</tr>;
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
