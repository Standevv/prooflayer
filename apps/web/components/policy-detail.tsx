"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { CopyValue } from "@/components/copy-value";
import {
  policyDecisionStyle,
  policyTime,
  policyValue,
  ruleStatusStyle,
  type PolicyApiError,
  type PolicyAsset,
  type PolicyDetail,
  type PolicyEvaluation,
} from "@/lib/policies";

async function fetchPolicyDetail(policyId: string, signal?: AbortSignal): Promise<PolicyDetail> {
  const response = await fetch(`/api/policies/${policyId}`, { cache: "no-store", signal });
  const payload = (await response.json()) as PolicyDetail | PolicyApiError;
  if (!response.ok || !("policy" in payload)) throw new Error("error" in payload ? payload.error : "Policy detail unavailable.");
  return payload;
}

function Requirements({ detail }: { detail: PolicyDetail }) {
  const policy = detail.policy;
  const rows = [
    ["Authoritative result", "PASS"],
    ["Minimum independent roots", policy.minimum_independent_roots ?? "Not required"],
    ["Maximum attestation age", policy.maximum_attestation_age_days === null ? "Not required" : `${policy.maximum_attestation_age_days} days`],
    ["Certificate exists", policy.require_certificate],
    ["Certificate currently usable", policy.require_certificate_usable],
    ["Certificate not revoked", policy.require_not_revoked],
    ["PolicyGate ALLOW", policy.require_policygate_allow],
    ["Blocking reason codes", policy.blocking_reason_codes],
  ] as const;
  return <section className="overflow-hidden rounded-[9px] border border-white/[0.08] bg-[#101217]" aria-labelledby="requirements-heading"><div className="border-b border-white/[0.07] px-5 py-4"><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8f84dd]">Requirements</p><h2 id="requirements-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#efeff3]">Exact policy configuration</h2></div><dl className="divide-y divide-white/[0.055]">{rows.map(([label, value]) => <div key={label} className="grid gap-1 px-5 py-3 sm:grid-cols-[210px_1fr]"><dt className="text-[8px] font-semibold uppercase tracking-[0.08em] text-[#686e7a]">{label}</dt><dd className="break-words font-mono text-[9px] text-[#c6c9d0]">{policyValue(value)}</dd></div>)}</dl><div className="border-t border-white/[0.07] px-5 py-4"><p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#686e7a]">Off-chain policy commitment</p><div className="mt-2"><CopyValue value={policy.policy_commitment} label="Policy commitment" /></div></div></section>;
}

function EvaluationResult({ evaluation }: { evaluation: PolicyEvaluation }) {
  return <section className="overflow-hidden rounded-[9px] border border-white/[0.08] bg-[#101217]" aria-labelledby="evaluation-result-heading"><div className="grid divide-y divide-white/[0.07] sm:grid-cols-2 sm:divide-x sm:divide-y-0"><div className="px-5 py-5"><p className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#8f84dd]">Policy decision</p><h2 id="evaluation-result-heading" className={`mt-3 text-[24px] font-semibold tracking-[-0.04em] ${evaluation.final_decision === "ACCEPT" ? "text-[#62dc97]" : evaluation.final_decision === "REJECT" ? "text-[#ff8585]" : "text-[#e9c45d]"}`}>{evaluation.final_decision.replaceAll("_", " ")}</h2><p className="mt-2 text-[9px] text-[#6f7581]">Institutional policy output</p></div><div className="px-5 py-5"><p className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#8f84dd]">Authoritative RVC result</p><p className="mt-3 text-[24px] font-semibold tracking-[-0.04em] text-[#f0f0f4]">{evaluation.verification_result}</p><p className="mt-2 text-[9px] text-[#6f7581]">Factual result remains unchanged</p></div></div><div className="border-t border-white/[0.07] px-5 py-4"><p className="text-[10px] leading-5 text-[#a3a8b2]">{evaluation.explanation}</p><div className="mt-3 flex flex-wrap gap-1.5">{evaluation.source_authenticity.map((source) => <span key={source} className="rounded-[4px] border border-[#8f7df0]/20 bg-[#8f7df0]/[0.045] px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.07em] text-[#aaa0e8]">{source}</span>)}</div></div><div className="overflow-x-auto border-t border-white/[0.07]"><table className="w-full min-w-[760px] border-collapse text-left"><thead><tr className="border-b border-white/[0.06] text-[8px] uppercase tracking-[0.09em] text-[#686e7a]"><th className="px-5 py-3">Rule</th><th className="px-5 py-3">Required</th><th className="px-5 py-3">Observed</th><th className="px-5 py-3">Status</th></tr></thead><tbody>{evaluation.rule_results.map((rule) => <tr key={rule.rule} className="border-b border-white/[0.05] last:border-0"><td className="px-5 py-3"><p className="text-[9px] font-semibold text-[#c9ccd3]">{rule.rule}</p><p className="mt-1 max-w-lg text-[8px] leading-4 text-[#747a86]">{rule.explanation}</p></td><td className="px-5 py-3 font-mono text-[9px] text-[#999eaa]">{policyValue(rule.required)}</td><td className="px-5 py-3 font-mono text-[9px] text-[#999eaa]">{policyValue(rule.observed)}</td><td className={`px-5 py-3 font-mono text-[8px] font-bold ${ruleStatusStyle(rule.status)}`}>{rule.status.replaceAll("_", " ")}</td></tr>)}</tbody></table></div>{evaluation.review_reasons.length || evaluation.blocking_reasons.length ? <div className="grid gap-4 border-t border-white/[0.07] px-5 py-4 md:grid-cols-2">{evaluation.review_reasons.length ? <div><p className="text-[8px] font-bold uppercase tracking-[0.1em] text-[#d1b65f]">Review reasons</p><ul className="mt-2 space-y-1 text-[9px] leading-4 text-[#989071]">{evaluation.review_reasons.map((reason) => <li key={reason}>— {reason}</li>)}</ul></div> : <div />}{evaluation.blocking_reasons.length ? <div><p className="text-[8px] font-bold uppercase tracking-[0.1em] text-[#df8585]">Unmet requirements</p><ul className="mt-2 space-y-1 text-[9px] leading-4 text-[#a88686]">{evaluation.blocking_reasons.map((reason) => <li key={reason}>— {reason}</li>)}</ul></div> : null}</div> : null}<div className="border-t border-white/[0.07] px-5 py-3 font-mono text-[8px] text-[#666c78]">Evaluated {policyTime(evaluation.evaluated_at)} · Policy v{evaluation.policy_version} · Snapshot {evaluation.trust_snapshot_id.slice(0, 12)}…</div></section>;
}

export function PolicyDetailView({ policyId }: { policyId: string }) {
  const [detail, setDetail] = useState<PolicyDetail | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<PolicyAsset | "">("");
  const [currentEvaluation, setCurrentEvaluation] = useState<PolicyEvaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => { const next = await fetchPolicyDetail(policyId); setDetail(next); return next; }, [policyId]);
  useEffect(() => {
    const controller = new AbortController();
    void fetchPolicyDetail(policyId, controller.signal).then((next) => { setDetail(next); setSelectedAsset(next.compatible_assets[0] ?? ""); setCurrentEvaluation(next.evaluations.at(-1) ?? null); }).catch((requestError: unknown) => { if (requestError instanceof Error && requestError.name === "AbortError") return; setError(requestError instanceof Error ? requestError.message : "Policy detail unavailable."); }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [policyId]);

  async function evaluate() {
    if (!detail || !selectedAsset || running) return;
    setRunning(true); setError(null);
    try {
      const claim = selectedAsset === "USDY" ? "TreasuryBacking" : "GoldBacking";
      const response = await fetch(`/api/policies/${policyId}/evaluate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ asset: selectedAsset, claim }) });
      const payload = (await response.json()) as PolicyEvaluation | PolicyApiError;
      if (!response.ok || !("final_decision" in payload)) throw new Error("error" in payload ? payload.error : "Policy evaluation failed.");
      setCurrentEvaluation(payload); await refresh();
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Policy evaluation failed."); }
    finally { setRunning(false); }
  }

  if (loading) return <div className="mt-4 h-[480px] animate-pulse rounded-[9px] border border-white/[0.07] bg-white/[0.025]" />;
  if (!detail) return <div className="mt-4 rounded-[8px] border border-[#e9b949]/25 bg-[#e9b949]/[0.05] p-5 text-[10px] text-[#d3bd70]">{error ?? "Policy detail unavailable."}</div>;
  const policy = detail.policy;
  return <>
    <header className="command-header relative overflow-hidden rounded-[9px] border border-white/[0.08] px-5 py-7 sm:px-7 sm:py-8"><div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><Link href="/policies" className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8f84dd] hover:text-[#c5bcf7]">← Policy Studio</Link><div className="mt-4 flex flex-wrap items-center gap-2"><span className="rounded-[4px] border border-[#8f7df0]/20 bg-[#8f7df0]/[0.05] px-2 py-1 text-[8px] font-bold uppercase tracking-[0.08em] text-[#aaa0e8]">{policy.source}</span><span className="font-mono text-[8px] text-[#686e7a]">v{policy.policy_version}</span></div><h1 className="mt-3 text-[32px] font-semibold leading-none tracking-[-0.052em] text-[#f7f7fa] sm:text-[42px]">{policy.name}</h1><p className="mt-3 max-w-2xl text-[11px] leading-5 text-[#a3a8b2]">{policy.description || "No policy description provided."}</p></div><div className="font-mono text-[8px] leading-5 text-[#696f7b]"><p>ID · {policy.policy_id}</p><p>Created · {policyTime(policy.created_at)}</p><p>Updated · {policyTime(policy.updated_at)}</p></div></div></header>
    {error ? <div role="alert" className="mt-4 rounded-[7px] border border-[#ff6b6b]/25 bg-[#ff6b6b]/[0.05] px-4 py-3 text-[10px] text-[#df8585]">{error}</div> : null}
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start"><Requirements detail={detail} /><section className="rounded-[9px] border border-[#8f7df0]/20 bg-[#11121a] p-5 xl:sticky xl:top-6"><p className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#a99cf3]">Test policy</p><p className="mt-2 text-[10px] leading-5 text-[#858b97]">Evaluate current ProofLayer state without changing the authoritative RVC result.</p><label className="mt-4 block text-[8px] font-semibold uppercase tracking-[0.09em] text-[#727884]">Asset<select value={selectedAsset} onChange={(event) => setSelectedAsset(event.target.value as PolicyAsset)} className="mt-2 block w-full rounded-[6px] border border-white/[0.1] bg-[#0a0c10] px-3 py-2.5 text-[11px] normal-case tracking-normal text-[#e6e7eb]">{(["USDY", "PAXG"] as PolicyAsset[]).map((asset) => <option key={asset} value={asset} disabled={!detail.compatible_assets.includes(asset)}>{asset} · {asset === "USDY" ? "TreasuryBacking" : "GoldBacking"}{detail.compatible_assets.includes(asset) ? "" : " · incompatible"}</option>)}</select></label><button type="button" onClick={() => void evaluate()} disabled={running || !selectedAsset} className="surface-transition mt-4 w-full rounded-[6px] border border-[#8f7df0]/40 bg-[#8f7df0]/[0.12] px-4 py-3 text-[9px] font-bold uppercase tracking-[0.11em] text-[#ded8ff] hover:border-[#8f7df0]/65 disabled:cursor-wait disabled:opacity-45">{running ? "Running current verification…" : "Run policy evaluation →"}</button><p className="mt-2 text-center text-[8px] text-[#626874]">Current read-only state · Local history</p></section></div>
    {currentEvaluation ? <div className="mt-4"><EvaluationResult evaluation={currentEvaluation} /></div> : <section className="mt-4 rounded-[9px] border border-white/[0.08] bg-[#101217] px-5 py-8 text-center"><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8f84dd]">No evaluation yet</p><p className="mt-2 text-[10px] text-[#7b818d]">Run the policy against compatible current asset state to create the first historical evaluation.</p></section>}
    <section className="mt-4 overflow-hidden rounded-[9px] border border-white/[0.08] bg-[#101217]" aria-labelledby="evaluation-history-heading"><div className="border-b border-white/[0.07] px-5 py-4"><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8f84dd]">Evaluation history</p><h2 id="evaluation-history-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#efeff3]">Version-bound decisions</h2></div>{detail.evaluations.length ? <div className="divide-y divide-white/[0.055]">{[...detail.evaluations].reverse().map((evaluation) => <button type="button" key={evaluation.evaluation_id} onClick={() => setCurrentEvaluation(evaluation)} className="grid w-full gap-2 px-5 py-3 text-left transition-colors hover:bg-white/[0.02] sm:grid-cols-[170px_120px_1fr_auto] sm:items-center"><time className="font-mono text-[8px] text-[#747a86]">{policyTime(evaluation.evaluated_at)}</time><span className={`w-fit rounded-[4px] border px-2 py-1 text-[8px] font-bold ${policyDecisionStyle(evaluation.final_decision)}`}>{evaluation.final_decision.replaceAll("_", " ")}</span><span className="font-mono text-[8px] text-[#9297a3]">RVC {evaluation.verification_result} · Policy v{evaluation.policy_version}</span><span className="font-mono text-[7px] text-[#5f6571]">{evaluation.evaluation_id.slice(0, 12)}…</span></button>)}</div> : <p className="px-5 py-7 text-center text-[10px] text-[#777d89]">No historical evaluations.</p>}{detail.decision_transitions.length ? <div className="border-t border-white/[0.07] px-5 py-4"><p className="text-[8px] font-bold uppercase tracking-[0.1em] text-[#8f84dd]">Factual decision transitions</p><div className="mt-3 space-y-2">{detail.decision_transitions.map((transition) => <div key={transition.current_evaluation_id} className="flex flex-wrap items-center gap-2 font-mono text-[9px] text-[#a4a9b4]"><time className="text-[#696f7b]">{policyTime(transition.occurred_at)}</time><span>{transition.previous_decision.replaceAll("_", " ")}</span><span className="text-[#746ba0]">→</span><span>{transition.current_decision.replaceAll("_", " ")}</span></div>)}</div></div> : null}</section>
    <section className="mt-4 rounded-[9px] border border-[#8f7df0]/18 bg-[#8f7df0]/[0.03] p-5"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#a99cf3]">Continuous Verification integration</p><p className="mt-2 text-[10px] leading-5 text-[#888e9a]">This evaluation consumes the same current trust-snapshot composition used by Monitoring. Automatic policy re-evaluation after monitoring changes is intentionally not enabled in this MVP.</p></section>
  </>;
}
