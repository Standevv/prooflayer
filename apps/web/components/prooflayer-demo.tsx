"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";

import { CopyValue } from "@/components/copy-value";
import { Icon, type IconName } from "@/components/icons";
import { PROOFLAYER_CONTRACTS, XLAYER_TESTNET } from "@/lib/contracts";
import type { DemoCertificate } from "@/lib/demo-data";
import type { OnchainDashboardData } from "@/lib/onchain";

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
};

const stages: ReadonlyArray<{ label: string; shortLabel: string; icon: IconName }> = [
  { label: "Asset", shortLabel: "Select asset", icon: "overview" },
  { label: "Evidence", shortLabel: "Load evidence", icon: "database" },
  { label: "Verification", shortLabel: "Verify claim", icon: "shield" },
  { label: "Certificate", shortLabel: "Inspect certificate", icon: "certificate" },
  { label: "X Layer", shortLabel: "Check registry", icon: "network" },
  { label: "PolicyGate", shortLabel: "Check PolicyGate", icon: "gate" },
  { label: "DecisionLog", shortLabel: "View decision", icon: "activity" },
] as const;

const labelStyles: Record<LabelTone, string> = {
  live: "border-[#8b7ce7]/30 bg-[#8b7ce7]/[0.08] text-[#b8aff3]",
  fixture: "border-white/[0.12] bg-white/[0.035] text-[#a8b1ab]",
  success: "border-[#36d17c]/25 bg-[#36d17c]/[0.07] text-[#36d17c]",
  warning: "border-[#e9b949]/25 bg-[#e9b949]/[0.07] text-[#e9b949]",
  danger: "border-[#ff6b6b]/25 bg-[#ff6b6b]/[0.07] text-[#ff6b6b]",
  neutral: "border-white/[0.1] bg-black/20 text-[#969ba8]",
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
    <div className={`min-w-0 border-white/[0.07] p-3.5 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#747987]">{label}</dt>
      <dd className="mt-1.5 min-w-0 text-[11px] font-medium text-[#d4d7df]">{children}</dd>
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
    <div className="rounded-[8px] border border-[#e9b949]/20 bg-[#e9b949]/[0.05] p-3 text-[10px] leading-4 text-[#d7b35c]">
      Live RPC data is unavailable. Fixture information remains visible, but no on-chain state is inferred. {onchain.error}
    </div>
  );
}

function AssetStage({ certificate }: { certificate: DemoCertificate }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(250px,0.85fr)]">
      <figure className="relative min-h-[260px] overflow-hidden rounded-[10px] border border-white/[0.09] bg-[#0d0f14] sm:min-h-[320px]">
        <Image
          src="/assets/us-treasury.webp"
          alt="United States Treasury building in Washington, D.C."
          fill
          sizes="(max-width: 1023px) 100vw, 55vw"
          loading="eager"
          className="asset-context-photo object-cover"
        />
        <div className="asset-showcase-shade absolute inset-0" aria-hidden="true" />
        <div className="asset-context-grid absolute inset-0" aria-hidden="true" />
        <figcaption className="absolute inset-x-0 bottom-0 z-10 p-5 sm:p-6">
          <AuthenticityLabel tone="fixture">Demo fixture</AuthenticityLabel>
          <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#b1b5bf]">Government securities</p>
          <h3 className="mt-1 text-2xl font-semibold tracking-[-0.035em] text-[#f2f5f3]">USDY</h3>
          <p className="mt-1 text-[12px] font-medium text-[#c2c5cd]">Treasury Backing</p>
        </figcaption>
      </figure>

      <div className="rounded-[10px] border border-white/[0.08] bg-[#171a22] p-5 sm:p-6">
        <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#747987]">Step 01 / Asset</p>
        <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#f0f0f4]">Select the claim context</h3>
        <p className="mt-3 text-[11px] leading-5 text-[#9da2ae]">
          This demo uses the existing exported USDY TreasuryBacking certificate fixture. The image supplies product context only.
        </p>
        <dl className="mt-5 grid grid-cols-2 overflow-hidden rounded-[8px] border border-white/[0.08] bg-black/[0.08]">
          <DataField label="Asset">{certificate.human.asset}</DataField>
          <DataField label="Claim">Treasury Backing</DataField>
          <DataField label="Claim version">{certificate.human.claim_version}</DataField>
          <DataField label="Compiler">{certificate.human.compiler_version}</DataField>
        </dl>
      </div>
    </div>
  );
}

function EvidenceStage({ certificate }: { certificate: DemoCertificate }) {
  const evidenceFlow = [
    { label: "Evidence sources", value: "Ondo / Ethereum", icon: "certificate" as const },
    { label: "Normalization", value: "Structured evidence", icon: "database" as const },
    { label: "Provenance", value: "Independent roots preserved", icon: "network" as const },
    { label: "Evidence root", value: certificate.solidity.evidenceRoot, icon: "shield" as const },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#747987]">Step 02 / Evidence</p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#f0f0f4]">Trace evidence into a deterministic root</h3>
        </div>
        <AuthenticityLabel tone="fixture">Demo fixture</AuthenticityLabel>
      </div>

      <div className="mt-5 grid gap-2 lg:grid-cols-[1fr_18px_1fr_18px_1fr_18px_1fr] lg:items-center">
        {evidenceFlow.map((item, index) => (
          <div key={item.label} className="contents">
            <div className="min-w-0 rounded-[9px] border border-white/[0.08] bg-[#171a22] p-4">
              <span className="grid size-9 place-items-center rounded-[8px] border border-[#8b7ce7]/20 bg-[#8b7ce7]/[0.055] text-[#a99ff0]">
                <Icon name={item.icon} className="size-4" />
              </span>
              <p className="mt-3 text-[8px] font-semibold uppercase tracking-[0.1em] text-[#747987]">{item.label}</p>
              {item.label === "Evidence root" ? (
                <div className="mt-1.5"><CopyValue value={item.value} label="Demo evidence root" /></div>
              ) : (
                <p className="mt-1.5 text-[11px] font-medium text-[#d4d7df]">{item.value}</p>
              )}
            </div>
            {index < evidenceFlow.length - 1 ? (
              <span className="flex h-4 items-center justify-center text-[#48544c] lg:h-auto" aria-hidden="true"><span className="lg:hidden">&darr;</span><span className="hidden lg:inline">&rarr;</span></span>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[8px] border border-white/[0.07] bg-black/[0.08] p-3">
          <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#747987]">Existing sources</p>
          <p className="mt-1 text-[11px] text-[#c3cbc6]">Ondo issuer evidence + Ethereum independent root</p>
        </div>
        <div className="rounded-[8px] border border-white/[0.07] bg-black/[0.08] p-3">
          <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#747987]">Independent roots</p>
          <p className="mt-1 font-mono text-[11px] text-[#c3cbc6]">{certificate.human.independent_root_count}</p>
        </div>
        <div className="rounded-[8px] border border-white/[0.07] bg-black/[0.08] p-3">
          <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#747987]">Reason codes</p>
          <p className="mt-1 font-mono text-[11px] text-[#c3cbc6]">{certificate.human.reason_codes.join(", ") || "None"}</p>
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
          <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#747987]">Step 03 / Verification</p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#f0f0f4]">Verification result and current usability</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <AuthenticityLabel tone="fixture">Demo fixture</AuthenticityLabel>
          {onchain.connected ? <AuthenticityLabel tone="live">Live on-chain</AuthenticityLabel> : null}
        </div>
      </div>

      <LiveStateNotice onchain={onchain} />

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className={`rounded-[10px] border p-5 ${isPass ? "border-[#36d17c]/20 bg-[#36d17c]/[0.045]" : "border-[#e9b949]/20 bg-[#e9b949]/[0.045]"}`}>
          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#747987]">Verification result</p>
          <p className={`mt-2 text-3xl font-semibold tracking-[-0.04em] ${isPass ? "text-[#36d17c]" : "text-[#e9b949]"}`}>
            {certificate.human.result}
          </p>
          <p className="mt-2 text-[11px] leading-5 text-[#9da2ae]">
            {isPass ? "The deterministic fixture satisfied its encoded policy." : "The deterministic fixture withheld approval because required evidence was incomplete."}
          </p>
          <div className="mt-4"><AuthenticityLabel tone={isPass ? "success" : "warning"}>{isPass ? "Verified" : "Approval withheld"}</AuthenticityLabel></div>
        </div>

        <div className="rounded-[10px] border border-white/[0.08] bg-[#171a22] p-5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#747987]">Current certificate usability</p>
          <p className={`mt-2 text-3xl font-semibold tracking-[-0.04em] ${onchain.usable ? "text-[#36d17c]" : onchain.usable === false ? "text-[#e9b949]" : "text-[#969ba8]"}`}>
            {usability}
          </p>
          <p className="mt-2 text-[11px] leading-5 text-[#9da2ae]">
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
        <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#747987]">Step 04 / Certificate</p>
        <div className="mt-5 rounded-[10px] border border-[#e9b949]/20 bg-[#e9b949]/[0.045] p-6">
          <AuthenticityLabel tone="warning">No certificate</AuthenticityLabel>
          <h3 className="mt-3 text-xl font-semibold text-[#f0f0f4]">Certificate not found in the Registry</h3>
          <p className="mt-2 text-[11px] leading-5 text-[#9da2ae]">The fixture remains available, but this certificate ID is not registered on the connected X Layer deployment.</p>
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
          <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#747987]">Step 04 / Certificate</p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#f0f0f4]">Inspect the verification certificate</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <AuthenticityLabel tone={stored === null ? "fixture" : "live"}>{stored === null ? "Demo fixture fallback" : "Live on-chain"}</AuthenticityLabel>
          <AuthenticityLabel tone={usabilityTone}>{usabilityLabel}</AuthenticityLabel>
          {certificateStatus === "Expired" ? <AuthenticityLabel tone="warning">Expired</AuthenticityLabel> : null}
        </div>
      </div>

      <div className="mt-4"><LiveStateNotice onchain={onchain} /></div>
      <dl className="mt-5 grid overflow-hidden rounded-[9px] border border-white/[0.08] bg-[#171a22] sm:grid-cols-2 [&>div]:border-b [&>div]:sm:odd:border-r">
        <DataField label="Certificate ID" wide><CopyValue value={fields.certificateId} label="Demo certificate ID" /></DataField>
        <DataField label="Asset ID"><CopyValue value={fields.assetId} label="Demo asset ID" /></DataField>
        <DataField label="Claim Type"><CopyValue value={fields.claimType} label="Demo claim type" /></DataField>
        <DataField label="Policy ID"><CopyValue value={fields.policyId} label="Demo policy ID" /></DataField>
        <DataField label="Evidence Root"><CopyValue value={fields.evidenceRoot} label="Demo evidence root" /></DataField>
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
          <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#747987]">Step 05 / X Layer</p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#f0f0f4]">Confirm the certificate on X Layer</h3>
        </div>
        <AuthenticityLabel tone={onchain.connected ? "live" : "warning"}>{onchain.connected ? "Live on-chain" : "RPC unavailable"}</AuthenticityLabel>
      </div>

      <div className="mt-4"><LiveStateNotice onchain={onchain} /></div>
      <dl className="mt-5 grid overflow-hidden rounded-[9px] border border-white/[0.08] bg-[#171a22] sm:grid-cols-2 lg:grid-cols-3 [&>div]:border-b [&>div]:sm:border-r">
        <DataField label="Network">{XLAYER_TESTNET.name}</DataField>
        <DataField label="Chain ID">{onchain.chainId ?? "Unavailable"}</DataField>
        <DataField label="Latest block">{onchain.latestBlock?.toLocaleString("en-GB") ?? "Unavailable"}</DataField>
        <DataField label="Registry" wide><CopyValue value={PROOFLAYER_CONTRACTS.registry} label="Registry" href={explorerAddress} /></DataField>
        <DataField label="Certificate exists">{onchain.registered === null ? "Unavailable" : onchain.registered ? "Yes" : "No"}</DataField>
        <DataField label="Certificate usable">{onchain.usable === null ? "Unavailable" : onchain.usable ? "Yes" : "No"}</DataField>
      </dl>
      <p className="mt-4 text-[10px] leading-4 text-[#858a97]">These are public read-only RPC values. Demo Mode never connects a wallet or submits a transaction.</p>
    </div>
  );
}

function PolicyGateStage({ context }: { context: DemoContext }) {
  const { certificate, onchain } = context;
  const isPass = certificate.human.result === "PASS";
  const stateKnown = onchain.connected && onchain.registered !== null && onchain.usable !== null;
  const allowedNow = stateKnown && isPass && onchain.usable === true;
  const rejectedNow = stateKnown && !allowedNow;
  const outcome = allowedNow ? "ACTION ALLOWED" : rejectedNow ? "ACTION REJECTED" : "OUTCOME UNAVAILABLE";
  const outcomeTone: LabelTone = allowedNow ? "success" : rejectedNow ? "danger" : "neutral";
  const usability = onchain.usable === null ? "Certificate state unavailable" : onchain.usable ? "Certificate usable" : "Certificate unusable";

  const nodes = [certificate.human.result, usability, "PolicyGate", outcome];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#747987]">Step 06 / PolicyGate</p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#f0f0f4]">Evaluate protected-action access</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <AuthenticityLabel tone="fixture">Demo fixture</AuthenticityLabel>
          {onchain.connected ? <AuthenticityLabel tone="live">Live on-chain state</AuthenticityLabel> : null}
        </div>
      </div>

      <div className="mt-6 grid gap-2 lg:grid-cols-[1fr_22px_1fr_22px_1fr_22px_1fr] lg:items-center">
        {nodes.map((node, index) => (
          <div key={`${node}-${index}`} className="contents">
            <div className={`rounded-[9px] border p-4 text-center ${index === nodes.length - 1 ? labelStyles[outcomeTone] : "border-white/[0.08] bg-[#171a22] text-[#d4d7df]"}`}>
              <p className="text-[10px] font-bold uppercase tracking-[0.07em]">{node}</p>
            </div>
            {index < nodes.length - 1 ? <span className="flex h-4 items-center justify-center text-[#48544c] lg:h-auto" aria-hidden="true"><span className="lg:hidden">&darr;</span><span className="hidden lg:inline">&rarr;</span></span> : null}
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-[9px] border border-white/[0.08] bg-black/[0.08] p-4">
        <p className="text-[11px] leading-5 text-[#9ba59f]">
          {isPass && onchain.usable === false
            ? "The fixture result remains PASS, but the live certificate is currently unusable, so PolicyGate would reject a new action now. A historical allowed decision may still exist from when it was usable."
            : allowedNow
              ? "The PASS result and live usable certificate satisfy the read-only PolicyGate eligibility demonstration."
              : certificate.human.result === "INDETERMINATE"
                ? "INDETERMINATE does not satisfy the PASS requirement. The unusable certificate is rejected without creating a successful decision."
                : "Current PolicyGate eligibility cannot be confirmed because live certificate state is unavailable."}
        </p>
        <p className="mt-2 text-[9px] text-[#657169]">No blockchain write is attempted by this interface.</p>
      </div>
    </div>
  );
}

function DecisionLogStage({
  context,
  lookupState,
  onRequestLookup,
}: {
  context: DemoContext;
  lookupState: DecisionLookupState;
  onRequestLookup: () => void;
}) {
  const { onchain } = context;
  const decision = onchain.decision;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#747987]">Step 07 / DecisionLog</p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#f0f0f4]">Inspect the immutable decision outcome</h3>
        </div>
        <AuthenticityLabel tone={onchain.connected ? "live" : "warning"}>{onchain.connected ? "Live on-chain" : "RPC unavailable"}</AuthenticityLabel>
      </div>

      {decision !== null ? (
        <dl className="mt-5 grid overflow-hidden rounded-[9px] border border-white/[0.08] bg-[#171a22] sm:grid-cols-2 [&>div]:border-b [&>div]:sm:odd:border-r">
          <DataField label="Decision ID"><CopyValue value={decision.decisionId} label="Decision ID" /></DataField>
          <DataField label="Certificate"><CopyValue value={decision.certificateId} label="Decision certificate" /></DataField>
          <DataField label="Actor"><CopyValue value={decision.actor} label="Decision actor" /></DataField>
          <DataField label="Action Type"><CopyValue value={decision.actionType} label="Decision action type" /></DataField>
          <DataField label="Allowed"><span className={decision.allowed ? "text-[#36d17c]" : "text-[#ff6b6b]"}>{decision.allowed ? "Yes" : "No"}</span></DataField>
          <DataField label="Timestamp">{formatUnixTime(decision.timestamp)} UTC</DataField>
          <DataField label="Transaction" wide>
            <CopyValue value={decision.transactionHash} label="Decision transaction" href={`${XLAYER_TESTNET.explorerUrl}/tx/${decision.transactionHash}`} />
          </DataField>
        </dl>
      ) : lookupState === "loading" ? (
        <div className="mt-5 rounded-[10px] border border-[#8b7ce7]/20 bg-[#8b7ce7]/[0.045] p-6" aria-live="polite">
          <AuthenticityLabel tone="live">RPC loading</AuthenticityLabel>
          <h4 className="mt-3 text-base font-semibold text-[#f0f0f4]">Checking historical DecisionRecorded events</h4>
          <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[#9da2ae]">The public X Layer RPC limits event ranges, so the bounded lookup may take a moment.</p>
        </div>
      ) : onchain.decisionLookupComplete ? (
        <div className="mt-5 rounded-[10px] border border-white/[0.08] bg-[#171a22] p-6">
          <AuthenticityLabel tone="neutral">No decision record</AuthenticityLabel>
          <h4 className="mt-3 text-base font-semibold text-[#f0f0f4]">No DecisionLog record exists for this attempted action.</h4>
          <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[#9da2ae]">
            Rejected PolicyGate calls revert and therefore do not create successful DecisionRecorded entries. This frontend did not submit a new action.
          </p>
        </div>
      ) : lookupState === "idle" ? (
        <div className="mt-5 rounded-[10px] border border-white/[0.08] bg-[#171a22] p-6">
          <AuthenticityLabel tone="neutral">Lookup not started</AuthenticityLabel>
          <h4 className="mt-3 text-base font-semibold text-[#f0f0f4]">Check for a matching DecisionLog record</h4>
          <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[#9da2ae]">Certificate and PolicyGate state are already live. Historical events are queried only when requested so the initial dashboard remains responsive.</p>
          <button
            type="button"
            onClick={onRequestLookup}
            className="surface-transition mt-4 rounded-[7px] border border-[#8b7ce7]/30 bg-[#8b7ce7]/[0.08] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] text-[#b8aff3] hover:bg-[#8b7ce7]/[0.13]"
          >
            Check DecisionLog
          </button>
        </div>
      ) : (
        <div className="mt-5 rounded-[10px] border border-[#e9b949]/20 bg-[#e9b949]/[0.045] p-6">
          <AuthenticityLabel tone="warning">DecisionLog unavailable</AuthenticityLabel>
          <h4 className="mt-3 text-base font-semibold text-[#f0f0f4]">A matching decision could not be confirmed</h4>
          <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[#9da2ae]">
            The RPC did not complete the historical event lookup. No decision state is inferred from the missing response.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-4 text-[9px] text-[#858a97]">
        <span>DecisionLog total: <strong className="font-mono text-[#d4d7df]">{onchain.decisionCount ?? "Unavailable"}</strong></span>
        <span>Executed actions: <strong className="font-mono text-[#d4d7df]">{onchain.executedActionCount ?? "Unavailable"}</strong></span>
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
  if (stage === 0) return <AssetStage certificate={context.certificate} />;
  if (stage === 1) return <EvidenceStage certificate={context.certificate} />;
  if (stage === 2) return <VerificationStage context={context} />;
  if (stage === 3) return <CertificateStage context={context} />;
  if (stage === 4) return <XLayerStage context={context} />;
  if (stage === 5) return <PolicyGateStage context={context} />;
  return <DecisionLogStage context={context} lookupState={decisionLookupState} onRequestLookup={onRequestDecisionLookup} />;
}

function DemoIntro() {
  return (
    <div className="demo-stage-panel grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
      <div>
        <AuthenticityLabel tone="neutral">Read-only USDY demonstration</AuthenticityLabel>
        <h3 className="mt-4 max-w-2xl text-2xl font-semibold tracking-[-0.04em] text-[#f5f4f8] sm:text-3xl">Evidence to PolicyGate decision</h3>
        <p className="mt-3 max-w-2xl text-[12px] leading-5 text-[#9da2ae]">
          ProofLayer turns USDY Treasury backing evidence into a deterministic evidence commitment, resolves provenance roots, checks the live X Layer certificate pathway, and reaches a read-only PolicyGate decision.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href="#demo"
            className="inline-flex items-center justify-center rounded-[7px] border border-[#a594ff]/55 bg-[#7764dc] px-4 py-2.5 text-[9px] font-bold uppercase tracking-[0.11em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] transition hover:bg-[#8271e7]"
          >
            RUN PROOFLAYER DEMO
          </a>
          <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-[0.11em] text-[#818a92]">
            Evidence → Provenance → Verification → Certificate → PolicyGate → Decision
          </span>
        </div>
      </div>
      <div className="rounded-[10px] border border-[#8b7ce7]/20 bg-[#8b7ce7]/[0.045] p-4">
        <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#9f95eb]">Primary flow</p>
        <div className="mt-3 space-y-2 text-[10px] font-medium text-[#b8c0bb]">
          <p>USDY claim context</p>
          <p>Evidence commitment fingerprint</p>
          <p>Trusted provenance and live certificate status</p>
          <p>PolicyGate eligibility + DecisionLog review</p>
        </div>
      </div>
    </div>
  );
}

export function ProofLayerDemo({ pass, indeterminate }: ProofLayerDemoProps) {
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
    <section id="demo" className="scroll-mt-[76px] overflow-hidden rounded-[10px] border border-[#8f7df0]/30 bg-[#111319]" aria-labelledby="demo-heading">
      <div className="border-b border-white/[0.09] bg-[linear-gradient(110deg,rgba(143,125,240,0.12),transparent_62%)] px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#b6abfa]">Interactive ProofLayer Demo</p>
          <AuthenticityLabel tone="neutral">Read only</AuthenticityLabel>
        </div>

        <p className="mt-3 font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-[#8f94a1]">
          Verification <span className="px-1 text-[#625a8f]" aria-hidden="true">&rarr;</span> Certificate <span className="px-1 text-[#625a8f]" aria-hidden="true">&rarr;</span> Registry <span className="px-1 text-[#625a8f]" aria-hidden="true">&rarr;</span> Policy <span className="px-1 text-[#625a8f]" aria-hidden="true">&rarr;</span> Decision
        </p>

        <div className="mt-5 grid gap-4 border-t border-white/[0.08] pt-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-5">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#7f8491]">Workflow input</p>
              <h2 id="demo-heading" className="mt-1 text-xl font-semibold tracking-[-0.035em] text-[#f5f4f8]">Verification scenario</h2>
            </div>

            <div className="inline-grid w-fit max-w-full grid-cols-[auto_auto] rounded-[7px] border border-white/[0.1] bg-[#0b0c10]/70 p-1" aria-label="Demo scenario">
              <button
                type="button"
                aria-pressed={scenario === "pass"}
                onClick={() => selectScenario("pass")}
                className={`surface-transition whitespace-nowrap rounded-[5px] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] ${scenario === "pass" ? "bg-[#36d17c]/10 text-[#36d17c] shadow-[inset_0_0_0_1px_rgba(54,209,124,0.08)]" : "text-[#858a97] hover:text-[#c2c5cd]"}`}
              >
                PASS
              </button>
              <button
                type="button"
                aria-pressed={scenario === "indeterminate"}
                onClick={() => selectScenario("indeterminate")}
                className={`surface-transition whitespace-nowrap rounded-[5px] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.075em] ${scenario === "indeterminate" ? "bg-[#e9b949]/10 text-[#e9b949] shadow-[inset_0_0_0_1px_rgba(233,185,73,0.08)]" : "text-[#858a97] hover:text-[#c2c5cd]"}`}
              >
                INDETERMINATE
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={runDemo}
            className="surface-transition inline-flex min-h-11 w-full items-center justify-center gap-3 whitespace-nowrap rounded-[7px] border border-[#a594ff]/55 bg-[#7764dc] px-5 text-[10px] font-bold uppercase tracking-[0.075em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_18px_rgba(119,100,220,0.12)] hover:border-[#b7aaff]/75 hover:bg-[#826fe7] sm:w-fit lg:justify-self-end"
          >
            RUN PROOFLAYER DEMO
            <span aria-hidden="true">&rarr;</span>
          </button>
        </div>
      </div>

      {started ? (
        <>
          <div className="border-b border-white/[0.08] bg-black/[0.06] px-4 py-4 sm:px-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" aria-label="Demo stages">
              {stages.map((stage, index) => {
                const isActive = index === activeStage;
                const isComplete = index < activeStage;
                return (
                  <button
                    key={stage.label}
                    type="button"
                    aria-current={isActive ? "step" : undefined}
                    onClick={() => goToStage(index)}
                    className={`surface-transition min-w-0 rounded-[7px] border p-2.5 text-left ${isActive ? "border-[#8b7ce7]/35 bg-[#8b7ce7]/[0.08]" : "border-white/[0.07] bg-white/[0.012] hover:border-white/[0.14]"}`}
                  >
                    <span className={`text-[8px] font-bold uppercase tracking-[0.09em] ${isActive ? "text-[#b8aff3]" : isComplete ? "text-[#36d17c]" : "text-[#676c78]"}`}>Step {String(index + 1).padStart(2, "0")}</span>
                    <span className="mt-1 block truncate text-[10px] font-semibold text-[#d4d7df]">{stage.shortLabel}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 h-px overflow-hidden bg-white/[0.06]">
              <div className="demo-progress h-full bg-[#8b7ce7]" style={{ width: `${progress}%` }} />
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

          <div className="flex flex-col gap-3 border-t border-white/[0.08] bg-black/[0.08] px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-[9px] text-[#747987]">{scenario === "pass" ? "PASS fixture selected" : "INDETERMINATE fixture selected"} / Stage {activeStage + 1} of {stages.length}</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={activeStage === 0}
                onClick={() => goToStage(Math.max(0, activeStage - 1))}
                className="surface-transition rounded-[7px] border border-white/[0.09] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] text-[#b1b5bf] hover:border-white/[0.16] disabled:cursor-not-allowed disabled:opacity-35"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={activeStage === stages.length - 1}
                onClick={() => goToStage(Math.min(stages.length - 1, activeStage + 1))}
                className="surface-transition rounded-[7px] border border-[#8b7ce7]/30 bg-[#8b7ce7]/[0.08] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] text-[#b8aff3] hover:bg-[#8b7ce7]/[0.13] disabled:cursor-not-allowed disabled:opacity-35"
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
