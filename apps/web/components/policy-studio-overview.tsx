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
    <article className="flex flex-col rounded-[8px] border border-white/[0.09] bg-[#101217] transition-colors duration-150 hover:border-[#8f7df0]/30">
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-4 py-4">
        <div><p className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#8f84dd]">Demo policy preset</p><h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[#efeff3]">{policy.name}</h2></div>
        <span className="rounded-[4px] border border-white/[0.08] px-2 py-1 font-mono text-[8px] text-[#858b97]">v{policy.policy_version}</span>
      </div>
      <div className="flex-1 px-4 py-4"><p className="min-h-10 text-[10px] leading-5 text-[#858b97]">{policy.description}</p><dl className="mt-4 space-y-2 border-t border-white/[0.06] pt-3 text-[9px]"><div className="flex justify-between gap-3"><dt className="text-[#686e7a]">Claim</dt><dd className="font-mono text-[#c4c7cf]">{policy.supported_claim}</dd></div><div className="flex justify-between gap-3"><dt className="text-[#686e7a]">Minimum roots</dt><dd className="font-mono text-[#c4c7cf]">{policy.minimum_independent_roots ?? "None"}</dd></div><div className="flex justify-between gap-3"><dt className="text-[#686e7a]">Certificate</dt><dd className="font-mono text-[#c4c7cf]">{policy.require_certificate_usable ? "Usable required" : policy.require_certificate ? "Required" : "Not required"}</dd></div></dl><span className={`mt-4 inline-block rounded-[4px] border px-2 py-1 text-[8px] font-bold tracking-[0.08em] ${policyDecisionStyle(decision)}`}>{decision.replaceAll("_", " ")}</span></div>
      <div className="grid grid-cols-2 border-t border-white/[0.07]"><Link href={item.href} className="surface-transition border-r border-white/[0.07] px-4 py-3 text-[8px] font-bold uppercase tracking-[0.1em] text-[#a99df4] hover:bg-[#8f7df0]/[0.05]">View policy →</Link><Link href={`/policies/new?preset=${policy.policy_id}`} className="surface-transition px-4 py-3 text-right text-[8px] font-bold uppercase tracking-[0.1em] text-[#888e99] hover:bg-white/[0.025] hover:text-[#c8cbd3]">Use preset</Link></div>
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
    <section className="mt-4 overflow-hidden rounded-[9px] border border-white/[0.08] bg-[#101217]" aria-labelledby="policy-comparison-heading">
      <div className="border-b border-white/[0.07] px-5 py-4"><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8f84dd]">Policy comparison</p><h2 id="policy-comparison-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#efeff3]">Compare requirements, not scores</h2></div>
      <div className="grid gap-3 border-b border-white/[0.06] px-5 py-4 sm:grid-cols-2"><label className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#727884]">Policy A<select value={leftId} onChange={(event) => setLeftChoice(event.target.value)} className="mt-2 block w-full rounded-[5px] border border-white/[0.09] bg-[#0b0c10] px-3 py-2 text-[10px] normal-case tracking-normal text-[#d1d3da]">{policies.map((policy) => <option key={policy.policy_id} value={policy.policy_id}>{policy.name} · v{policy.policy_version}</option>)}</select></label><label className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#727884]">Policy B<select value={rightId} onChange={(event) => setRightChoice(event.target.value)} className="mt-2 block w-full rounded-[5px] border border-white/[0.09] bg-[#0b0c10] px-3 py-2 text-[10px] normal-case tracking-normal text-[#d1d3da]">{policies.map((policy) => <option key={policy.policy_id} value={policy.policy_id}>{policy.name} · v{policy.policy_version}</option>)}</select></label></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[600px] border-collapse text-left"><thead><tr className="border-b border-white/[0.06] text-[8px] uppercase tracking-[0.09em] text-[#686e7a]"><th className="px-5 py-3">Requirement</th><th className="px-5 py-3">{left.name}</th><th className="px-5 py-3">{right.name}</th></tr></thead><tbody>{rows.map(([label, read]) => <tr key={label} className="border-b border-white/[0.05] last:border-0"><th className="px-5 py-3 text-[9px] font-medium text-[#858b97]">{label}</th><td className="px-5 py-3 font-mono text-[9px] text-[#c5c8cf]">{policyValue(read(left))}</td><td className="px-5 py-3 font-mono text-[9px] text-[#c5c8cf]">{policyValue(read(right))}</td></tr>)}</tbody></table></div>
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
  if (error) return <div className="rounded-[8px] border border-[#e9b949]/25 bg-[#e9b949]/[0.05] p-5 text-[10px] leading-5 text-[#d3bd70]">{error}</div>;
  if (!data) return <div className="grid gap-3 lg:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-80 animate-pulse rounded-[8px] border border-white/[0.07] bg-white/[0.025]" />)}</div>;
  const allPolicies = [...data.presets, ...data.saved_policies].map((summary) => summary.policy);
  return (
    <>
      <section aria-labelledby="policy-presets-heading"><div className="mb-4 flex items-end justify-between gap-3"><div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8f84dd]">Policy presets</p><h2 id="policy-presets-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#efeff3]">Start from explicit demo requirements</h2></div><span className="hidden text-[8px] font-semibold uppercase tracking-[0.1em] text-[#666c78] sm:block">Not regulatory standards</span></div><div className="grid gap-3 lg:grid-cols-3">{data.presets.map((item) => <PresetCard key={item.policy.policy_id} item={item} />)}</div></section>
      <section className="mt-4 overflow-hidden rounded-[9px] border border-white/[0.08] bg-[#101217]" aria-labelledby="saved-policies-heading"><div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4"><div><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8f84dd]">Saved policies</p><h2 id="saved-policies-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#efeff3]">Versioned local configurations</h2></div><Link href="/policies/new" className="rounded-[6px] border border-[#8f7df0]/35 bg-[#8f7df0]/[0.1] px-3 py-2 text-[8px] font-bold uppercase tracking-[0.1em] text-[#d7d0ff]">Create policy →</Link></div>{data.saved_policies.length ? <div className="overflow-x-auto"><table className="w-full min-w-[880px] border-collapse text-left"><thead><tr className="border-b border-white/[0.06] text-[8px] uppercase tracking-[0.09em] text-[#686e7a]"><th className="px-5 py-3">Policy</th><th className="px-5 py-3">Version</th><th className="px-5 py-3">Claim</th><th className="px-5 py-3">Minimum roots</th><th className="px-5 py-3">Certificate</th><th className="px-5 py-3">PolicyGate</th><th className="px-5 py-3">Last evaluation</th></tr></thead><tbody>{data.saved_policies.map((item) => <tr key={item.policy.policy_id} className="border-b border-white/[0.055] last:border-0"><td className="px-5 py-3"><Link href={item.href} className="text-[10px] font-semibold text-[#d9d5ff] hover:text-white">{item.policy.name}</Link><p className="mt-1 font-mono text-[8px] text-[#656b77]">{item.policy.policy_id}</p></td><td className="px-5 py-3 font-mono text-[9px] text-[#b3b7c0]">v{item.policy.policy_version}</td><td className="px-5 py-3 font-mono text-[9px] text-[#b3b7c0]">{item.policy.supported_claim}</td><td className="px-5 py-3 font-mono text-[9px] text-[#b3b7c0]">{item.policy.minimum_independent_roots ?? "None"}</td><td className="px-5 py-3 text-[9px] text-[#b3b7c0]">{item.policy.require_certificate_usable ? "Usable" : item.policy.require_certificate ? "Required" : "No"}</td><td className="px-5 py-3 text-[9px] text-[#b3b7c0]">{item.policy.require_policygate_allow ? "ALLOW" : "Not required"}</td><td className="px-5 py-3 font-mono text-[8px] text-[#858b97]">{policyTime(item.last_evaluation?.evaluated_at ?? null)}</td></tr>)}</tbody></table></div> : <div className="px-5 py-9 text-center"><p className="text-[10px] text-[#7b818d]">No custom policies have been saved yet.</p><Link href="/policies/new" className="mt-3 inline-block text-[9px] font-semibold uppercase tracking-[0.1em] text-[#a99df4]">Create the first policy →</Link></div>}</section>
      <PolicyComparison policies={allPolicies} />
      <section className="mt-4 grid gap-3 rounded-[9px] border border-[#8f7df0]/18 bg-[#8f7df0]/[0.03] p-5 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#a99cf3]">MVP / Pre-production</p><p className="mt-2 text-[10px] leading-5 text-[#888e9a]">Policies are off-chain, locally persisted configurations. Monitoring does not automatically re-evaluate policies yet.</p></div><span className="font-mono text-[8px] text-[#717783]">No wallet · No transaction</span></section>
    </>
  );
}
