"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CopyValue } from "@/components/copy-value";
import {
  displayValue,
  formatMonitoringTime,
  freshnessStyle,
  resultStyle,
  severityStyle,
  type MonitoringApiError,
  type MonitoringAssetDetail,
  type MonitoringCheckResult,
  type MonitoredAsset,
  type TransitionSeverity,
  type TrustSnapshot,
  type TrustTransition,
} from "@/lib/monitoring";

type Filter = "ALL" | TransitionSeverity;

async function fetchMonitoringDetail(asset: "usdy" | "paxg", signal?: AbortSignal): Promise<MonitoringAssetDetail> {
  const response = await fetch(`/api/monitoring/${asset}`, { cache: "no-store", signal });
  const payload = (await response.json()) as MonitoringAssetDetail | MonitoringApiError;
  if (!response.ok || !("recent_snapshots" in payload)) throw new Error("error" in payload ? payload.error : "Monitoring history unavailable.");
  return payload;
}

const SNAPSHOT_FIELDS: Array<{ label: string; read: (snapshot: TrustSnapshot) => string | number | boolean | string[] | null }> = [
  { label: "Verification", read: (snapshot) => snapshot.verification_result },
  { label: "Reason codes", read: (snapshot) => snapshot.reason_codes },
  { label: "Evidence freshness", read: (snapshot) => snapshot.evidence_freshness },
  { label: "Independent roots", read: (snapshot) => snapshot.independent_root_count },
  { label: "Evidence root", read: (snapshot) => snapshot.evidence_root },
  { label: "Certificate lifecycle", read: (snapshot) => snapshot.certificate_lifecycle_state },
  { label: "Certificate usable", read: (snapshot) => snapshot.certificate_usable },
  { label: "PolicyGate", read: (snapshot) => snapshot.policygate_outcome },
];

function ShortId({ value }: { value: string }) {
  return <span title={value}>{value.slice(0, 10)}…{value.slice(-6)}</span>;
}

function CurrentTrustState({ snapshot }: { snapshot: TrustSnapshot }) {
  const signals = [
    ["Verification", snapshot.verification_result],
    ["Certificate", snapshot.certificate_lifecycle_state],
    ["Evidence freshness", snapshot.evidence_freshness ?? "NOT CHECKED"],
    ["Independent roots", snapshot.independent_root_count ?? "NOT CHECKED"],
    ["PolicyGate", snapshot.policygate_outcome],
    ["Source status", snapshot.source_status],
  ];
  return (
    <section className="rounded-[9px] border border-white/[0.08] bg-[#101217]" aria-labelledby="current-trust-heading">
      <div className="flex flex-col gap-3 border-b border-white/[0.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8f84dd]">Current trust state</p><h2 id="current-trust-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#efeff3]">Latest deterministic snapshot</h2></div>
        <span className={`w-fit rounded-[5px] border px-2.5 py-1.5 text-[9px] font-bold tracking-[0.1em] ${resultStyle(snapshot.verification_result)}`}>{snapshot.verification_result}</span>
      </div>
      <dl className="grid sm:grid-cols-2 xl:grid-cols-3">
        {signals.map(([label, value], index) => (
          <div key={label} className={`border-white/[0.06] px-5 py-4 ${index < 3 ? "xl:border-b" : ""} ${index % 3 !== 2 ? "xl:border-r" : ""} ${index < 4 ? "max-sm:border-b" : ""} ${index % 2 === 0 ? "sm:border-r xl:border-r" : "sm:border-r-0"} ${index < 4 ? "sm:border-b" : ""}`}>
            <dt className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#686e7a]">{label}</dt>
            <dd className={`mt-2 break-words font-mono text-[12px] ${label === "Evidence freshness" ? freshnessStyle(snapshot.evidence_freshness) : "text-[#d8dae0]"}`}>{String(value)}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-4 border-t border-white/[0.07] px-5 py-4 md:grid-cols-2">
        <div><p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#686e7a]">Reason codes</p><div className="mt-2 flex flex-wrap gap-1.5">{snapshot.reason_codes.length ? snapshot.reason_codes.map((reason) => <span key={reason} className="rounded-[4px] border border-[#e9b949]/20 bg-[#e9b949]/[0.05] px-2 py-1 font-mono text-[8px] text-[#d8bc5a]">{reason}</span>) : <span className="text-[10px] text-[#777d89]">No reason codes.</span>}</div></div>
        <div><p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#686e7a]">Authenticity sources</p><div className="mt-2 flex flex-wrap gap-1.5">{snapshot.authenticity_sources.map((source) => <span key={source} className="rounded-[4px] border border-[#8f7df0]/20 bg-[#8f7df0]/[0.05] px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.06em] text-[#aaa0e8]">{source}</span>)}</div></div>
      </div>
      <div className="border-t border-white/[0.07] px-5 py-3 font-mono text-[9px] text-[#737986]">Checked {formatMonitoringTime(snapshot.checked_at)} · Snapshot <ShortId value={snapshot.snapshot_id} /></div>
      {snapshot.source_errors.length ? <div className="border-t border-[#e9b949]/15 bg-[#e9b949]/[0.035] px-5 py-3 text-[9px] leading-4 text-[#b8a362]">{snapshot.source_errors.map((error) => <p key={error}>{error}</p>)}</div> : null}
    </section>
  );
}

function FreshnessPanel({ snapshot }: { snapshot: TrustSnapshot }) {
  return (
    <section className="overflow-hidden rounded-[9px] border border-white/[0.08] bg-[#101217]" aria-labelledby="freshness-heading">
      <div className="border-b border-white/[0.07] px-5 py-4"><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8f84dd]">Evidence freshness</p><h2 id="freshness-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#efeff3]">Freshness policy evaluation</h2></div>
      {snapshot.evidence_freshness_records.length ? (
        <div className="overflow-x-auto"><table className="w-full min-w-[680px] border-collapse text-left"><thead><tr className="border-b border-white/[0.07] text-[8px] uppercase tracking-[0.1em] text-[#676d79]"><th className="px-5 py-3">Source</th><th className="px-5 py-3">Observed</th><th className="px-5 py-3">Policy max age</th><th className="px-5 py-3">State</th></tr></thead><tbody>{snapshot.evidence_freshness_records.map((record) => <tr key={record.source_id} className="border-b border-white/[0.055] last:border-0"><td className="px-5 py-3"><p className="font-mono text-[10px] text-[#d0d2d9]">{record.source_id}</p><p className="mt-1 text-[8px] uppercase tracking-[0.08em] text-[#707683]">{record.source_type}</p></td><td className="px-5 py-3 font-mono text-[9px] text-[#999eaa]">{record.observed_at ? formatMonitoringTime(record.observed_at) : "Not available"}</td><td className="px-5 py-3 font-mono text-[9px] text-[#999eaa]">{record.policy_max_age ?? "Not defined"}</td><td className={`px-5 py-3 font-mono text-[10px] font-semibold ${freshnessStyle(record.freshness)}`} title={record.explanation}>{record.freshness}</td></tr>)}</tbody></table></div>
      ) : <p className="px-5 py-5 text-[10px] leading-5 text-[#7d838f]">No attestation freshness record is present in the current evidence set. The aggregate state remains {snapshot.evidence_freshness ?? "not checked"}.</p>}
    </section>
  );
}

function CertificateLifecycle({ snapshot }: { snapshot: TrustSnapshot }) {
  const stages = ["ISSUED", "ACTIVE", "EXPIRED"];
  const current = snapshot.certificate_lifecycle_state;
  return (
    <section className="rounded-[9px] border border-white/[0.08] bg-[#101217]" aria-labelledby="certificate-lifecycle-heading">
      <div className="border-b border-white/[0.07] px-5 py-4"><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8f84dd]">Certificate lifecycle</p><h2 id="certificate-lifecycle-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#efeff3]">Historical result ≠ current usability</h2></div>
      <div className="px-5 py-5">
        <div className="flex items-center gap-2" aria-label={`Current certificate lifecycle: ${current}`}>{stages.map((stage, index) => <div key={stage} className="contents"><div className={`min-w-0 flex-1 rounded-[5px] border px-2 py-3 text-center text-[8px] font-bold tracking-[0.08em] ${current === stage ? "border-[#8f7df0]/40 bg-[#8f7df0]/[0.09] text-[#c8bfff]" : "border-white/[0.07] bg-black/15 text-[#656b77]"}`}>{stage}</div>{index < stages.length - 1 ? <span className="text-[#4e5360]" aria-hidden="true">→</span> : null}</div>)}</div>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[6px] border border-white/[0.07] bg-black/15 p-3"><dt className="text-[8px] uppercase tracking-[0.09em] text-[#676d79]">Historical verification result</dt><dd className="mt-1 font-mono text-[11px] text-[#d3d5db]">{snapshot.certificate_historical_result ?? "No certificate fixture"}</dd></div>
          <div className="rounded-[6px] border border-white/[0.07] bg-black/15 p-3"><dt className="text-[8px] uppercase tracking-[0.09em] text-[#676d79]">Current lifecycle state</dt><dd className="mt-1 font-mono text-[11px] text-[#d3d5db]">{current}</dd></div>
        </dl>
        {snapshot.certificate_id ? <div className="mt-4"><p className="text-[8px] uppercase tracking-[0.09em] text-[#676d79]">Certificate ID</p><div className="mt-1"><CopyValue value={snapshot.certificate_id} label="Certificate ID" /></div></div> : <p className="mt-4 text-[9px] leading-4 text-[#7b818d]">No exported certificate fixture is mapped to this asset; ProofLayer does not infer certificate state.</p>}
        {snapshot.certificate_valid_until ? <p className="mt-3 font-mono text-[9px] text-[#777d89]">Valid until {formatMonitoringTime(new Date(snapshot.certificate_valid_until * 1000).toISOString())}</p> : null}
      </div>
    </section>
  );
}

function StateHistory({ snapshots }: { snapshots: TrustSnapshot[] }) {
  return (
    <section className="rounded-[9px] border border-white/[0.08] bg-[#101217]" aria-labelledby="state-history-heading">
      <div className="border-b border-white/[0.07] px-5 py-4"><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8f84dd]">State history</p><h2 id="state-history-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#efeff3]">Persisted snapshots</h2></div>
      <div className="divide-y divide-white/[0.055]">
        {[...snapshots].reverse().map((snapshot) => <div key={snapshot.snapshot_id} className="grid gap-3 px-5 py-4 sm:grid-cols-[160px_1fr_auto] sm:items-center"><time className="font-mono text-[9px] text-[#777d89]" dateTime={snapshot.checked_at}>{formatMonitoringTime(snapshot.checked_at)}</time><div className="flex flex-wrap items-center gap-2"><span className={`rounded-[4px] border px-2 py-1 text-[8px] font-bold tracking-[0.08em] ${resultStyle(snapshot.verification_result)}`}>{snapshot.verification_result}</span><span className={`font-mono text-[9px] ${freshnessStyle(snapshot.evidence_freshness)}`}>{snapshot.evidence_freshness ?? "NOT CHECKED"}</span><span className="font-mono text-[9px] text-[#858b97]">Certificate {snapshot.certificate_lifecycle_state}</span></div><span className="font-mono text-[8px] text-[#606672]"><ShortId value={snapshot.snapshot_id} /></span></div>)}
      </div>
    </section>
  );
}

function TransitionTimeline({ transitions }: { transitions: TrustTransition[] }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const visible = filter === "ALL" ? transitions : transitions.filter((transition) => transition.severity === filter);
  const usability = transitions.findLast((item) => item.category === "CERTIFICATE_USABILITY_CHANGED");
  const policy = transitions.findLast((item) => item.category === "POLICYGATE_OUTCOME_CHANGED");
  const observedDownstream = usability && policy;
  return (
    <section className="rounded-[9px] border border-white/[0.08] bg-[#101217]" aria-labelledby="events-heading">
      <div className="flex flex-col gap-3 border-b border-white/[0.07] px-5 py-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8f84dd]">Events</p><h2 id="events-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#efeff3]">Trust transition timeline</h2></div><div className="flex flex-wrap gap-1" aria-label="Filter transition events">{(["ALL", "CRITICAL", "WARNING", "INFO"] as Filter[]).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} aria-pressed={filter === item} className={`rounded-[4px] border px-2 py-1 text-[8px] font-bold tracking-[0.08em] transition-colors duration-150 ${filter === item ? "border-[#8f7df0]/35 bg-[#8f7df0]/[0.1] text-[#c8bfff]" : "border-white/[0.08] text-[#737986] hover:text-[#c8cbd3]"}`}>{item}</button>)}</div></div>
      {observedDownstream ? <div className="border-b border-white/[0.06] bg-[#8f7df0]/[0.025] px-5 py-3 text-[9px] text-[#969ba7]"><span className="font-semibold text-[#aaa0e8]">Observed downstream sequence:</span> certificate usability {displayValue(usability.previous_value)} → {displayValue(usability.current_value)} · PolicyGate {displayValue(policy.previous_value)} → {displayValue(policy.current_value)}</div> : null}
      {visible.length ? <div className="divide-y divide-white/[0.055]">{[...visible].reverse().map((transition) => <article key={transition.transition_id} className="grid gap-3 px-5 py-4 sm:grid-cols-[130px_1fr]"><div><time className="font-mono text-[9px] text-[#777d89]" dateTime={transition.occurred_at}>{formatMonitoringTime(transition.occurred_at)}</time><span className={`mt-2 block w-fit rounded-[4px] border px-2 py-1 text-[8px] font-bold tracking-[0.08em] ${severityStyle(transition.severity)}`}>{transition.severity}</span></div><div><h3 className="font-mono text-[10px] font-semibold text-[#d5d7dd]">{transition.category.replaceAll("_", " ")}</h3><div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px]"><span className="break-all rounded-[4px] border border-white/[0.07] bg-black/15 px-2 py-1 text-[#969ba7]">{displayValue(transition.previous_value)}</span><span className="text-[#72699e]" aria-hidden="true">→</span><span className="break-all rounded-[4px] border border-[#8f7df0]/20 bg-[#8f7df0]/[0.05] px-2 py-1 text-[#c2b9f5]">{displayValue(transition.current_value)}</span></div><p className="mt-2 text-[10px] leading-5 text-[#838995]">{transition.explanation}</p></div></article>)}</div> : <p className="px-5 py-8 text-center text-[10px] text-[#767c88]">No trust-state changes detected yet{filter !== "ALL" ? ` for ${filter.toLowerCase()} events` : ""}.</p>}
    </section>
  );
}

function SnapshotComparison({ snapshots }: { snapshots: TrustSnapshot[] }) {
  const [leftId, setLeftId] = useState(snapshots.at(-2)?.snapshot_id ?? snapshots.at(-1)?.snapshot_id ?? "");
  const [rightId, setRightId] = useState(snapshots.at(-1)?.snapshot_id ?? "");
  const left = snapshots.find((snapshot) => snapshot.snapshot_id === leftId);
  const right = snapshots.find((snapshot) => snapshot.snapshot_id === rightId);
  if (snapshots.length < 2) return <section className="rounded-[9px] border border-white/[0.08] bg-[#101217] px-5 py-5"><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8f84dd]">Snapshot comparison</p><p className="mt-3 text-[10px] leading-5 text-[#7b818d]">Run at least two checks to compare persisted trust snapshots.</p></section>;
  return (
    <section className="rounded-[9px] border border-white/[0.08] bg-[#101217]" aria-labelledby="comparison-heading">
      <div className="border-b border-white/[0.07] px-5 py-4"><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8f84dd]">Snapshot comparison</p><h2 id="comparison-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#efeff3]">Previous vs current</h2></div>
      <div className="grid gap-3 border-b border-white/[0.06] px-5 py-4 sm:grid-cols-2"><label className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#6e7480]">Previous<select value={leftId} onChange={(event) => setLeftId(event.target.value)} className="mt-2 block w-full rounded-[5px] border border-white/[0.09] bg-[#0b0c10] px-3 py-2 font-mono text-[9px] normal-case tracking-normal text-[#c4c7cf] outline-none focus:border-[#8f7df0]/40">{snapshots.map((snapshot) => <option key={snapshot.snapshot_id} value={snapshot.snapshot_id}>{formatMonitoringTime(snapshot.checked_at)}</option>)}</select></label><label className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#6e7480]">Current<select value={rightId} onChange={(event) => setRightId(event.target.value)} className="mt-2 block w-full rounded-[5px] border border-white/[0.09] bg-[#0b0c10] px-3 py-2 font-mono text-[9px] normal-case tracking-normal text-[#c4c7cf] outline-none focus:border-[#8f7df0]/40">{snapshots.map((snapshot) => <option key={snapshot.snapshot_id} value={snapshot.snapshot_id}>{formatMonitoringTime(snapshot.checked_at)}</option>)}</select></label></div>
      {left && right ? <div className="divide-y divide-white/[0.055]">{SNAPSHOT_FIELDS.map((field) => { const previous = field.read(left); const current = field.read(right); const changed = JSON.stringify(previous) !== JSON.stringify(current); return <div key={field.label} className={`grid gap-2 px-5 py-3 sm:grid-cols-[140px_1fr_auto_1fr] sm:items-center ${changed ? "bg-[#8f7df0]/[0.025]" : "opacity-50"}`}><p className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#737986]">{field.label}</p><p className="break-all font-mono text-[9px] text-[#969ba7]">{displayValue(previous)}</p><span className="hidden text-[#756ca2] sm:inline" aria-hidden="true">→</span><p className={`break-all font-mono text-[9px] ${changed ? "text-[#c6bdf6]" : "text-[#969ba7]"}`}>{displayValue(current)}</p></div>; })}</div> : null}
    </section>
  );
}

export function AssetMonitor({ asset }: { asset: "usdy" | "paxg" }) {
  const [data, setData] = useState<MonitoringAssetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setData(await fetchMonitoringDetail(asset, signal));
  }, [asset]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchMonitoringDetail(asset, controller.signal).then(setData).catch((requestError: unknown) => {
      if (requestError instanceof Error && requestError.name === "AbortError") return;
      setError(requestError instanceof Error ? requestError.message : "Monitoring history unavailable.");
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [asset]);

  async function runCheck() {
    const monitoredAsset = asset.toUpperCase() as MonitoredAsset;
    const claim = monitoredAsset === "USDY" ? "TreasuryBacking" : "GoldBacking";
    setRunning(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/monitoring/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ asset: monitoredAsset, claim }) });
      const payload = (await response.json()) as MonitoringCheckResult | MonitoringApiError;
      if (!response.ok || !("current_snapshot" in payload)) throw new Error("error" in payload ? payload.error : "Monitoring check failed.");
      setNotice(payload.transitions.length ? `${payload.transitions.length} trust transition${payload.transitions.length === 1 ? "" : "s"} detected and persisted.` : payload.previous_snapshot ? "Check complete. No semantic trust-state change detected." : "Baseline snapshot established. No transition created.");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Monitoring check failed.");
    } finally { setRunning(false); }
  }

  const title = asset.toUpperCase();
  const current = data?.current_snapshot ?? null;
  const snapshots = useMemo(() => data?.recent_snapshots ?? [], [data]);

  return (
    <>
      <header className="command-header relative overflow-hidden rounded-[9px] border border-white/[0.08] px-5 py-7 sm:px-7 sm:py-8">
        <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div><Link href="/monitoring" className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8f84dd] hover:text-[#c5bcf7]">← Continuous Verification</Link><h1 className="mt-4 text-[34px] font-semibold leading-none tracking-[-0.052em] text-[#f7f7fa] sm:text-[44px]">{title} Monitor</h1><p className="mt-3 max-w-2xl text-[12px] leading-5 text-[#aeb2bd]">Read-only re-evaluation of verification, evidence freshness, certificate lifecycle and PolicyGate state.</p></div>
          <div className="flex flex-col items-start gap-2 md:items-end"><button type="button" onClick={() => void runCheck()} disabled={running} className="surface-transition rounded-[6px] border border-[#8f7df0]/35 bg-[#8f7df0]/[0.1] px-4 py-2.5 text-[9px] font-bold uppercase tracking-[0.11em] text-[#d5ceff] hover:border-[#8f7df0]/60 hover:bg-[#8f7df0]/[0.15] disabled:cursor-wait disabled:opacity-55">{running ? "Running deterministic check…" : "Run check now →"}</button><span className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#6f7581]">Read-only verification check</span></div>
        </div>
      </header>

      {error ? <div role="alert" className="mt-4 rounded-[7px] border border-[#ff6b6b]/25 bg-[#ff6b6b]/[0.05] px-4 py-3 text-[10px] leading-5 text-[#df8585]">{error}</div> : null}
      {notice ? <div role="status" className="mt-4 rounded-[7px] border border-[#36d17c]/20 bg-[#36d17c]/[0.045] px-4 py-3 text-[10px] text-[#72c997]">{notice}</div> : null}
      {loading ? <div className="mt-4 h-[420px] animate-pulse rounded-[9px] border border-white/[0.07] bg-white/[0.025]" /> : null}
      {!loading && data && !current ? <section className="mt-4 rounded-[9px] border border-white/[0.08] bg-[#101217] px-5 py-10 text-center"><p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-[#8f84dd]">No baseline snapshot</p><h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-[#ececf1]">This asset has not been checked yet.</h2><p className="mx-auto mt-2 max-w-lg text-[10px] leading-5 text-[#7c828e]">Run an explicit read-only check to establish current repository truth. The first snapshot will not create a transition.</p></section> : null}
      {data && current ? <div className="mt-4 space-y-4"><CurrentTrustState snapshot={current} /><div className="grid gap-4 xl:grid-cols-2"><FreshnessPanel snapshot={current} /><CertificateLifecycle snapshot={current} /></div><TransitionTimeline transitions={data.recent_transitions} /><StateHistory snapshots={snapshots} /><SnapshotComparison key={snapshots.map((snapshot) => snapshot.snapshot_id).join(":")} snapshots={snapshots} /><section className="grid gap-4 rounded-[9px] border border-[#8f7df0]/18 bg-[#8f7df0]/[0.03] p-5 md:grid-cols-[1fr_auto] md:items-center"><div><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#a99cf3]">Monitoring mode · {data.monitoring_mode}</p><p className="mt-2 text-[10px] leading-5 text-[#888e9a]">Checks are explicit or local-process driven. Production scheduling, notifications and automatic certificate issuance, reissuance or revocation are not enabled.</p></div><div className="font-mono text-[9px] text-[#747a86]">Interval guidance: {data.config.check_interval_seconds}s</div></section></div> : null}
    </>
  );
}
