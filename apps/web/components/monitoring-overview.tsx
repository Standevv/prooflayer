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
    ["Evidence freshness", snapshot?.evidence_freshness ?? "NOT CHECKED"],
    ["Certificate", snapshot?.certificate_lifecycle_state ?? "NOT CHECKED"],
    ["PolicyGate", snapshot?.policygate_outcome ?? "NOT CHECKED"],
    ["Last checked", snapshot ? formatMonitoringTime(snapshot.checked_at) : "No baseline snapshot"],
  ];

  return (
    <article className="overflow-hidden rounded-[9px] border border-white/[0.09] bg-[#101217] transition-colors duration-150 hover:border-[#8f7df0]/30">
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-5">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-[#777d89]">Monitored asset</p>
          <h2 className="mt-1 text-[28px] font-semibold tracking-[-0.045em] text-[#f4f4f7]">{item.asset}</h2>
          <p className="mt-1 font-mono text-[10px] text-[#959aa6]">{item.claim}</p>
        </div>
        <span className={`rounded-[5px] border px-2.5 py-1.5 text-[9px] font-bold tracking-[0.1em] ${resultStyle(result)}`}>
          {result}
        </span>
      </div>

      <dl className="divide-y divide-white/[0.055] px-5">
        {rows.map(([label, value], index) => (
          <div key={label} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 py-3">
            <dt className="text-[9px] font-medium uppercase tracking-[0.08em] text-[#686e7a]">{label}</dt>
            <dd className={`break-words text-right font-mono text-[10px] ${index === 0 ? freshnessStyle(snapshot?.evidence_freshness ?? null) : "text-[#c8cbd3]"}`}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-2 border-t border-white/[0.07]">
        <div className="border-r border-white/[0.07] px-5 py-3">
          <p className="text-[8px] uppercase tracking-[0.1em] text-[#686e7a]">Snapshots</p>
          <p className="mt-1 font-mono text-sm text-[#e0e1e6]">{item.snapshot_count}</p>
        </div>
        <div className="px-5 py-3">
          <p className="text-[8px] uppercase tracking-[0.1em] text-[#686e7a]">Transitions</p>
          <p className="mt-1 font-mono text-sm text-[#e0e1e6]">{item.transition_count}</p>
        </div>
      </div>
      <Link href={item.href} className="surface-transition flex items-center justify-between border-t border-white/[0.07] px-5 py-3.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#aa9df4] hover:bg-[#8f7df0]/[0.05] hover:text-[#d8d2ff]">
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
    return <div className="rounded-[8px] border border-[#e9b949]/25 bg-[#e9b949]/[0.05] p-5 text-[11px] leading-5 text-[#d3bd70]"><strong className="block text-[9px] uppercase tracking-[0.12em] text-[#e9c55f]">Monitoring unavailable</strong><span className="mt-2 block">{error}</span></div>;
  }
  if (!data) {
    return <div className="grid gap-3 lg:grid-cols-2" aria-label="Loading monitoring state">{[0, 1].map((item) => <div key={item} className="h-[385px] animate-pulse rounded-[9px] border border-white/[0.07] bg-white/[0.025]" />)}</div>;
  }

  return (
    <>
      <section className="grid gap-3 lg:grid-cols-2" aria-label="Monitored assets">
        {data.assets.map((item) => <AssetMonitorCard key={item.asset} item={item} />)}
      </section>
      <section className="mt-4 grid gap-4 rounded-[9px] border border-[#8f7df0]/20 bg-[#8f7df0]/[0.035] p-5 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#a99cf3]">Monitoring mode · {data.monitoring_mode}</p>
          <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[#989da9]">Current MVP monitoring runs locally or through explicit checks. Production scheduling is not yet enabled.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[8px] font-semibold uppercase tracking-[0.09em] text-[#777d89]">
          <span className="rounded-[4px] border border-white/[0.08] px-2 py-1.5">Read only</span>
          <span className="rounded-[4px] border border-white/[0.08] px-2 py-1.5">No automatic issuance</span>
          <span className="rounded-[4px] border border-white/[0.08] px-2 py-1.5">Local history</span>
        </div>
      </section>
    </>
  );
}
