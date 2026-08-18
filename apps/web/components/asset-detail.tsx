import Image from "next/image";
import Link from "next/link";

import { AssetAuthenticityLabel } from "@/components/asset-authenticity-label";
import { CopyValue } from "@/components/copy-value";
import { Icon } from "@/components/icons";
import type { ProofLayerAsset } from "@/lib/assets";
import { PROOFLAYER_CONTRACTS, XLAYER_TESTNET } from "@/lib/contracts";
import type { DemoCertificate } from "@/lib/demo-data";
import type { OnchainDashboardData } from "@/lib/onchain";
import {
  buildTruthPresentation,
  type CurrentVerificationTruth,
} from "@/lib/truth-presentation";

type AssetDetailProps = {
  asset: ProofLayerAsset;
  certificate: DemoCertificate | null;
  onchain: OnchainDashboardData | null;
  certificateStatus: string | null;
  currentVerification: CurrentVerificationTruth | null;
};

function formatIsoTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatUnixTime(value: number): string {
  return formatIsoTime(new Date(value * 1_000).toISOString());
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="border-b border-edge px-5 py-4 sm:px-6">
      <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-tertiary">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-brand-bright">
        {title}
      </h2>
      {description === undefined ? null : (
        <p className="mt-1.5 max-w-3xl text-[11px] leading-4 text-tertiary">
          {description}
        </p>
      )}
    </div>
  );
}

function UnsupportedVerification({ asset }: { asset: ProofLayerAsset }) {
  return (
    <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_250px]">
      <div>
        <AssetAuthenticityLabel label="UNVERIFIED" tone="warning" />
        <p className="mt-4 text-[15px] font-semibold text-primary">
          No ProofLayer verification fixture exists for this asset yet.
        </p>
        <p className="mt-2 max-w-2xl text-[11px] leading-5 text-secondary">
          {asset.supportSummary}. No result, proof, issuer, or evidence root is inferred
          from the contextual asset description.
        </p>
      </div>
      <div className="rounded-[9px] border border-warning/20 bg-warning/[0.045] p-4">
        <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-warning">
          Support state
        </p>
        <p className="mt-2 text-[12px] font-semibold text-warning">
          Verification support not yet enabled
        </p>
      </div>
    </div>
  );
}

function ExpectedEvidence({ asset }: { asset: ProofLayerAsset }) {
  return (
    <div className="p-5 sm:p-6">
      <AssetAuthenticityLabel label="EXPECTED EVIDENCE MODEL" tone="neutral" />
      <p className="mt-3 max-w-3xl text-[11px] leading-5 text-secondary">
        These are conceptual categories ProofLayer could require before evaluating this
        claim. They are not evidence collected from, or associated with, the facility or
        asset shown.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {asset.expectedEvidence.map((item, index) => (
          <div
            key={item}
            className="flex items-center gap-3 rounded-[8px] border border-edge bg-overlay-active p-3"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-[6px] border border-edge font-mono text-[9px] text-brand">
              {String(index + 1).padStart(2, "0")}
            </span>
            <p className="text-[10px] leading-4 text-primary">{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActualEvidence({ certificate }: { certificate: DemoCertificate }) {
  const fields = [
    { label: "Evidence model", value: "Normalized fixture evidence" },
    {
      label: "Independent roots",
      value: certificate.human.independent_root_count.toString(),
    },
    { label: "Observed at", value: `${formatIsoTime(certificate.human.observed_at)} UTC` },
    { label: "Compiler", value: certificate.human.compiler_version },
  ];

  return (
    <div className="p-5 sm:p-6">
      <div className="flex flex-wrap gap-1.5">
        <AssetAuthenticityLabel label="FIXTURE EVIDENCE" tone="fixture" />
        <AssetAuthenticityLabel label="PROVENANCE COMMITTED" tone="success" />
      </div>
      <p className="mt-3 max-w-3xl text-[11px] leading-5 text-secondary">
        The existing USDY fixture preserves normalized provenance and resolves its
        independent inputs into the deterministic evidence commitment below.
      </p>
      <div className="mt-4 rounded-[9px] border border-edge bg-overlay-active p-4">
        <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">
          Evidence root
        </p>
        <div className="mt-2">
          <CopyValue value={certificate.solidity.evidenceRoot} label="Evidence root" />
        </div>
      </div>
      <dl className="mt-3 grid overflow-hidden rounded-[9px] border border-edge sm:grid-cols-2 lg:grid-cols-4">
        {fields.map((field) => (
          <div
            key={field.label}
            className="border-b border-edge p-3 last:border-b-0 sm:border-r sm:[&:nth-child(n+3)]:border-b-0"
          >
            <dt className="text-[8px] font-semibold uppercase tracking-[0.09em] text-tertiary">
              {field.label}
            </dt>
            <dd className="mt-1.5 text-[10px] font-medium text-primary">{field.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CertificateSection({
  certificate,
  onchain,
  certificateStatus,
}: {
  certificate: DemoCertificate | null;
  onchain: OnchainDashboardData | null;
  certificateStatus: string | null;
}) {
  if (certificate === null) {
    return (
      <div className="p-5 sm:p-6">
        <AssetAuthenticityLabel label="NO CERTIFICATE" tone="neutral" />
        <p className="mt-4 text-[14px] font-semibold text-primary">
          No ProofLayer certificate has been issued for this asset.
        </p>
      </div>
    );
  }

  const registryUrl = `${XLAYER_TESTNET.explorerUrl}/address/${PROOFLAYER_CONTRACTS.registry}`;

  return (
    <div className="grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <div className="border-b border-edge bg-overlay-active p-5 sm:p-6 lg:border-b-0 lg:border-r">
        <span className="grid size-10 place-items-center rounded-[8px] border border-edge bg-overlay-hover text-secondary">
          <Icon name="certificate" className="size-5" />
        </span>
        <p className="mt-4 text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">
          Historical certificate result
        </p>
        <p className="mt-1 text-2xl font-semibold text-primary">{certificate.human.result}</p>
        <p className="mt-1 text-[10px] text-tertiary">
          Current certificate status: {certificateStatus ?? "Unavailable"}
        </p>
      </div>
      <div className="p-5 sm:p-6">
        <div>
          <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">
            Certificate ID
          </p>
          <div className="mt-2">
            <CopyValue value={certificate.solidity.certificateId} label="Certificate ID" />
          </div>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-[8px] uppercase tracking-[0.09em] text-tertiary">Registered</dt>
            <dd className="mt-1 text-[10px] font-semibold text-primary">
              {onchain?.registered === null || onchain === null
                ? "Unavailable"
                : onchain.registered
                  ? "Yes"
                  : "No"}
            </dd>
          </div>
          <div>
            <dt className="text-[8px] uppercase tracking-[0.09em] text-tertiary">Usable now</dt>
            <dd className="mt-1 text-[10px] font-semibold text-primary">
              {onchain?.usable === null || onchain === null
                ? "Unavailable"
                : onchain.usable
                  ? "Yes"
                  : "No"}
            </dd>
          </div>
          <div>
            <dt className="text-[8px] uppercase tracking-[0.09em] text-tertiary">Valid until</dt>
            <dd className="mt-1 text-[10px] font-semibold text-primary">
              {formatIsoTime(certificate.human.valid_until)} UTC
            </dd>
          </div>
        </dl>
        <a
          href={registryUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex text-[10px] font-semibold text-accent hover:text-brand-bright"
        >
          Inspect Registry on X Layer &nearr;
        </a>
      </div>
    </div>
  );
}

function OnchainActivity({ onchain }: { onchain: OnchainDashboardData | null }) {
  if (onchain === null) {
    return (
      <div className="p-5 sm:p-6">
        <AssetAuthenticityLabel label="NO LIVE ACTIVITY" tone="neutral" />
        <p className="mt-4 text-[14px] font-semibold text-primary">
          No live ProofLayer on-chain activity for this asset.
        </p>
      </div>
    );
  }

  return (
    <div className="p-5 sm:p-6">
      {onchain.error === null ? (
        <div className="flex flex-wrap gap-1.5">
          <AssetAuthenticityLabel label="LIVE ON-CHAIN" tone="live" />
          <AssetAuthenticityLabel label="READ ONLY" tone="neutral" />
        </div>
      ) : (
        <AssetAuthenticityLabel label="RPC UNAVAILABLE" tone="warning" />
      )}

      {onchain.error === null ? (
        <>
          <dl className="mt-4 grid overflow-hidden rounded-[9px] border border-edge grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Network", value: XLAYER_TESTNET.name },
              { label: "Chain ID", value: onchain.chainId?.toString() ?? "--" },
              {
                label: "Latest block",
                value: onchain.latestBlock?.toLocaleString("en-GB") ?? "--",
              },
              { label: "Decision count", value: onchain.decisionCount ?? "--" },
            ].map((field) => (
              <div key={field.label} className="border-b border-r border-edge p-3">
                <dt className="text-[8px] font-semibold uppercase tracking-[0.09em] text-tertiary">
                  {field.label}
                </dt>
                <dd className="mt-1.5 font-mono text-[10px] font-medium text-primary">
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 rounded-[9px] border border-edge bg-overlay-active p-4">
            <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">
              DecisionLog information
            </p>
            {onchain.decision !== null ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:items-center">
                <AssetAuthenticityLabel
                  label={onchain.decision.allowed ? "ALLOWED" : "DENIED"}
                  tone={onchain.decision.allowed ? "success" : "warning"}
                />
                <div className="min-w-0">
                  <CopyValue value={onchain.decision.decisionId} label="Decision ID" />
                  <p className="mt-1 text-[9px] text-secondary">
                    {formatUnixTime(onchain.decision.timestamp)} UTC
                  </p>
                </div>
                <a
                  href={`${XLAYER_TESTNET.explorerUrl}/tx/${onchain.decision.transactionHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] font-semibold text-accent hover:text-brand-bright"
                >
                  Inspect transaction &nearr;
                </a>
              </div>
            ) : onchain.decisionLookupComplete ? (
              <p className="mt-2 text-[10px] text-secondary">
                No matching DecisionLog entry was found in the bounded deployment history.
              </p>
            ) : (
              <div className="mt-2">
                <p className="text-[10px] text-secondary">
                  Historical DecisionLog lookup is deferred so this page does not block on a
                  public RPC log scan. The live total count above is current; no individual
                  decision state is inferred here.
                </p>
                <Link
                  href="/#verify"
                  className="mt-2 inline-flex text-[10px] font-semibold text-accent hover:text-brand-bright"
                >
                  Run the bounded lookup in the verification workflow &rarr;
                </Link>
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="mt-3 text-[11px] leading-5 text-warning">
          Live X Layer reads are currently unavailable: {onchain.error}. Fixture data remains
          visible, but no current chain state is inferred.
        </p>
      )}
    </div>
  );
}

export function AssetDetail({
  asset,
  certificate,
  onchain,
  certificateStatus,
  currentVerification,
}: AssetDetailProps) {
  const hasVerification = certificate !== null;
  const truth = buildTruthPresentation({
    currentVerification,
    historicalCertificateResult: certificate?.human.result ?? null,
    certificateStatus,
    currentCertificateUsable: onchain?.usable ?? null,
  });

  return (
    <>
      <Link
        href="/assets"
        className="mb-3 inline-flex items-center gap-2 text-[10px] font-semibold text-secondary hover:text-primary"
      >
        <span aria-hidden="true">&larr;</span> Asset Explorer
      </Link>

      <section className="relative min-h-[420px] overflow-hidden rounded-[10px] border border-edge bg-surface sm:min-h-[460px]">
        {asset.image === null ? (
          <div className="asset-showcase-placeholder absolute inset-0 grid place-items-center" aria-hidden="true">
            <div className="grid size-28 place-items-center rounded-[16px] border border-edge bg-scrim text-tertiary">
              <Icon name="overview" className="size-11" />
            </div>
          </div>
        ) : (
          <Image
            src={asset.image.src}
            alt={asset.image.alt}
            fill
            priority
            sizes="(max-width: 1023px) 100vw, 1100px"
            className={`asset-detail-photo object-cover ${
              asset.image.treatment === "gold"
                ? "asset-showcase-photo-gold"
                : asset.image.treatment === "grain"
                  ? "asset-showcase-photo-grain"
                  : ""
            }`}
            style={{ objectPosition: asset.image.position ?? "center" }}
          />
        )}
        <div className="asset-detail-shade absolute inset-0" aria-hidden="true" />
        <div className="asset-showcase-grid absolute inset-0" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 z-10 p-5 sm:p-7 lg:p-9">
          <div className="flex flex-wrap gap-1.5">
            {asset.authenticityLabels.map((item) => (
              <AssetAuthenticityLabel key={item.label} {...item} />
            ))}
            {certificate === null ? null : (
              <AssetAuthenticityLabel label={`HISTORICAL ${certificate.human.result}`} tone="fixture" />
            )}
            {certificateStatus === null ? null : (
              <AssetAuthenticityLabel
                label={certificateStatus.toUpperCase()}
                tone={certificateStatus === "Active" ? "success" : "warning"}
              />
            )}
          </div>
          <p className="mt-4 text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">
            {asset.eyebrow}
          </p>
          <h1 className="mt-1.5 max-w-3xl text-[38px] font-semibold leading-none tracking-[-0.05em] text-primary sm:text-[48px]">
            {asset.name}
          </h1>
          <p className="mt-2 text-[13px] font-medium text-success">{asset.claim}</p>
        </div>
      </section>

      <div className="mt-4 space-y-4">
        <section className="overflow-hidden rounded-[10px] border border-edge bg-surface">
          <SectionHeading eyebrow="Asset overview" title="Verification coverage" />
          <dl className="grid sm:grid-cols-3">
            {[
              { label: "Asset class", value: asset.assetClass },
              { label: "Primary claim", value: asset.claim },
              { label: "ProofLayer support", value: asset.supportSummary },
            ].map((field) => (
              <div key={field.label} className="border-b border-edge p-5 sm:border-b-0 sm:border-r sm:last:border-r-0">
                <dt className="text-[8px] font-semibold uppercase tracking-[0.09em] text-tertiary">
                  {field.label}
                </dt>
                <dd className="mt-2 text-[11px] font-medium leading-4 text-primary">{field.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="overflow-hidden rounded-[10px] border border-edge bg-surface">
          <SectionHeading
            eyebrow="Verification"
            title="Verification truth"
            description="Current RVC result, historical certificate result, and current certificate usability are separate facts."
          />
          {hasVerification && certificate !== null ? (
            <div className="grid gap-3 p-5 sm:p-6 lg:grid-cols-3">
              <div className={`rounded-[9px] border p-5 ${truth.currentRvcResult === "FAIL" ? "border-fail/25 bg-fail/[0.05]" : truth.currentRvcResult === "PASS" ? "border-success/20 bg-success-soft/[0.05]" : "border-warning/20 bg-warning/[0.045]"}`}>
                <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">Current RVC result</p>
                <p className={`mt-3 text-2xl font-semibold ${truth.currentRvcResult === "FAIL" ? "text-fail" : truth.currentRvcResult === "PASS" ? "text-success" : "text-warning"}`}>{truth.currentRvcResult}</p>
                <p className="mt-2 text-[10px] leading-4 text-secondary">{truth.currentRvcReasons.join(" · ") || "No current reason codes available."}</p>
              </div>
              <div className="rounded-[9px] border border-edge bg-overlay-active p-5">
                <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">Historical certificate result</p>
                <p className="mt-3 text-2xl font-semibold text-primary">{truth.historicalCertificateResult}</p>
                <p className="mt-2 text-[10px] leading-4 text-secondary">Immutable result recorded by the exported certificate fixture.</p>
              </div>
              <div className="rounded-[9px] border border-warning/20 bg-warning/[0.045] p-5">
                <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">Current certificate usability</p>
                <p className="mt-3 text-lg font-semibold text-warning">{truth.currentCertificateUsability}</p>
                <p className="mt-2 text-[10px] leading-4 text-secondary">Current Registry state; this does not change the historical result.</p>
              </div>
            </div>
          ) : (
            <UnsupportedVerification asset={asset} />
          )}
        </section>

        <section className="overflow-hidden rounded-[10px] border border-edge bg-surface">
          <SectionHeading
            eyebrow="Evidence"
            title={hasVerification ? "Evidence & provenance" : "Expected evidence model"}
          />
          {certificate === null ? <ExpectedEvidence asset={asset} /> : <ActualEvidence certificate={certificate} />}
        </section>

        <section id="certificate-record" className="scroll-mt-4 overflow-hidden rounded-[10px] border border-edge bg-surface">
          <SectionHeading eyebrow="Certificates" title="ProofLayer certificate state" />
          <CertificateSection
            certificate={certificate}
            onchain={onchain}
            certificateStatus={certificateStatus}
          />
        </section>

        <section className="overflow-hidden rounded-[10px] border border-edge bg-surface">
          <SectionHeading
            eyebrow="On-chain activity"
            title="X Layer enforcement state"
            description="Read-only contract data; this page never performs a blockchain write."
          />
          <OnchainActivity onchain={onchain} />
        </section>

        <section className="rounded-[10px] border border-edge bg-surface p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-tertiary">Next action</p>
              <p className="mt-1 text-[14px] font-semibold text-accent">
                {hasVerification
                  ? "Inspect the existing verification path"
                  : "Verification support not yet enabled"}
              </p>
            </div>
            {hasVerification ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href="/#verify"
                  className="surface-transition rounded-[8px] border border-brand/30 bg-brand/[0.1] px-4 py-2.5 text-center text-[11px] font-semibold text-accent hover:border-brand/50 hover:bg-brand/[0.15]"
                >
                  Inspect Current RVC
                </Link>
                <Link
                  href="#certificate-record"
                  className="surface-transition rounded-[8px] border border-edge bg-overlay-hover px-4 py-2.5 text-center text-[11px] font-semibold text-primary hover:border-edge"
                >
                  Inspect Certificate
                </Link>
              </div>
            ) : (
              <span
                aria-disabled="true"
                className="rounded-[8px] border border-edge bg-scrim px-4 py-2.5 text-center text-[10px] font-semibold text-success"
              >
                No runnable verification
              </span>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
