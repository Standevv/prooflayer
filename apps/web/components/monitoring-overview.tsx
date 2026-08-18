"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  formatMonitoringTime,
  freshnessStyle,
  resultStyle,
  type MonitoringApiError,
  type MonitoringAssetSummary,
  type MonitoringOverview,
} from "@/lib/monitoring";

function AssetMonitorCard({ item }: { item: MonitoringAssetSummary }) {
  const snapshot = item.current_snapshot;
  const result = snapshot?.verification_result ?? "NOT CHECKED";
  const rows = [
    ["Freshness at snapshot", snapshot?.evidence_freshness ?? "NOT CHECKED"],
    ["Certificate at snapshot", snapshot?.certificate_lifecycle_state ?? "NOT CHECKED"],
    ["PolicyGate at snapshot", snapshot?.policygate_outcome ?? "NOT CHECKED"],
    ["Snapshot captured", snapshot ? formatMonitoringTime(snapshot.checked_at) : "No baseline snapshot"],
  ];

  return (
    <article className="overflow-hidden rounded-[9px] border border-edge bg-surface transition-colors duration-150 hover:border-brand/30">
      <div className="flex items-start justify-between gap-4 border-b border-edge px-5 py-5">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-tertiary">Persisted monitoring history</p>
          <h2 className="mt-1 text-[28px] font-semibold tracking-[-0.045em] text-accent">{item.asset}</h2>
          <p className="mt-1 font-mono text-[10px] text-secondary">{item.claim}</p>
        </div>
        <span className={`rounded-[5px] border px-2.5 py-1.5 text-[9px] font-bold tracking-[0.1em] ${resultStyle(result)}`}>
          {snapshot ? `AS-OF RVC ${result}` : "NO SNAPSHOT"}
        </span>
      </div>

      <dl className="divide-y divide-edge px-5">
        {rows.map(([label, value], index) => (
          <div key={label} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 py-3">
            <dt className="text-[9px] font-medium uppercase tracking-[0.08em] text-tertiary">{label}</dt>
            <dd className={`break-words text-right font-mono text-[10px] ${index === 0 ? freshnessStyle(snapshot?.evidence_freshness ?? null) : "text-primary"}`}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="border-t border-edge px-5 py-3 text-[9px] leading-4 text-tertiary">Historical/as-of values only. This card does not infer a current RVC result.</p>

      <div className="grid grid-cols-2 border-t border-edge">
        <div className="border-r border-edge px-5 py-3">
          <p className="text-[8px] uppercase tracking-[0.1em] text-tertiary">Snapshots</p>
          <p className="mt-1 font-mono text-sm text-primary">{item.snapshot_count}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[8px] uppercase tracking-[0.1em] text-tertiary">Transitions</p>
          <p className="mt-1 font-mono text-sm text-primary">{item.transition_count}</p>
        </div>
      </div>
      <Link href={item.href} className="surface-transition flex items-center justify-between border-t border-edge px-5 py-3.5 text-[9px] font-bold uppercase tracking-[0.12em] text-accent hover:bg-brand/[0.05] hover:text-accent">
        View monitor <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}

export function MonitoringOverviewView() {
  const [data, setData] = useState<MonitoringOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/monitoring", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as MonitoringOverview | MonitoringApiError;
        if (!response.ok || !("assets" in payload)) throw new Error("error" in payload ? payload.error : "Monitoring service unavailable.");
        setData(payload);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Monitoring service unavailable.");
      });
    return () => controller.abort();
  }, []);

  if (error) {
    return <div className="rounded-[8px] border border-warning/25 bg-warning/[0.05] p-5 text-[11px] leading-5 text-warning"><strong className="block text-[9px] uppercase tracking-[0.12em] text-warning">Monitoring unavailable</strong><span className="mt-2 block">{error}</span></div>;
  }
  if (!data) {
    return <div className="grid gap-3 lg:grid-cols-2" aria-label="Loading monitoring state">{[0, 1].map((item) => <div key={item} className="h-[385px] animate-pulse rounded-[9px] border border-edge bg-overlay-hover" />)}</div>;
  }

  return (
    <>
      <section className="mb-4 rounded-[9px] border border-warning/20 bg-warning/[0.04] px-5 py-4" aria-label="Monitoring truth boundary">
        <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-warning">Historical / as-of snapshot data</p>
        <p className="mt-2 max-w-3xl text-[10px] leading-5 text-secondary">This view reads persisted monitoring history only. Current RVC truth is not fetched here and remains unavailable unless separately obtained from the current evidence API.</p>
      </section>
      <section className="grid gap-3 lg:grid-cols-2" aria-label="Persisted monitoring snapshots">
        {data.assets.map((item) => <AssetMonitorCard key={item.asset} item={item} />)}
      </section>
      <section className="mt-4 grid gap-4 rounded-[9px] border border-brand/20 bg-brand/[0.035] p-5 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-brand-bright">Monitoring mode · {data.monitoring_mode}</p>
          <p className="mt-2 max-w-2xl text-[11px] leading-5 text-secondary">Monitoring runs locally or through explicit checks. Every displayed result remains historical and bound to its recorded check time; production scheduling is not enabled.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[8px] font-semibold uppercase tracking-[0.09em] text-tertiary">
          <span className="rounded-[4px] border border-edge px-2 py-1.5">Read only</span>
          <span className="rounded-[4px] border border-edge px-2 py-1.5">No automatic issuance</span>
          <span className="rounded-[4px] border border-edge px-2 py-1.5">Local history</span>
        </div>
      </section>
    </>
  );
}
