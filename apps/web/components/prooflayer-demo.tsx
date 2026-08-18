"use client";

import { useState, type ReactNode } from "react";

import { CopyValue } from "@/components/copy-value";
import { Icon, type IconName } from "@/components/icons";
import { PROOFLAYER_CONTRACTS, XLAYER_TESTNET } from "@/lib/contracts";
import type { DemoCertificate } from "@/lib/demo-data";
import type { OnchainDashboardData } from "@/lib/onchain";
import type { CurrentVerificationTruth } from "@/lib/truth-presentation";

type Scenario = "pass" | "indeterminate";
type LabelTone = "live" | "fixture" | "success" | "warning" | "danger" | "neutral";
type DecisionLookupState = "idle" | "loading" | "ready" | "unavailable";

type DemoContext = {
  certificate: DemoCertificate;
  onchain: OnchainDashboardData;
  certificateStatus: string;
};

type ProofLayerDemoProps = {
  pass: DemoContext;
  indeterminate: DemoContext;
  currentVerification: CurrentVerificationTruth | null;
};

const stages: ReadonlyArray<{ label: string; shortLabel: string; icon: IconName }> = [
  { label: "Evidence", shortLabel: "Evidence gathered", icon: "database" },
  { label: "Historical result", shortLabel: "Historical result", icon: "shield" },
  { label: "Certificate", shortLabel: "Inspect certificate", icon: "certificate" },
  { label: "X Layer", shortLabel: "Check registry", icon: "network" },
  { label: "PolicyGate", shortLabel: "ALLOW / BLOCK", icon: "gate" },
] as const;

const labelStyles: Record<LabelTone, string> = {
  live: "border-brand/30 bg-brand/[0.08] text-accent",
  fixture: "border-edge-strong bg-overlay-hover text-secondary",
  success: "border-success/25 bg-success-soft/[0.07] text-success",
  warning: "border-warning/25 bg-warning/[0.07] text-warning",
  danger: "border-fail/25 bg-fail/[0.07] text-fail",
  neutral: "border-edge-strong bg-scrim text-secondary",
};

function AuthenticityLabel({ children, tone }: { children: ReactNode; tone: LabelTone }) {
  return (
    <span className={`inline-flex rounded-[4px] border px-2 py-1 text-[8px] font-bold uppercase tracking-[0.1em] ${labelStyles[tone]}`}>
      {children}
    </span>
  );
}

function DataField({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 border-edge-strong p-3.5 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">{label}</dt>
      <dd className="mt-1.5 min-w-0 text-[11px] font-medium text-accent">{children}</dd>
    </div>
  );
}

function formatUnixTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1_000));
}

function resultLabel(result: number): string {
  if (result === 1) return "PASS";
  if (result === 0) return "INDETERMINATE";
  return `RESULT ${result}`;
}

function LiveStateNotice({ onchain }: { onchain: OnchainDashboardData }) {
  if (onchain.error === null) return null;

  return (
    <div className="rounded-[8px] border border-warning/20 bg-warning/[0.05] p-3 text-[10px] leading-4 text-warning">
      Live RPC data is unavailable. Fixture information remains visible, but no on-chain state is inferred. {onchain.error}
    </div>
  );
}

function EvidenceStage({ certificate }: { certificate: DemoCertificate }) {
  const evidenceFlow = [
    { label: "Evidence sources", value: "Ondo / Ethereum / Ankura", icon: "certificate" as const },
    { label: "Normalization", value: "Structured evidence", icon: "database" as const },
    { label: "Provenance", value: "Independent roots preserved", icon: "network" as const },
    { label: "Evidence root", value: certificate.solidity.evidenceRoot, icon: "shield" as const },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-tertiary">Step 01 / Evidence</p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-accent">Gather evidence for the claim</h3>
        </div>
        <AuthenticityLabel tone="fixture">Fixture</AuthenticityLabel>
      </div>

      <dl className="mt-5 grid grid-cols-2 overflow-hidden rounded-[8px] border border-edge-strong bg-overlay-active sm:grid-cols-4">
        <DataField label="Asset">{certificate.human.asset}</DataField>
        <DataField label="Claim">Treasury Backing</DataField>
        <DataField label="Claim version">{certificate.human.claim_version}</DataField>
        <DataField label="Compiler">{certificate.human.compiler_version}</DataField>
      </dl>

      <div className="mt-4 grid gap-2 lg:grid-cols-[1fr_18px_1fr_18px_1fr_18px_1fr] lg:items-center">
        {evidenceFlow.map((item, index) => (
          <div key={item.label} className="contents">
            <div className="min-w-0 rounded-[9px] border border-edge-strong bg-elevated p-4">
              <span className="grid size-9 place-items-center rounded-[8px] border border-brand/20 bg-brand/[0.055] text-accent">
                <Icon name={item.icon} className="size-4" />
              </span>
              <p className="mt-3 text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">{item.label}</p>
              {item.label === "Evidence root" ? (
                <div className="mt-1.5"><CopyValue value={item.value} label="Evidence root" /></div>
              ) : (
                <p className="mt-1.5 text-[11px] font-medium text-accent">{item.value}</p>
              )}
            </div>
            {index < evidenceFlow.length - 1 ? (
              <span className="flex h-4 items-center justify-center text-tertiary lg:h-auto" aria-hidden="true"><span className="lg:hidden">&darr;</span><span className="hidden lg:inline">&rarr;</span></span>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[8px] border border-edge-strong bg-overlay-active p-3">
          <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">Existing sources</p>
          <p className="mt-1 text-[11px] text-success">Ondo issuer evidence + Ethereum independent root + Ankura attestation</p>
        </div>
        <div className="rounded-[8px] border border-edge-strong bg-overlay-active p-3">
          <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">Independent roots</p>
          <p className="mt-1 font-mono text-[11px] text-success">{certificate.human.independent_root_count}</p>
        </div>
        <div className="rounded-[8px] border border-edge-strong bg-overlay-active p-3">
          <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">Reason codes</p>
          <p className="mt-1 font-mono text-[11px] text-success">{certificate.human.reason_codes.join(", ") || "None"}</p>
        </div>
      </div>
    </div>
  );
}

function VerificationStage({ context }: { context: DemoContext }) {
  const { certificate, onchain, certificateStatus } = context;
  const isPass = certificate.human.result === "PASS";
  const usability = onchain.usable === null ? "UNAVAILABLE" : onchain.usable ? "USABLE" : "UNUSABLE";

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-tertiary">Step 02 / RVC result</p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-accent">Deterministic RVC result and certificate usability</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <AuthenticityLabel tone="fixture">Fixture</AuthenticityLabel>
          {onchain.connected ? <AuthenticityLabel tone="live">Live on-chain</AuthenticityLabel> : null}
        </div>
      </div>

      <LiveStateNotice onchain={onchain} />

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className={`rounded-[10px] border p-5 ${isPass ? "border-success/20 bg-success-soft/[0.045]" : "border-warning/20 bg-warning/[0.045]"}`}>
          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-tertiary">Historical certificate result</p>
          <p className={`mt-2 text-3xl font-semibold tracking-[-0.04em] ${isPass ? "text-success" : "text-warning"}`}>
            {certificate.human.result}
          </p>
          <p className="mt-2 text-[11px] leading-5 text-secondary">
            {isPass ? "This historical fixture satisfied its encoded policy when observed." : "This historical fixture withheld approval because required evidence was incomplete."}
          </p>
          <div className="mt-4"><AuthenticityLabel tone="fixture">Historical fixture</AuthenticityLabel></div>
        </div>

        <div className="rounded-[10px] border border-edge-strong bg-elevated p-5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-tertiary">Current certificate usability</p>
          <p className={`mt-2 text-3xl font-semibold tracking-[-0.04em] ${onchain.usable ? "text-success" : onchain.usable === false ? "text-warning" : "text-secondary"}`}>
            {usability}
          </p>
          <p className="mt-2 text-[11px] leading-5 text-secondary">
            Registry usability is a live state check and is separate from the fixture&apos;s verification result.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <AuthenticityLabel tone={onchain.usable ? "success" : onchain.usable === false ? "warning" : "neutral"}>{usability}</AuthenticityLabel>
            {certificateStatus === "Expired" ? <AuthenticityLabel tone="warning">Expired</AuthenticityLabel> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function CertificateStage({ context }: { context: DemoContext }) {
  const { certificate, onchain, certificateStatus } = context;
  const stored = onchain.certificate;
  const usabilityLabel = onchain.usable === null ? "Unavailable" : onchain.usable ? "Usable" : "Unusable";
  const usabilityTone: LabelTone = onchain.usable === null ? "neutral" : onchain.usable ? "success" : "warning";

  if (onchain.connected && onchain.registered === false) {
    return (
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-tertiary">Step 03 / Certificate</p>
        <div className="mt-5 rounded-[10px] border border-warning/20 bg-warning/[0.045] p-6">
          <AuthenticityLabel tone="warning">No certificate</AuthenticityLabel>
          <h3 className="mt-3 text-xl font-semibold text-accent">Certificate not found in the Registry</h3>
          <p className="mt-2 text-[11px] leading-5 text-secondary">The fixture remains available, but this certificate ID is not registered on the connected X Layer deployment.</p>
        </div>
      </div>
    );
  }

  const fields = stored === null ? {
    certificateId: certificate.solidity.certificateId,
    assetId: certificate.solidity.assetId,
    claimType: certificate.solidity.claimType,
    policyId: certificate.solidity.policyId,
    evidenceRoot: certificate.solidity.evidenceRoot,
    observedAt: certificate.solidity.observedAt,
    validUntil: certificate.solidity.validUntil,
    independentRootCount: certificate.solidity.independentRootCount,
    result: certificate.human.result,
    issuer: null,
    revoked: null,
  } : {
    ...stored,
    result: resultLabel(stored.result),
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-tertiary">Step 03 / Certificate</p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-accent">Inspect the verification certificate</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <AuthenticityLabel tone={stored === null ? "fixture" : "live"}>{stored === null ? "Fixture fallback" : "Live on-chain"}</AuthenticityLabel>
          <AuthenticityLabel tone={usabilityTone}>{usabilityLabel}</AuthenticityLabel>
          {certificateStatus === "Expired" ? <AuthenticityLabel tone="warning">Expired</AuthenticityLabel> : null}
        </div>
      </div>

      <div className="mt-4"><LiveStateNotice onchain={onchain} /></div>
      <dl className="mt-5 grid overflow-hidden rounded-[9px] border border-edge-strong bg-elevated sm:grid-cols-2 [&>div]:border-b [&>div]:sm:odd:border-r">
        <DataField label="Certificate ID" wide><CopyValue value={fields.certificateId} label="Certificate ID" /></DataField>
        <DataField label="Asset ID"><CopyValue value={fields.assetId} label="Asset ID" /></DataField>
        <DataField label="Claim Type"><CopyValue value={fields.claimType} label="Claim type" /></DataField>
        <DataField label="Policy ID"><CopyValue value={fields.policyId} label="Policy ID" /></DataField>
        <DataField label="Evidence Root"><CopyValue value={fields.evidenceRoot} label="Evidence root" /></DataField>
        <DataField label="Observed At">{formatUnixTime(fields.observedAt)} UTC</DataField>
        <DataField label="Valid Until">{formatUnixTime(fields.validUntil)} UTC</DataField>
        <DataField label="Independent Root Count">{fields.independentRootCount}</DataField>
        <DataField label="Result">{fields.result}</DataField>
        <DataField label="Issuer">{fields.issuer === null ? "Unavailable" : <CopyValue value={fields.issuer} label="Certificate issuer" />}</DataField>
        <DataField label="Revoked">{fields.revoked === null ? "Unavailable" : fields.revoked ? "Yes" : "No"}</DataField>
        <DataField label="Current usability">{usabilityLabel}</DataField>
      </dl>
    </div>
  );
}

function XLayerStage({ context }: { context: DemoContext }) {
  const { onchain } = context;
  const explorerAddress = `${XLAYER_TESTNET.explorerUrl}/address/${PROOFLAYER_CONTRACTS.registry}`;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-tertiary">Step 04 / X Layer</p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-accent">Confirm the certificate on X Layer</h3>
        </div>
        <AuthenticityLabel tone={onchain.connected ? "live" : "warning"}>{onchain.connected ? "Live on-chain" : "RPC unavailable"}</AuthenticityLabel>
      </div>

      <div className="mt-4"><LiveStateNotice onchain={onchain} /></div>
      <dl className="mt-5 grid overflow-hidden rounded-[9px] border border-edge-strong bg-elevated sm:grid-cols-2 lg:grid-cols-3 [&>div]:border-b [&>div]:sm:border-r">
        <DataField label="Network">{XLAYER_TESTNET.name}</DataField>
        <DataField label="Chain ID">{onchain.chainId ?? "Unavailable"}</DataField>
        <DataField label="Latest block">{onchain.latestBlock?.toLocaleString("en-GB") ?? "Unavailable"}</DataField>
        <DataField label="Registry" wide><CopyValue value={PROOFLAYER_CONTRACTS.registry} label="Registry" href={explorerAddress} /></DataField>
        <DataField label="Certificate exists">{onchain.registered === null ? "Unavailable" : onchain.registered ? "Yes" : "No"}</DataField>
        <DataField label="Certificate usable">{onchain.usable === null ? "Unavailable" : onchain.usable ? "Yes" : "No"}</DataField>
      </dl>
      <p className="mt-4 text-[10px] leading-4 text-secondary">These are public read-only RPC values. This interface never connects a wallet or submits a transaction.</p>
    </div>
  );
}

function PolicyGateStage({
  context,
  lookupState,
  onRequestLookup,
}: {
  context: DemoContext;
  lookupState: DecisionLookupState;
  onRequestLookup: () => void;
}) {
  const { certificate, onchain } = context;
  const isPass = certificate.human.result === "PASS";
  const stateKnown = onchain.connected && onchain.registered !== null && onchain.usable !== null;
  const allowedNow = stateKnown && isPass && onchain.usable === true;
  const rejectedNow = stateKnown && !allowedNow;
  const outcome = allowedNow ? "ALLOW" : rejectedNow ? "BLOCK" : "OUTCOME UNAVAILABLE";
  const outcomeTone: LabelTone = allowedNow ? "success" : rejectedNow ? "danger" : "neutral";
  const usability = onchain.usable === null ? "Certificate state unavailable" : onchain.usable ? "Certificate usable" : "Certificate unusable";

  const nodes = [certificate.human.result, usability, "PolicyGate", outcome];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-tertiary">Step 05 / PolicyGate</p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-accent">Enforcement decision</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <AuthenticityLabel tone="fixture">Fixture</AuthenticityLabel>
          {onchain.connected ? <AuthenticityLabel tone="live">Live on-chain state</AuthenticityLabel> : null}
        </div>
      </div>

      <div
        className={`mt-5 flex items-center justify-between gap-4 rounded-[10px] border p-5 sm:p-6 ${
          allowedNow
            ? "border-success/25 bg-success-soft/[0.06]"
            : rejectedNow
              ? "border-fail/25 bg-fail/[0.06]"
              : "border-edge-strong bg-elevated"
        }`}
      >
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-tertiary">PolicyGate outcome</p>
          <p className={`mt-1 text-4xl font-bold tracking-[-0.04em] ${allowedNow ? "text-success" : rejectedNow ? "text-fail" : "text-secondary"}`}>
            {outcome}
          </p>
        </div>
        <p className="max-w-[300px] text-right text-[11px] leading-5 text-secondary">
          {isPass && onchain.usable === false
            ? "The historical PASS remains in the record, but the certificate is currently unusable, so this reference eligibility check blocks a new action."
            : allowedNow
              ? "The historical PASS and live usable certificate satisfy this reference eligibility check; this is not a current RVC result."
              : certificate.human.result === "INDETERMINATE"
                ? "INDETERMINATE does not satisfy the PASS requirement, so PolicyGate blocks the action."
                : "PolicyGate eligibility cannot be confirmed because live certificate state is unavailable."}
        </p>
      </div>

      <div className="mt-5 grid gap-2 lg:grid-cols-[1fr_22px_1fr_22px_1fr_22px_1fr] lg:items-center">
        {nodes.map((node, index) => (
          <div key={`${node}-${index}`} className="contents">
            <div className={`rounded-[9px] border p-4 text-center ${index === nodes.length - 1 ? labelStyles[outcomeTone] : "border-edge-strong bg-elevated text-accent"}`}>
              <p className="text-[10px] font-bold uppercase tracking-[0.07em]">{node}</p>
            </div>
            {index < nodes.length - 1 ? <span className="flex h-4 items-center justify-center text-tertiary lg:h-auto" aria-hidden="true"><span className="lg:hidden">&darr;</span><span className="hidden lg:inline">&rarr;</span></span> : null}
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-[9px] border border-edge-strong bg-overlay-active p-4">
        <p className="text-[11px] leading-5 text-secondary">
          PolicyGate enforcement is separate from certificate registration: a certificate can exist on-chain while an action is still blocked.
        </p>
        <p className="mt-2 text-[9px] text-success">No blockchain write is attempted by this interface.</p>
      </div>

      <details className="mt-5 group">
        <summary className="cursor-pointer select-none rounded-[7px] border border-edge-strong bg-overlay-hover px-3.5 py-2.5 text-[9px] font-bold uppercase tracking-[0.12em] text-accent hover:border-edge-strong">
          View on-chain decision record
        </summary>
        <div className="mt-4">
          <DecisionLogStage context={context} lookupState={lookupState} onRequestLookup={onRequestLookup} embedded />
        </div>
      </details>
    </div>
  );
}

function DecisionLogStage({
  context,
  lookupState,
  onRequestLookup,
  embedded = false,
}: {
  context: DemoContext;
  lookupState: DecisionLookupState;
  onRequestLookup: () => void;
  embedded?: boolean;
}) {
  const { onchain } = context;
  const decision = onchain.decision;

  return (
    <div>
      {!embedded ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-tertiary">DecisionLog</p>
            <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-accent">Inspect the immutable decision outcome</h3>
          </div>
          <AuthenticityLabel tone={onchain.connected ? "live" : "warning"}>{onchain.connected ? "Live on-chain" : "RPC unavailable"}</AuthenticityLabel>
        </div>
      ) : null}

      {decision !== null ? (
        <dl className="mt-5 grid overflow-hidden rounded-[9px] border border-edge-strong bg-elevated sm:grid-cols-2 [&>div]:border-b [&>div]:sm:odd:border-r">
          <DataField label="Decision ID"><CopyValue value={decision.decisionId} label="Decision ID" /></DataField>
          <DataField label="Certificate"><CopyValue value={decision.certificateId} label="Decision certificate" /></DataField>
          <DataField label="Actor"><CopyValue value={decision.actor} label="Decision actor" /></DataField>
          <DataField label="Action Type"><CopyValue value={decision.actionType} label="Decision action type" /></DataField>
          <DataField label="Allowed"><span className={decision.allowed ? "text-success" : "text-fail"}>{decision.allowed ? "Yes" : "No"}</span></DataField>
          <DataField label="Timestamp">{formatUnixTime(decision.timestamp)} UTC</DataField>
          <DataField label="Transaction" wide>
            <CopyValue value={decision.transactionHash} label="Decision transaction" href={`${XLAYER_TESTNET.explorerUrl}/tx/${decision.transactionHash}`} />
          </DataField>
        </dl>
      ) : lookupState === "loading" ? (
        <div className="mt-5 rounded-[10px] border border-brand/20 bg-brand/[0.045] p-6" aria-live="polite">
          <AuthenticityLabel tone="live">RPC loading</AuthenticityLabel>
          <h4 className="mt-3 text-base font-semibold text-accent">Checking historical DecisionRecorded events</h4>
          <p className="mt-2 max-w-2xl text-[11px] leading-5 text-secondary">The public X Layer RPC limits event ranges, so the bounded lookup may take a moment.</p>
        </div>
      ) : onchain.decisionLookupComplete ? (
        <div className="mt-5 rounded-[10px] border border-edge-strong bg-elevated p-6">
          <AuthenticityLabel tone="neutral">No decision record</AuthenticityLabel>
          <h4 className="mt-3 text-base font-semibold text-accent">No DecisionLog record exists for this attempted action.</h4>
          <p className="mt-2 max-w-2xl text-[11px] leading-5 text-secondary">
            Rejected PolicyGate calls revert and therefore do not create successful DecisionRecorded entries. This frontend did not submit a new action.
          </p>
        </div>
      ) : lookupState === "idle" ? (
        <div className="mt-5 rounded-[10px] border border-edge-strong bg-elevated p-6">
          <AuthenticityLabel tone="neutral">Lookup not started</AuthenticityLabel>
          <h4 className="mt-3 text-base font-semibold text-accent">Check for a matching DecisionLog record</h4>
          <p className="mt-2 max-w-2xl text-[11px] leading-5 text-secondary">Certificate and PolicyGate state are already live. Historical events are queried only when requested so the initial dashboard remains responsive.</p>
          <button
            type="button"
            onClick={onRequestLookup}
            className="surface-transition mt-4 rounded-[7px] border border-brand/30 bg-brand/[0.08] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] text-accent hover:bg-brand/[0.13]"
          >
            Check DecisionLog
          </button>
        </div>
      ) : (
        <div className="mt-5 rounded-[10px] border border-warning/20 bg-warning/[0.045] p-6">
          <AuthenticityLabel tone="warning">DecisionLog unavailable</AuthenticityLabel>
          <h4 className="mt-3 text-base font-semibold text-accent">A matching decision could not be confirmed</h4>
          <p className="mt-2 max-w-2xl text-[11px] leading-5 text-secondary">
            The RPC did not complete the historical event lookup. No decision state is inferred from the missing response.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-4 text-[9px] text-secondary">
        <span>DecisionLog total: <strong className="font-mono text-accent">{onchain.decisionCount ?? "Unavailable"}</strong></span>
        <span>Executed actions: <strong className="font-mono text-accent">{onchain.executedActionCount ?? "Unavailable"}</strong></span>
      </div>
    </div>
  );
}

function ActiveStage({
  stage,
  context,
  decisionLookupState,
  onRequestDecisionLookup,
}: {
  stage: number;
  context: DemoContext;
  decisionLookupState: DecisionLookupState;
  onRequestDecisionLookup: () => void;
}) {
  if (stage === 0) return <EvidenceStage certificate={context.certificate} />;
  if (stage === 1) return <VerificationStage context={context} />;
  if (stage === 2) return <CertificateStage context={context} />;
  if (stage === 3) return <XLayerStage context={context} />;
  return (
    <PolicyGateStage
      context={context}
      lookupState={decisionLookupState}
      onRequestLookup={onRequestDecisionLookup}
    />
  );
}

function DemoIntro() {
  return (
    <div className="demo-stage-panel grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
      <div>
        <AuthenticityLabel tone="fixture">Historical certificate trace</AuthenticityLabel>
        <h3 className="mt-3 max-w-2xl text-2xl font-bold tracking-[-0.04em] text-brand-bright sm:text-3xl">Inspect a historical Evidence-to-PolicyGate trace</h3>
        <p className="mt-2.5 max-w-2xl text-[12px] leading-5 text-secondary">
          This reference trace explains an exported certificate fixture and its current X Layer usability. It does not replace or infer the current RVC result.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a
            href="#historical-trace-controls"
            className="inline-flex items-center justify-center rounded-[7px] border border-brand/55 bg-brand px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] transition hover:bg-brand"
          >
            Inspect Reference Trace
          </a>
          <span className="hidden text-[10px] font-semibold uppercase tracking-[0.11em] text-tertiary sm:inline">
            Evidence → Verify → Certificate → Enforce
          </span>
        </div>
      </div>
      <div className="rounded-[10px] border border-edge-strong bg-elevated p-4">
        <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-secondary">Primary flow</p>
        <div className="mt-3 space-y-2 text-[10px] font-medium text-accent">
          <p>USDY Treasury Backing evidence</p>
          <p>Deterministic RVC result</p>
          <p>Certificate on X Layer</p>
          <p>PolicyGate ALLOW / BLOCK</p>
        </div>
      </div>
    </div>
  );
}

export function ProofLayerDemo({ pass, indeterminate, currentVerification }: ProofLayerDemoProps) {
  const [scenario, setScenario] = useState<Scenario>("pass");
  const [started, setStarted] = useState(false);
  const [activeStage, setActiveStage] = useState(0);
  const [passOnchain, setPassOnchain] = useState(pass.onchain);
  const [passDecisionLookup, setPassDecisionLookup] = useState<DecisionLookupState>(
    pass.onchain.decisionLookupComplete ? "ready" : "idle",
  );
  const [indeterminateOnchain, setIndeterminateOnchain] = useState(indeterminate.onchain);
  const [indeterminateDecisionLookup, setIndeterminateDecisionLookup] = useState<DecisionLookupState>(
    indeterminate.onchain.decisionLookupComplete ? "ready" : "idle",
  );
  const passContext = { ...pass, onchain: passOnchain };
  const indeterminateContext = { ...indeterminate, onchain: indeterminateOnchain };
  const context = scenario === "pass" ? passContext : indeterminateContext;
  const decisionLookupState = scenario === "pass" ? passDecisionLookup : indeterminateDecisionLookup;
  const progress = ((activeStage + 1) / stages.length) * 100;

  async function loadDecision(targetScenario: Scenario) {
    const lookupState = targetScenario === "pass" ? passDecisionLookup : indeterminateDecisionLookup;
    if (lookupState === "loading" || lookupState === "ready") return;

    const setLookupState = targetScenario === "pass" ? setPassDecisionLookup : setIndeterminateDecisionLookup;
    setLookupState("loading");
    try {
      const endpoint = targetScenario === "pass" ? "/api/demo/pass-decision" : "/api/demo/indeterminate-decision";
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error(`DecisionLog request failed with status ${response.status}`);
      const data = (await response.json()) as OnchainDashboardData;
      if (targetScenario === "pass") {
        setPassOnchain(data);
      } else {
        setIndeterminateOnchain(data);
      }
      setLookupState(data.decisionLookupComplete ? "ready" : "unavailable");
    } catch {
      setLookupState("unavailable");
    }
  }

  function goToStage(nextStage: number) {
    setActiveStage(nextStage);
    if (nextStage === stages.length - 1) {
      void loadDecision(scenario);
    }
  }

  function runDemo() {
    setActiveStage(0);
    setStarted(true);
  }

  function selectScenario(nextScenario: Scenario) {
    setScenario(nextScenario);
    if (activeStage === stages.length - 1) {
      void loadDecision(nextScenario);
    }
  }

  return (
    <section id="historical-trace" className="scroll-mt-[76px] overflow-hidden rounded-[10px] border border-edge-strong bg-surface" aria-labelledby="demo-heading">
      <div className="border-b border-edge-strong bg-[linear-gradient(110deg,rgba(143,125,240,0.08),transparent_62%)] px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-bright">Historical Certificate Trace</p>
          <AuthenticityLabel tone="fixture">Fixture-led / read only</AuthenticityLabel>
        </div>

        <p className="mt-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-secondary">
          Evidence <span className="px-1 text-tertiary" aria-hidden="true">&rarr;</span> RVC result <span className="px-1 text-tertiary" aria-hidden="true">&rarr;</span> Certificate <span className="px-1 text-tertiary" aria-hidden="true">&rarr;</span> X Layer <span className="px-1 text-tertiary" aria-hidden="true">&rarr;</span> PolicyGate
        </p>

        <div className={`mt-4 rounded-[8px] border px-4 py-3 ${currentVerification?.result === "FAIL" ? "border-fail/25 bg-fail/[0.055]" : currentVerification?.result === "PASS" ? "border-success/25 bg-success-soft/[0.055]" : "border-warning/25 bg-warning/[0.045]"}`}>
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-tertiary">Current RVC result</p>
          <p className={`mt-1 font-mono text-[13px] font-bold ${currentVerification?.result === "FAIL" ? "text-fail" : currentVerification?.result === "PASS" ? "text-success" : "text-warning"}`}>
            {currentVerification?.result ?? "UNAVAILABLE"}
            {currentVerification?.reason_codes.length ? ` — ${currentVerification.reason_codes.join(", ")}` : ""}
          </p>
          <p className="mt-1 text-[9px] leading-4 text-secondary">This current evidence result is authoritative for present verification. The selectable traces below are historical fixtures.</p>
        </div>

        <div id="historical-trace-controls" className="mt-5 grid scroll-mt-[76px] gap-4 border-t border-edge-strong pt-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-5">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-tertiary">Historical workflow input</p>
              <h2 id="demo-heading" className="mt-1 text-xl font-bold tracking-[-0.035em] text-brand-bright">Certificate fixture trace</h2>
            </div>

            <div className="inline-grid w-fit max-w-full grid-cols-[auto_auto] rounded-[7px] border border-edge-strong bg-background/70 p-1" aria-label="Historical certificate fixture">
              <button
                type="button"
                aria-pressed={scenario === "pass"}
                onClick={() => selectScenario("pass")}
                className={`surface-transition whitespace-nowrap rounded-[5px] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] ${scenario === "pass" ? "bg-success-soft/12 text-success shadow-[inset_0_0_0_1px_rgba(54,209,124,0.12)]" : "text-tertiary hover:text-primary"}`}
              >
                Historical PASS
              </button>
              <button
                type="button"
                aria-pressed={scenario === "indeterminate"}
                onClick={() => selectScenario("indeterminate")}
                className={`surface-transition whitespace-nowrap rounded-[5px] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.075em] ${scenario === "indeterminate" ? "bg-warning/12 text-warning shadow-[inset_0_0_0_1px_rgba(233,185,73,0.12)]" : "text-tertiary hover:text-primary"}`}
              >
                Historical INDETERMINATE
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={runDemo}
            className="surface-transition inline-flex min-h-11 w-full items-center justify-center gap-3 whitespace-nowrap rounded-[7px] border border-brand/55 bg-brand px-5 text-[10px] font-bold uppercase tracking-[0.075em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_18px_rgba(119,100,220,0.12)] hover:border-brand/75 hover:bg-brand sm:w-fit lg:justify-self-end"
          >
            Inspect Reference Trace
            <span aria-hidden="true">&rarr;</span>
          </button>
        </div>
      </div>

      {started ? (
        <>
          <div className="border-b border-edge-strong bg-overlay-active px-4 py-4 sm:px-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="Verification stages">
              {stages.map((stage, index) => {
                const isActive = index === activeStage;
                const isComplete = index < activeStage;
                return (
                  <button
                    key={stage.label}
                    type="button"
                    aria-current={isActive ? "step" : undefined}
                    onClick={() => goToStage(index)}
                    className={`surface-transition min-w-0 rounded-[7px] border p-2.5 text-left ${isActive ? "border-brand/35 bg-brand/[0.08]" : "border-edge-strong bg-overlay-hover hover:border-edge-strong"}`}
                  >
                    <span className={`text-[8px] font-bold uppercase tracking-[0.09em] ${isActive ? "text-accent" : isComplete ? "text-success" : "text-tertiary"}`}>Step {String(index + 1).padStart(2, "0")}</span>
                    <span className="mt-1 block truncate text-[10px] font-semibold text-accent">{stage.shortLabel}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 h-px overflow-hidden bg-overlay-hover">
              <div className="demo-progress h-full bg-brand" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div key={`${scenario}-${activeStage}`} className="demo-stage-panel p-5 sm:p-6">
            <ActiveStage
              stage={activeStage}
              context={context}
              decisionLookupState={decisionLookupState}
              onRequestDecisionLookup={() => void loadDecision(scenario)}
            />
          </div>

          <div className="flex flex-col gap-3 border-t border-edge-strong bg-overlay-active px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-[9px] text-tertiary">{scenario === "pass" ? "Historical PASS fixture selected" : "Historical INDETERMINATE fixture selected"} / Stage {activeStage + 1} of {stages.length}</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={activeStage === 0}
                onClick={() => goToStage(Math.max(0, activeStage - 1))}
                className="surface-transition rounded-[7px] border border-edge-strong px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] text-primary hover:border-edge-strong disabled:cursor-not-allowed disabled:opacity-35"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={activeStage === stages.length - 1}
                onClick={() => goToStage(Math.min(stages.length - 1, activeStage + 1))}
                className="surface-transition rounded-[7px] border border-brand/30 bg-brand/[0.08] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] text-accent hover:bg-brand/[0.13] disabled:cursor-not-allowed disabled:opacity-35"
              >
                Next stage
              </button>
            </div>
          </div>
        </>
      ) : (
        <DemoIntro />
      )}
    </section>
  );
}
