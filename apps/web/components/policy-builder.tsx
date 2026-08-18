"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { CopyCodeButton } from "@/components/copy-code-button";
import {
  POLICY_REASON_CODES,
  type InstitutionalPolicy,
  type InstitutionalPolicyDraft,
  type PolicyApiError,
  type PolicyClaim,
  type PolicyStudioOverview,
} from "@/lib/policies";

const DEFAULT_DRAFT: InstitutionalPolicyDraft = {
  name: "",
  description: "",
  supported_asset: "USDY",
  supported_claim: "TreasuryBacking",
  required_verification_results: ["PASS"],
  minimum_independent_roots: 1,
  require_certificate: true,
  require_certificate_usable: true,
  require_not_revoked: true,
  require_policygate_allow: false,
  maximum_attestation_age_days: null,
  blocking_reason_codes: ["MISSING_EVIDENCE"],
  enabled: true,
};

function applyPreset(policy: InstitutionalPolicy): InstitutionalPolicyDraft {
  return {
    name: `${policy.name} Custom`,
    description: policy.description,
    supported_asset: policy.supported_asset,
    supported_claim: policy.supported_claim,
    required_verification_results: ["PASS"],
    minimum_independent_roots: policy.minimum_independent_roots,
    require_certificate: policy.require_certificate,
    require_certificate_usable: policy.require_certificate_usable,
    require_not_revoked: policy.require_not_revoked,
    require_policygate_allow: policy.require_policygate_allow,
    maximum_attestation_age_days: policy.maximum_attestation_age_days,
    blocking_reason_codes: policy.blocking_reason_codes,
    enabled: true,
  };
}

function BuilderSection({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return <section className="border-b border-edge px-4 py-5 last:border-0 sm:px-5"><div className="grid gap-4 md:grid-cols-[112px_minmax(0,1fr)]"><div><span className="font-mono text-[8px] text-tertiary">{number}</span><h2 className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-brand">{title}</h2></div><div className="min-w-0">{children}</div></div></section>;
}

function Toggle({ checked, onChange, label, detail, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; label: string; detail: string; disabled?: boolean }) {
  return <label className={`flex cursor-pointer items-start gap-3 rounded-[6px] border border-edge bg-scrim px-3 py-3 ${disabled ? "cursor-not-allowed opacity-45" : "hover:border-edge"}`}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} className="mt-0.5 size-3.5 accent-brand" /><span><span className="block text-[10px] font-semibold text-primary">{label}</span><span className="mt-1 block text-[8px] leading-4 text-tertiary">{detail}</span></span></label>;
}

export function PolicyBuilder({ presetId }: { presetId?: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<InstitutionalPolicyDraft>(DEFAULT_DRAFT);
  const [presetLabel, setPresetLabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!presetId) return;
    const controller = new AbortController();
    void fetch("/api/policies", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const payload = (await response.json()) as PolicyStudioOverview | PolicyApiError;
      if (!response.ok || !("presets" in payload)) throw new Error("Unable to load the selected preset.");
      const preset = payload.presets.find((item) => item.policy.policy_id === presetId)?.policy;
      if (!preset) throw new Error("The selected policy preset was not found.");
      setDraft(applyPreset(preset)); setPresetLabel(preset.name);
    }).catch((requestError: unknown) => { if (requestError instanceof Error && requestError.name === "AbortError") return; setError(requestError instanceof Error ? requestError.message : "Unable to load preset."); });
    return () => controller.abort();
  }, [presetId]);

  const policyJson = useMemo(() => JSON.stringify(draft, null, 2), [draft]);
  const validation = !draft.name.trim() ? "Policy name is required." : draft.minimum_independent_roots !== null && draft.minimum_independent_roots < 0 ? "Minimum roots cannot be negative." : draft.maximum_attestation_age_days !== null && draft.maximum_attestation_age_days <= 0 ? "Maximum attestation age must be greater than zero." : null;
  const summary = [
    "Authoritative verification result must be PASS",
    draft.minimum_independent_roots === null ? null : `At least ${draft.minimum_independent_roots} independent evidence root${draft.minimum_independent_roots === 1 ? "" : "s"}`,
    draft.maximum_attestation_age_days === null ? null : `Attestation age must not exceed ${draft.maximum_attestation_age_days} days where observable`,
    draft.require_certificate ? "Certificate must exist" : null,
    draft.require_certificate_usable ? "Certificate must be currently usable" : null,
    draft.require_not_revoked ? "Certificate must not be revoked" : null,
    draft.require_policygate_allow ? "PolicyGate must return ALLOW" : null,
    draft.blocking_reason_codes.length ? `Blocking reason codes: ${draft.blocking_reason_codes.join(", ")}` : null,
  ].filter((item): item is string => Boolean(item));

  function update<K extends keyof InstitutionalPolicyDraft>(key: K, value: InstitutionalPolicyDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value })); setError(null);
  }
  function changeClaim(claim: PolicyClaim) {
    setDraft((current) => ({ ...current, supported_claim: claim, supported_asset: claim === "TreasuryBacking" ? "USDY" : "PAXG" }));
  }
  function requireCertificate(checked: boolean) {
    setDraft((current) => ({ ...current, require_certificate: checked, require_certificate_usable: checked ? current.require_certificate_usable : false, require_not_revoked: checked ? current.require_not_revoked : false, require_policygate_allow: checked ? current.require_policygate_allow : false }));
  }
  function requireUsable(checked: boolean) {
    setDraft((current) => ({ ...current, require_certificate: checked || current.require_certificate, require_certificate_usable: checked, require_policygate_allow: checked ? current.require_policygate_allow : false }));
  }
  function toggleReason(code: string, checked: boolean) {
    setDraft((current) => ({ ...current, blocking_reason_codes: checked ? [...new Set([...current.blocking_reason_codes, code])].sort() : current.blocking_reason_codes.filter((item) => item !== code) }));
  }
  async function savePolicy() {
    if (validation || saving) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/policies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      const payload = (await response.json()) as InstitutionalPolicy | PolicyApiError;
      if (!response.ok || !("policy_commitment" in payload)) throw new Error("error" in payload ? payload.error : "Policy could not be saved.");
      router.push(`/policies/${payload.policy_id}`);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Policy could not be saved."); }
    finally { setSaving(false); }
  }

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)] xl:items-start">
    <div className="overflow-hidden rounded-[9px] border border-edge bg-surface">
      {presetLabel ? <div className="border-b border-brand/15 bg-brand/[0.035] px-5 py-3 text-[9px] text-accent">Starting from POLICY PRESET · {presetLabel}. Saving creates a separate custom policy.</div> : null}
      <BuilderSection number="01" title="Identity"><div className="grid gap-3"><label className="text-[8px] font-semibold uppercase tracking-[0.09em] text-tertiary">Policy name<input value={draft.name} maxLength={80} onChange={(event) => update("name", event.target.value)} placeholder="Institutional Treasury Standard" className="mt-2 block w-full rounded-[6px] border border-edge bg-surface px-3 py-2.5 text-[11px] normal-case tracking-normal text-primary outline-none focus:border-brand/45" /></label><label className="text-[8px] font-semibold uppercase tracking-[0.09em] text-tertiary">Description<textarea value={draft.description} maxLength={500} onChange={(event) => update("description", event.target.value)} rows={3} placeholder="Describe the policy's institutional purpose." className="mt-2 block w-full resize-y rounded-[6px] border border-edge bg-surface px-3 py-2.5 text-[11px] leading-5 normal-case tracking-normal text-primary outline-none focus:border-brand/45" /></label></div></BuilderSection>
      <BuilderSection number="02" title="Verification"><div className="grid gap-3 sm:grid-cols-2"><label className="text-[8px] font-semibold uppercase tracking-[0.09em] text-tertiary">Supported claim<select value={draft.supported_claim} onChange={(event) => changeClaim(event.target.value as PolicyClaim)} className="mt-2 block w-full rounded-[6px] border border-edge bg-surface px-3 py-2.5 text-[11px] normal-case tracking-normal text-primary"><option value="TreasuryBacking">TreasuryBacking · USDY</option><option value="GoldBacking">GoldBacking · PAXG</option></select></label><label className="text-[8px] font-semibold uppercase tracking-[0.09em] text-tertiary">Required result<input value="PASS" readOnly className="mt-2 block w-full rounded-[6px] border border-success/15 bg-success-soft/[0.035] px-3 py-2.5 font-mono text-[11px] normal-case tracking-normal text-success" /></label></div><p className="mt-3 text-[9px] leading-4 text-tertiary">FAIL and INDETERMINATE can never be configured as PASS. They remain authoritative RVC outcomes.</p></BuilderSection>
      <BuilderSection number="03" title="Provenance"><label className="text-[8px] font-semibold uppercase tracking-[0.09em] text-tertiary">Minimum independent roots<input type="number" min={0} max={100} value={draft.minimum_independent_roots ?? ""} onChange={(event) => update("minimum_independent_roots", event.target.value === "" ? null : Number(event.target.value))} className="mt-2 block w-full max-w-[220px] rounded-[6px] border border-edge bg-surface px-3 py-2.5 font-mono text-[11px] normal-case tracking-normal text-primary" /></label></BuilderSection>
      <BuilderSection number="04" title="Freshness"><label className="flex items-center gap-2 text-[9px] text-primary"><input type="checkbox" checked={draft.maximum_attestation_age_days !== null} onChange={(event) => update("maximum_attestation_age_days", event.target.checked ? 31 : null)} className="size-3.5 accent-brand" />Require maximum attestation age where observable</label>{draft.maximum_attestation_age_days !== null ? <label className="mt-3 block text-[8px] font-semibold uppercase tracking-[0.09em] text-tertiary">Maximum age in days<input type="number" min={1} max={3650} value={draft.maximum_attestation_age_days} onChange={(event) => update("maximum_attestation_age_days", Number(event.target.value))} className="mt-2 block w-full max-w-[220px] rounded-[6px] border border-edge bg-surface px-3 py-2.5 font-mono text-[11px] normal-case tracking-normal text-primary" /></label> : null}</BuilderSection>
      <BuilderSection number="05" title="Certificate"><div className="grid gap-2 sm:grid-cols-2"><Toggle checked={draft.require_certificate} onChange={requireCertificate} label="Require certificate" detail="A mapped certificate must exist." /><Toggle checked={draft.require_certificate_usable} onChange={requireUsable} disabled={!draft.require_certificate} label="Require current usability" detail="Expired or otherwise unusable certificates do not satisfy this rule." /><Toggle checked={draft.require_not_revoked} onChange={(checked) => update("require_not_revoked", checked)} disabled={!draft.require_certificate} label="Require not revoked" detail="Current registry state must not be revoked." /></div></BuilderSection>
      <BuilderSection number="06" title="Enforcement"><Toggle checked={draft.require_policygate_allow} onChange={(checked) => setDraft((current) => ({ ...current, require_policygate_allow: checked, require_certificate: checked || current.require_certificate, require_certificate_usable: checked || current.require_certificate_usable }))} label="Require PolicyGate ALLOW" detail="Unavailable PolicyGate state requires review; BLOCK does not silently pass." /></BuilderSection>
      <BuilderSection number="07" title="Reason codes"><fieldset><legend className="text-[9px] leading-4 text-secondary">Selected authoritative RVC reason codes block policy acceptance.</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{POLICY_REASON_CODES.map((code) => <label key={code} className="flex items-center gap-2 rounded-[5px] border border-edge px-3 py-2 font-mono text-[8px] text-secondary"><input type="checkbox" checked={draft.blocking_reason_codes.includes(code)} onChange={(event) => toggleReason(code, event.target.checked)} className="size-3 accent-brand" />{code}</label>)}</div></fieldset></BuilderSection>
      <div className="px-5 py-5">{validation || error ? <p role="alert" className="mb-3 rounded-[5px] border border-fail/20 bg-fail/[0.045] px-3 py-2 text-[9px] text-fail">{error ?? validation}</p> : null}<button type="button" onClick={() => void savePolicy()} disabled={Boolean(validation) || saving} className="surface-transition w-full rounded-[6px] border border-brand/40 bg-brand/[0.12] px-4 py-3 text-[9px] font-bold uppercase tracking-[0.11em] text-accent hover:border-brand/65 hover:bg-brand/[0.17] disabled:cursor-not-allowed disabled:opacity-45">{saving ? "Validating and saving…" : "Save versioned policy →"}</button><p className="mt-2 text-center text-[8px] text-tertiary">Local off-chain policy · No blockchain write</p></div>
    </div>
    <aside className="space-y-4 xl:sticky xl:top-6"><section className="rounded-[9px] border border-brand/20 bg-accent-soft p-5"><p className="text-[9px] font-bold uppercase tracking-[0.13em] text-brand-bright">This policy requires</p><ul className="mt-4 space-y-2.5">{summary.map((item) => <li key={item} className="grid grid-cols-[14px_1fr] gap-2 text-[10px] leading-4 text-primary"><span className="text-success">✓</span>{item}</li>)}</ul><p className="mt-5 border-t border-edge pt-3 text-[9px] leading-4 text-tertiary">This is a configuration preview. No asset has been evaluated yet.</p></section><section className="overflow-hidden rounded-[9px] border border-edge bg-surface"><div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3"><div><p className="text-[9px] font-bold uppercase tracking-[0.11em] text-brand">Policy JSON</p><p className="mt-1 text-[8px] text-tertiary">Exact typed request</p></div><CopyCodeButton value={policyJson} label="Copy policy JSON" /></div><pre tabIndex={0} className="max-h-[540px] overflow-auto p-4 text-[9px] leading-5 text-secondary"><code>{policyJson}</code></pre></section><section className="rounded-[8px] border border-warning/16 bg-warning/[0.03] p-4"><p className="text-[8px] font-bold uppercase tracking-[0.1em] text-warning">Semantic boundary</p><p className="mt-2 text-[9px] leading-5 text-secondary">The saved commitment binds policy requirements off-chain. It does not change evidence, provenance, the RVC result, or any X Layer contract.</p></section></aside>
  </div>;
}
