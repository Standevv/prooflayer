"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  policyDecisionStyle,
  policyTime,
  policyValue,
  type InstitutionalPolicy,
  type PolicyApiError,
  type PolicyStudioOverview,
  type PolicySummary,
} from "@/lib/policies";

function PresetCard({ item }: { item: PolicySummary }) {
  const policy = item.policy;
  const decision = item.last_evaluation?.final_decision ?? "NOT EVALUATED";
  return (
    <article className="flex flex-col rounded-[8px] border border-edge bg-surface transition-colors duration-150 hover:border-brand/30">
      <div className="flex items-start justify-between gap-3 border-b border-edge px-4 py-4">
        <div><p className="text-[8px] font-bold uppercase tracking-[0.12em] text-brand">Policy preset</p><h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-accent">{policy.name}</h2></div>
        <span className="rounded-[4px] border border-edge px-2 py-1 font-mono text-[8px] text-secondary">v{policy.policy_version}</span>
      </div>
      <div className="flex-1 px-4 py-4"><p className="min-h-10 text-[10px] leading-5 text-secondary">{policy.description}</p><dl className="mt-4 space-y-2 border-t border-edge pt-3 text-[9px]"><div className="flex justify-between gap-3"><dt className="text-tertiary">Claim</dt><dd className="font-mono text-primary">{policy.supported_claim}</dd></div><div className="flex justify-between gap-3"><dt className="text-tertiary">Minimum roots</dt><dd className="font-mono text-primary">{policy.minimum_independent_roots ?? "None"}</dd></div><div className="flex justify-between gap-3"><dt className="text-tertiary">Certificate</dt><dd className="font-mono text-primary">{policy.require_certificate_usable ? "Usable required" : policy.require_certificate ? "Required" : "Not required"}</dd></div></dl><span className={`mt-4 inline-block rounded-[4px] border px-2 py-1 text-[8px] font-bold tracking-[0.08em] ${policyDecisionStyle(decision)}`}>{decision.replaceAll("_", " ")}</span></div>
      <div className="grid grid-cols-2 border-t border-edge"><Link href={item.href} className="surface-transition border-r border-edge px-4 py-3 text-[8px] font-bold uppercase tracking-[0.1em] text-brand-bright hover:bg-brand/[0.05]">View policy →</Link><Link href={`/policies/new?preset=${policy.policy_id}`} className="surface-transition px-4 py-3 text-right text-[8px] font-bold uppercase tracking-[0.1em] text-secondary hover:bg-overlay-hover hover:text-primary">Use preset</Link></div>
    </article>
  );
}

function PolicyComparison({ policies }: { policies: InstitutionalPolicy[] }) {
  const [leftChoice, setLeftChoice] = useState("");
  const [rightChoice, setRightChoice] = useState("");
  const leftId = leftChoice || policies[0]?.policy_id || "";
  const rightId = rightChoice || policies[1]?.policy_id || policies[0]?.policy_id || "";
  const index = useMemo(() => new Map(policies.map((policy) => [policy.policy_id, policy])), [policies]);
  const left = index.get(leftId);
  const right = index.get(rightId);
  if (policies.length < 2 || !left || !right) return null;
  const rows: Array<[string, (policy: InstitutionalPolicy) => unknown]> = [
    ["Required result", (policy) => policy.required_verification_results],
    ["Minimum roots", (policy) => policy.minimum_independent_roots],
    ["Certificate", (policy) => policy.require_certificate],
    ["Usable certificate", (policy) => policy.require_certificate_usable],
    ["Not revoked", (policy) => policy.require_not_revoked],
    ["PolicyGate ALLOW", (policy) => policy.require_policygate_allow],
    ["Attestation age", (policy) => policy.maximum_attestation_age_days === null ? null : `${policy.maximum_attestation_age_days} days`],
  ];
  return (
    <section className="mt-4 overflow-hidden rounded-[9px] border border-edge bg-surface" aria-labelledby="policy-comparison-heading">
      <div className="border-b border-edge px-5 py-4"><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-brand">Policy comparison</p><h2 id="policy-comparison-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-accent">Compare requirements, not scores</h2></div>
      <div className="grid gap-3 border-b border-edge px-5 py-4 sm:grid-cols-2"><label className="text-[8px] font-semibold uppercase tracking-[0.09em] text-tertiary">Policy A<select value={leftId} onChange={(event) => setLeftChoice(event.target.value)} className="mt-2 block w-full rounded-[5px] border border-edge bg-background px-3 py-2 text-[10px] normal-case tracking-normal text-primary">{policies.map((policy) => <option key={policy.policy_id} value={policy.policy_id}>{policy.name} · v{policy.policy_version}</option>)}</select></label><label className="text-[8px] font-semibold uppercase tracking-[0.09em] text-tertiary">Policy B<select value={rightId} onChange={(event) => setRightChoice(event.target.value)} className="mt-2 block w-full rounded-[5px] border border-edge bg-background px-3 py-2 text-[10px] normal-case tracking-normal text-primary">{policies.map((policy) => <option key={policy.policy_id} value={policy.policy_id}>{policy.name} · v{policy.policy_version}</option>)}</select></label></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[600px] border-collapse text-left"><thead><tr className="border-b border-edge text-[8px] uppercase tracking-[0.09em] text-tertiary"><th className="px-5 py-3">Requirement</th><th className="px-5 py-3">{left.name}</th><th className="px-5 py-3">{right.name}</th></tr></thead><tbody>{rows.map(([label, read]) => <tr key={label} className="border-b border-edge last:border-0"><th className="px-5 py-3 text-[9px] font-medium text-secondary">{label}</th><td className="px-5 py-3 font-mono text-[9px] text-primary">{policyValue(read(left))}</td><td className="px-5 py-3 font-mono text-[9px] text-primary">{policyValue(read(right))}</td></tr>)}</tbody></table></div>
    </section>
  );
}

export function PolicyStudioOverviewView() {
  const [data, setData] = useState<PolicyStudioOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/policies", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const payload = (await response.json()) as PolicyStudioOverview | PolicyApiError;
      if (!response.ok || !("presets" in payload)) throw new Error("error" in payload ? payload.error : "Policy Studio unavailable.");
      setData(payload);
    }).catch((requestError: unknown) => { if (requestError instanceof Error && requestError.name === "AbortError") return; setError(requestError instanceof Error ? requestError.message : "Policy Studio unavailable."); });
    return () => controller.abort();
  }, []);
  if (error) return <div className="rounded-[8px] border border-warning/25 bg-warning/[0.05] p-5 text-[10px] leading-5 text-warning">{error}</div>;
  if (!data) return <div className="grid gap-3 lg:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-80 animate-pulse rounded-[8px] border border-edge bg-overlay-hover" />)}</div>;
  const allPolicies = [...data.presets, ...data.saved_policies].map((summary) => summary.policy);
  return (
    <>
      <section aria-labelledby="policy-presets-heading"><div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-brand">Policy presets</p><h2 id="policy-presets-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-accent">Start from explicit policy requirements</h2></div><span className="hidden text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary sm:block">Not regulatory standards</span></div><div className="grid gap-3 lg:grid-cols-3">{data.presets.map((item) => <PresetCard key={item.policy.policy_id} item={item} />)}</div></section>
      <section className="mt-4 overflow-hidden rounded-[9px] border border-edge bg-surface" aria-labelledby="saved-policies-heading"><div className="flex items-center justify-between gap-3 border-b border-edge px-5 py-4"><div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-brand">Saved policies</p><h2 id="saved-policies-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-accent">Versioned local configurations</h2></div><Link href="/policies/new" className="rounded-[6px] border border-brand/35 bg-brand/[0.1] px-3 py-2 text-[8px] font-bold uppercase tracking-[0.1em] text-brand-ink">Create policy →</Link></div>{data.saved_policies.length ? <div className="overflow-x-auto"><table className="w-full min-w-[880px] border-collapse text-left"><thead><tr className="border-b border-edge text-[8px] uppercase tracking-[0.09em] text-tertiary"><th className="px-5 py-3">Policy</th><th className="px-5 py-3">Version</th><th className="px-5 py-3">Claim</th><th className="px-5 py-3">Minimum roots</th><th className="px-5 py-3">Certificate</th><th className="px-5 py-3">PolicyGate</th><th className="px-5 py-3">Last evaluation</th></tr></thead><tbody>{data.saved_policies.map((item) => <tr key={item.policy.policy_id} className="border-b border-edge last:border-0"><td className="px-5 py-3"><Link href={item.href} className="text-[10px] font-semibold text-brand-ink hover:text-primary">{item.policy.name}</Link><p className="mt-1 font-mono text-[8px] text-tertiary">{item.policy.policy_id}</p></td><td className="px-5 py-3 font-mono text-[9px] text-primary">v{item.policy.policy_version}</td><td className="px-5 py-3 font-mono text-[9px] text-primary">{item.policy.supported_claim}</td><td className="px-5 py-3 font-mono text-[9px] text-primary">{item.policy.minimum_independent_roots ?? "None"}</td><td className="px-5 py-3 text-[9px] text-primary">{item.policy.require_certificate_usable ? "Usable" : item.policy.require_certificate ? "Required" : "No"}</td><td className="px-5 py-3 text-[9px] text-primary">{item.policy.require_policygate_allow ? "ALLOW" : "Not required"}</td><td className="px-5 py-3 font-mono text-[8px] text-secondary">{policyTime(item.last_evaluation?.evaluated_at ?? null)}</td></tr>)}</tbody></table></div> : <div className="px-5 py-9 text-center"><p className="text-[10px] text-tertiary">No custom policies have been saved yet.</p><Link href="/policies/new" className="mt-3 inline-block text-[9px] font-semibold uppercase tracking-[0.1em] text-brand-bright">Create the first policy →</Link></div>}</section>
      <PolicyComparison policies={allPolicies} />
      <section className="mt-4 grid gap-3 rounded-[9px] border border-brand/18 bg-brand/[0.03] p-5 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-brand-bright">MVP / Pre-production</p><p className="mt-2 text-[10px] leading-5 text-secondary">Policies are off-chain, locally persisted configurations. Monitoring does not automatically re-evaluate policies yet.</p></div><span className="font-mono text-[8px] text-tertiary">No wallet · No transaction</span></section>
    </>
  );
}
