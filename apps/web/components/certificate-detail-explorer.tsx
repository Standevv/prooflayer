"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { CertificateSourceBadge } from "@/components/certificate-source-badge";
import { CopyValue } from "@/components/copy-value";
import {
  formatCertificateTime,
  isCertificateId,
  type AuthenticitySource,
  type CertificateApiError,
  type CertificateCore,
  type CertificateExplorerRecord,
} from "@/lib/certificates";
import { PROOFLAYER_CONTRACTS, XLAYER_TESTNET } from "@/lib/contracts";

const EXPLORER_URL = XLAYER_TESTNET.explorerUrl;

type DetailSectionProps = {
  eyebrow: string;
  title: string;
  source?: AuthenticitySource;
  children: React.ReactNode;
};

function DetailSection({ eyebrow, title, source, children }: DetailSectionProps) {
  return (
    <section className="overflow-hidden rounded-[8px] border border-edge bg-surface">
      <div className="flex items-start justify-between gap-3 border-b border-edge px-4 py-3.5 sm:px-5">
        <div>
          <p className="text-[8px] font-semibold uppercase tracking-[0.13em] text-tertiary">{eyebrow}</p>
          <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.025em] text-accent">{title}</h2>
        </div>
        {source === undefined ? null : <CertificateSourceBadge source={source} />}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "success" | "warning" | "danger" | "live" | "neutral" }) {
  const styles = {
    success: "border-success/25 bg-success-soft/[0.07] text-success",
    warning: "border-warning/25 bg-warning/[0.07] text-warning",
    danger: "border-fail/25 bg-fail/[0.07] text-fail",
    live: "border-brand/28 bg-brand/[0.08] text-brand-bright",
    neutral: "border-edge bg-overlay-hover text-secondary",
  } as const;
  return <span className={`rounded-[4px] border px-2 py-1 text-[8px] font-bold uppercase tracking-[0.09em] ${styles[tone]}`}>{label}</span>;
}

function resultTone(result: CertificateCore["result"]): "success" | "warning" | "danger" | "neutral" {
  if (result === "PASS") return "success";
  if (result === "FAIL") return "danger";
  if (result === "INDETERMINATE") return "warning";
  return "neutral";
}

function ValueRow({
  label,
  value,
  source,
  copyLabel,
  href,
  secondary,
}: {
  label: string;
  value: string | null;
  source: AuthenticitySource;
  copyLabel?: string;
  href?: string;
  secondary?: string;
}) {
  return (
    <div className="grid gap-2 border-b border-edge py-3 last:border-b-0 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-start">
      <p className="text-[9px] font-semibold uppercase tracking-[0.09em] text-tertiary">{label}</p>
      <div className="min-w-0">
        {value === null ? (
          <p className="text-[11px] text-tertiary">Unavailable</p>
        ) : copyLabel === undefined ? (
          <p className="break-words text-[11px] leading-5 text-accent">{value}</p>
        ) : (
          <CopyValue value={value} label={copyLabel} href={href} full />
        )}
        {secondary === undefined ? null : <p className="mt-1 text-[9px] leading-4 text-tertiary">{secondary}</p>}
      </div>
      <div className="sm:justify-self-end"><CertificateSourceBadge source={source} /></div>
    </div>
  );
}

function CoreFields({ record }: { record: CertificateExplorerRecord }) {
  const { core, labels, field_sources: sources } = record;
  const timestamp = (value: number | null) => value === null ? null : `${formatCertificateTime(value)} UTC · Unix ${value}`;
  return (
    <DetailSection eyebrow="Canonical record" title="Certificate Core Fields">
      <div>
        <ValueRow label="certificateId" value={core.certificate_id} source={sources.certificate_id} copyLabel="Certificate ID" />
        <ValueRow label="Asset" value={labels.asset ?? "Unknown / unmapped identifier"} source={labels.source} secondary="Human label is shown only for an exact known project hash." />
        <ValueRow label="assetId" value={core.asset_id} source={sources.asset_id} copyLabel="Asset ID" />
        <ValueRow label="Claim" value={labels.claim ?? "Unknown / unmapped identifier"} source={labels.source} />
        <ValueRow label="claimType" value={core.claim_type} source={sources.claim_type} copyLabel="Claim type ID" />
        <ValueRow label="Policy" value={labels.policy ?? "Unknown / unmapped identifier"} source={labels.source} />
        <ValueRow label="policyId" value={core.policy_id} source={sources.policy_id} copyLabel="Policy ID" />
        <ValueRow label="evidenceRoot" value={core.evidence_root} source={sources.evidence_root} copyLabel="Evidence root" />
        <ValueRow label="observedAt" value={timestamp(core.observed_at)} source={sources.observed_at} />
        <ValueRow label="validUntil" value={timestamp(core.valid_until)} source={sources.valid_until} />
        <ValueRow label="independentRootCount" value={core.independent_root_count?.toString() ?? null} source={sources.independent_root_count} />
        <ValueRow label="result" value={core.result ?? null} source={sources.result} secondary={core.result_code === null ? undefined : `Solidity result code ${core.result_code}`} />
        <ValueRow label="issuer" value={core.issuer} source={sources.issuer} copyLabel={core.issuer === null ? undefined : "Certificate issuer"} href={core.issuer === null ? undefined : `${EXPLORER_URL}/address/${core.issuer}`} />
        <ValueRow label="revoked" value={core.revoked === null ? null : String(core.revoked)} source={sources.revoked} />
      </div>
    </DetailSection>
  );
}

function VerificationState({ record }: { record: CertificateExplorerRecord }) {
  return (
    <DetailSection eyebrow="State semantics" title="Verification & Current Usability">
      <div className="grid grid-cols-2 overflow-hidden rounded-[6px] border border-edge">
        <div className="border-r border-edge p-3.5">
          <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">Historical certificate result</p>
          <p className={`mt-2 text-xl font-semibold tracking-[-0.03em] ${record.core.result === "PASS" ? "text-success" : record.core.result === "FAIL" ? "text-fail" : "text-warning"}`}>
            {record.core.result ?? "UNKNOWN"}
          </p>
          <p className="mt-1 text-[8px] uppercase tracking-[0.08em] text-tertiary">Historical policy evaluation</p>
        </div>
        <div className="p-3.5">
          <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">Current certificate usability</p>
          <p className={`mt-2 text-xl font-semibold tracking-[-0.03em] ${record.usability.state === "USABLE" ? "text-success" : record.usability.state === "REVOKED" ? "text-fail" : "text-warning"}`}>
            {record.usability.state}
          </p>
          <p className="mt-1 text-[8px] uppercase tracking-[0.08em] text-tertiary">Current Registry state</p>
        </div>
      </div>
      <div className="mt-3 rounded-[5px] border border-edge bg-scrim p-3">
        <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">Reason</p>
        <p className="mt-1 text-[11px] leading-5 text-primary">{record.usability.reason}</p>
      </div>
    </DetailSection>
  );
}

function RegistryPanel({ record }: { record: CertificateExplorerRecord }) {
  const registry = record.registry;
  return (
    <DetailSection eyebrow="X Layer Registry" title="Live Registration State" source={registry.source}>
      {registry.read_status === "UNAVAILABLE" ? (
        <div className="rounded-[6px] border border-warning/20 bg-warning/[0.045] p-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-warning">Live read unavailable</p>
          <p className="mt-2 text-[10px] leading-5 text-warning">Fixture and historical fields remain visible, but no current chain state is inferred.</p>
        </div>
      ) : null}
      <dl className="mt-1 space-y-0 text-[10px]">
        {[
          ["Network", registry.network],
          ["Chain ID", registry.chain_id.toString()],
          ["Certificate exists", registry.certificate_exists === null ? "Unavailable" : registry.certificate_exists ? "Yes" : "No"],
          ["Current usability", registry.current_usable === null ? "Unavailable" : registry.current_usable ? "Yes" : "No"],
          ["Revoked", registry.revoked === null ? "Unavailable" : String(registry.revoked)],
          ["Latest block", registry.latest_block?.toLocaleString("en-GB") ?? "Unavailable"],
        ].map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 border-b border-edge py-2.5 last:border-b-0">
            <dt className="uppercase tracking-[0.08em] text-tertiary">{label}</dt>
            <dd className="text-right font-mono text-accent">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 border-t border-edge pt-3">
        <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">Registry address</p>
        <div className="mt-1"><CopyValue value={registry.registry_address} label="Registry address" href={`${EXPLORER_URL}/address/${registry.registry_address}`} full /></div>
      </div>
      <div className="mt-3">
        <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">Issuer</p>
        <div className="mt-1">{registry.issuer === null ? <p className="text-[10px] text-tertiary">Unavailable</p> : <CopyValue value={registry.issuer} label="Certificate issuer" href={`${EXPLORER_URL}/address/${registry.issuer}`} full />}</div>
      </div>
    </DetailSection>
  );
}

function Timeline({ record }: { record: CertificateExplorerRecord }) {
  const unavailableRegistration = record.registry.read_status === "UNAVAILABLE";
  const displayTime = (value: number | null) => value === null ? "Unavailable" : `${formatCertificateTime(value)} UTC`;
  const steps = [
    { label: "Observed", value: displayTime(record.timeline.observed_at) },
    {
      label: "Registered",
      value: unavailableRegistration ? "Live read unavailable" : record.timeline.registered_network ?? "Not registered",
      note: record.timeline.registered_network === null ? undefined : "Registration timestamp unavailable",
    },
    { label: "Valid Until", value: displayTime(record.timeline.valid_until) },
    { label: "Current State", value: record.timeline.current_state },
  ];
  return (
    <DetailSection eyebrow="Lifecycle" title="Certificate Timeline">
      <ol>
        {steps.map((step, index) => (
          <li key={step.label} className="relative grid grid-cols-[18px_1fr] gap-3 pb-5 last:pb-0">
            {index === steps.length - 1 ? null : <span className="absolute bottom-0 left-[5px] top-3 w-px bg-overlay-hover" aria-hidden="true" />}
            <span className={`relative z-10 mt-1 size-[11px] rounded-full border ${index === steps.length - 1 ? "border-brand/55 bg-brand/20" : "border-edge bg-surface"}`} aria-hidden="true" />
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">{step.label}</p>
              <p className="mt-1 text-[11px] text-primary">{step.value}</p>
              {step.note === undefined ? null : <p className="mt-1 text-[9px] text-tertiary">{step.note}</p>}
            </div>
          </li>
        ))}
      </ol>
    </DetailSection>
  );
}

function EvidenceCommitment({ record }: { record: CertificateExplorerRecord }) {
  return (
    <DetailSection eyebrow="Evidence commitment" title="Normalized Evidence Root" source={record.field_sources.evidence_root}>
      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-tertiary">Evidence Root</p>
      <div className="mt-2">{record.core.evidence_root === null ? <p className="text-[11px] text-tertiary">Unavailable</p> : <CopyValue value={record.core.evidence_root} label="Evidence root" full />}</div>
      <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-4 border-t border-edge pt-4">
        <div>
          <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">Independent Evidence Roots</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-accent">{record.core.independent_root_count ?? "--"}</p>
        </div>
        <Link href={record.labels.asset === "USDY" ? "/assets/usdy" : "/assets"} className="text-[9px] font-bold uppercase tracking-[0.09em] text-brand-bright hover:text-accent">View Evidence / Provenance →</Link>
      </div>
      <p className="mt-4 text-[10px] leading-5 text-secondary">The evidence root commits the normalized evidence used by the verification policy. The hash alone is not used to reconstruct source evidence.</p>
    </DetailSection>
  );
}

function PolicyInformation({ record }: { record: CertificateExplorerRecord }) {
  const offchain = record.offchain_verification;
  const displayTime = (value: number | null) => value === null ? "Unavailable" : `${formatCertificateTime(value)} UTC`;
  return (
    <DetailSection eyebrow="Verification policy" title="Policy Interpretation" source={record.labels.source}>
      <dl className="grid grid-cols-2 gap-3 text-[10px]">
        {[
          ["Claim", record.labels.claim ?? "Unknown / unmapped"],
          ["Policy", record.labels.policy ?? "Unknown / unmapped"],
          ["Historical certificate result", record.core.result ?? "Unknown"],
          ["Independent roots", record.core.independent_root_count?.toString() ?? "Unavailable"],
          ["Observed", displayTime(record.core.observed_at)],
          ["Valid until", displayTime(record.core.valid_until)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[5px] border border-edge bg-scrim p-3">
            <dt className="text-[8px] uppercase tracking-[0.09em] text-tertiary">{label}</dt>
            <dd className="mt-1.5 break-words text-primary">{value}</dd>
          </div>
        ))}
      </dl>
      {offchain === null ? null : (
        <div className="mt-4 border-t border-edge pt-4">
          <CertificateSourceBadge source="DEMO FIXTURE" />
          <p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.09em] text-tertiary">Off-chain verification data</p>
          <p className="mt-2 text-[10px] leading-5 text-secondary">
            Compiler {offchain.compiler_version} · Claim v{offchain.claim_version} · Policy v{offchain.policy_version} · Simulation {String(offchain.simulation)}
          </p>
          <p className="mt-1 text-[10px] text-secondary">Reason codes: {offchain.reason_codes.length === 0 ? "None" : offchain.reason_codes.join(", ")}</p>
          <p className="mt-2 text-[9px] leading-4 text-tertiary">These details are fixture metadata matching the certificate, not fields stored in CertificateRegistry.</p>
        </div>
      )}
    </DetailSection>
  );
}

function DecisionHistory({ record }: { record: CertificateExplorerRecord }) {
  const history = record.decisions;
  return (
    <DetailSection eyebrow="Related decisions" title="DecisionLog History" source={history.source}>
      {history.read_status === "UNAVAILABLE" ? (
        <p className="rounded-[5px] border border-warning/20 bg-warning/[0.04] p-3 text-[10px] text-warning">DecisionLog history is unavailable from the current RPC.</p>
      ) : history.records.length === 0 ? (
        <div>
          <p className="text-[11px] font-medium text-primary">No successful DecisionLog entries found for this certificate.</p>
          <p className="mt-2 text-[10px] leading-5 text-tertiary">{history.note}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {history.records.map((decision) => (
            <article key={`${decision.decision_id}-${decision.block_number}`} className="rounded-[6px] border border-edge bg-scrim p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">Decision ID</p>
                  <div className="mt-1"><CopyValue value={decision.decision_id} label="Decision ID" full /></div>
                </div>
                <StatusBadge label={decision.allowed ? "ALLOWED" : "DENIED (RECORDED)"} tone={decision.allowed ? "success" : "danger"} />
              </div>
              <dl className="mt-3 grid gap-3 border-t border-edge pt-3 sm:grid-cols-2">
                <div><dt className="text-[8px] uppercase tracking-[0.09em] text-tertiary">Actor</dt><dd className="mt-1"><CopyValue value={decision.actor} label="Decision actor" full /></dd></div>
                <div><dt className="text-[8px] uppercase tracking-[0.09em] text-tertiary">Action Type</dt><dd className="mt-1"><CopyValue value={decision.action_type} label="Action type" full /></dd></div>
                <div><dt className="text-[8px] uppercase tracking-[0.09em] text-tertiary">Timestamp</dt><dd className="mt-1 text-[10px] text-primary">{formatCertificateTime(decision.timestamp)} UTC</dd></div>
                <div><dt className="text-[8px] uppercase tracking-[0.09em] text-tertiary">Transaction</dt><dd className="mt-1">{decision.transaction_hash === null ? <span className="text-[10px] text-tertiary">Unavailable</span> : <CopyValue value={decision.transaction_hash} label="Transaction hash" href={`${EXPLORER_URL}/tx/${decision.transaction_hash}`} full />}</dd></div>
              </dl>
            </article>
          ))}
          <p className="text-[9px] leading-4 text-tertiary">{history.note}</p>
        </div>
      )}
    </DetailSection>
  );
}

function Enforcement({ record }: { record: CertificateExplorerRecord }) {
  const enforcement = record.enforcement;
  const tone = enforcement.outcome === "ALLOW" ? "success" : enforcement.outcome === "BLOCK" ? "danger" : enforcement.outcome === "UNAVAILABLE" ? "warning" : "neutral";
  return (
    <DetailSection eyebrow="Enforcement status" title="PolicyGate Read-only Assessment" source={enforcement.source}>
      <div className="flex items-center justify-between gap-4 rounded-[6px] border border-edge bg-scrim p-3.5">
        <div><p className="text-[8px] uppercase tracking-[0.1em] text-tertiary">Current outcome</p><p className="mt-1 text-[10px] text-secondary">No action submitted</p></div>
        <StatusBadge label={enforcement.outcome} tone={tone} />
      </div>
      <dl className="mt-3 space-y-2 text-[10px]">
        <div className="flex justify-between gap-4"><dt className="text-tertiary">Certificate usable</dt><dd className="font-mono text-accent">{enforcement.certificate_usable === null ? "Unavailable" : enforcement.certificate_usable ? "Yes" : "No"}</dd></div>
        <div className="border-t border-edge pt-2"><dt className="text-tertiary">PolicyGate</dt><dd className="mt-1"><CopyValue value={enforcement.policygate_address} label="PolicyGate address" href={`${EXPLORER_URL}/address/${enforcement.policygate_address}`} full /></dd></div>
      </dl>
      <p className="mt-3 text-[10px] leading-5 text-secondary">{enforcement.reason}</p>
    </DetailSection>
  );
}

function IntegrationContext({ record }: { record: CertificateExplorerRecord }) {
  const steps = ["External protocol", "Certificate ID", "ProofLayer Registry", "PolicyGate", record.enforcement.outcome];
  return (
    <DetailSection eyebrow="Integration context" title="How A Protocol Uses This Certificate">
      <div className="grid gap-1.5">
        {steps.map((step, index) => (
          <div key={`${step}-${index}`}>
            <div className={`rounded-[5px] border px-3 py-2 text-center text-[9px] font-semibold uppercase tracking-[0.08em] ${index === steps.length - 1 ? "border-brand/25 bg-brand/[0.07] text-accent" : "border-edge bg-scrim text-secondary"}`}>{step}</div>
            {index === steps.length - 1 ? null : <p className="py-0.5 text-center text-[10px] text-tertiary" aria-hidden="true">↓</p>}
          </div>
        ))}
      </div>
      <Link href="/integrations" className="surface-transition mt-4 flex min-h-10 items-center justify-center rounded-[5px] border border-brand/30 bg-brand/[0.08] text-[9px] font-bold uppercase tracking-[0.1em] text-accent hover:border-brand/55 hover:bg-brand/[0.13]">Test in protocol sandbox →</Link>
    </DetailSection>
  );
}

function RecordHeader({ record }: { record: CertificateExplorerRecord }) {
  const liveNotFound = record.registry.read_status === "AVAILABLE" && record.live_certificate_found === false;
  const expired = record.timeline.validity_state === "EXPIRED";
  return (
    <header className="command-header relative overflow-hidden rounded-[9px] border border-edge px-5 py-6 sm:px-7 sm:py-7">
      <div className="relative z-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 max-w-4xl">
            <Link href="/certificates" className="text-[8px] font-bold uppercase tracking-[0.11em] text-brand hover:text-accent">← Certificate Explorer</Link>
            <p className="mt-4 text-[9px] font-semibold uppercase tracking-[0.14em] text-tertiary">ProofLayer public record</p>
            <h1 className={`mt-1 text-[30px] font-semibold leading-tight tracking-[-0.045em] sm:text-[38px] ${liveNotFound ? "text-warning" : "text-accent"}`}>
              {liveNotFound ? "Certificate Not Found" : "Verification Certificate"}
            </h1>
            {liveNotFound && record.local_fixture_found ? (
              <p className="mt-2 text-[11px] leading-5 text-warning">A matching local fixture exists, but the deployed Registry does not contain this certificate ID.</p>
            ) : null}
            <div className="mt-5 rounded-[6px] border border-edge bg-scrim p-3">
              <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">Certificate ID</p>
              <div className="mt-1.5"><CopyValue value={record.certificate_id} label="Certificate ID" full /></div>
            </div>
          </div>
          <div className="flex max-w-sm flex-wrap gap-1.5 lg:justify-end">
            {record.live_certificate_found ? <StatusBadge label="REGISTERED" tone="live" /> : null}
            {record.registry.read_status === "UNAVAILABLE" ? <StatusBadge label="LIVE READ UNAVAILABLE" tone="warning" /> : null}
            {record.local_fixture_found ? <StatusBadge label="LOCAL FIXTURE FOUND" tone="neutral" /> : null}
            {record.core.result === null ? null : <StatusBadge label={`HISTORICAL ${record.core.result}`} tone={resultTone(record.core.result)} />}
            {expired ? <StatusBadge label="EXPIRED" tone="warning" /> : record.live_certificate_found ? <StatusBadge label="ACTIVE" tone="success" /> : null}
            {record.usability.state === "LIVE READ UNAVAILABLE" ? null : (
              <StatusBadge label={record.usability.state === "USABLE" ? "USABLE" : "UNUSABLE"} tone={record.usability.state === "USABLE" ? "success" : record.usability.state === "REVOKED" ? "danger" : "warning"} />
            )}
            {record.core.revoked ? <StatusBadge label="REVOKED" tone="danger" /> : null}
          </div>
        </div>
      </div>
    </header>
  );
}

export function CertificateDetailExplorer({ certificateId }: { certificateId: string }) {
  const [record, setRecord] = useState<CertificateExplorerRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const normalized = certificateId.trim().toLowerCase();
  const valid = isCertificateId(normalized);

  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    void fetch(`/api/certificates/${normalized}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as CertificateExplorerRecord | CertificateApiError;
        if (!response.ok || "available" in payload) throw new Error("error" in payload ? payload.error : "Certificate lookup failed.");
        setRecord(payload);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Certificate lookup failed.");
      });
    return () => controller.abort();
  }, [normalized, valid]);

  if (!valid) {
    return (
      <div className="rounded-[9px] border border-fail/20 bg-surface p-6">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-fail">Invalid Certificate ID</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-accent">The URL does not contain a valid bytes32 identifier.</h1>
        <p className="mt-3 text-[11px] leading-5 text-secondary">Use a 0x-prefixed value with exactly 64 hexadecimal characters. No chain request was made.</p>
        <Link href="/certificates" className="mt-5 inline-flex text-[9px] font-bold uppercase tracking-[0.1em] text-brand-bright">Return to Certificate Explorer →</Link>
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className="rounded-[9px] border border-warning/20 bg-surface p-6">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-warning">Certificate Service Unavailable</p>
        <p className="mt-3 text-[11px] leading-5 text-warning">{error}</p>
        <Link href="/certificates" className="mt-5 inline-flex text-[9px] font-bold uppercase tracking-[0.1em] text-brand-bright">Return to Certificate Explorer →</Link>
      </div>
    );
  }

  if (record === null) {
    return <div className="h-[560px] animate-pulse rounded-[9px] border border-edge bg-overlay-hover" aria-label="Loading certificate record" />;
  }

  return (
    <>
      <RecordHeader record={record} />
      {record.warnings.length === 0 ? null : (
        <div className="mt-3 rounded-[6px] border border-warning/15 bg-warning/[0.035] px-4 py-3">
          {record.warnings.map((warning) => <p key={warning} className="text-[9px] leading-4 text-warning">{warning}</p>)}
        </div>
      )}
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,0.75fr)]">
        <div className="grid min-w-0 gap-4">
          <CoreFields record={record} />
          <EvidenceCommitment record={record} />
          <PolicyInformation record={record} />
          <DecisionHistory record={record} />
        </div>
        <div className="grid min-w-0 gap-4 xl:sticky xl:top-4">
          <VerificationState record={record} />
          <RegistryPanel record={record} />
          <Timeline record={record} />
          <Enforcement record={record} />
          <IntegrationContext record={record} />
        </div>
      </div>
      <footer className="mt-5 flex flex-col gap-1 border-t border-edge py-4 text-[9px] leading-4 text-tertiary sm:flex-row sm:justify-between">
        <p>Read-only explorer · No wallet connected · No blockchain write performed</p>
        <p className="font-mono">Registry {PROOFLAYER_CONTRACTS.registry}</p>
      </footer>
    </>
  );
}
