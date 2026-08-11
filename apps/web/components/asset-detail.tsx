import Image from "next/image";
import Link from "next/link";

import { AssetAuthenticityLabel } from "@/components/asset-authenticity-label";
import { CopyValue } from "@/components/copy-value";
import { Icon } from "@/components/icons";
import type { ProofLayerAsset } from "@/lib/assets";
import { PROOFLAYER_CONTRACTS, XLAYER_TESTNET } from "@/lib/contracts";
import type { DemoCertificate } from "@/lib/demo-data";
import type { OnchainDashboardData } from "@/lib/onchain";

type AssetDetailProps = {
  asset: ProofLayerAsset;
  certificate: DemoCertificate | null;
  onchain: OnchainDashboardData | null;
  certificateStatus: string | null;
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
    <div className="border-b border-white/[0.08] px-5 py-4 sm:px-6">
      <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#747987]">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[#f5f4f8]">
        {title}
      </h2>
      {description === undefined ? null : (
        <p className="mt-1.5 max-w-3xl text-[11px] leading-4 text-[#7d8981]">
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
        <p className="mt-4 text-[15px] font-semibold text-[#dfe5e1]">
          No ProofLayer verification fixture exists for this asset yet.
        </p>
        <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[#838f87]">
          {asset.supportSummary}. No result, proof, issuer, or evidence root is inferred
          from the contextual asset description.
        </p>
      </div>
      <div className="rounded-[9px] border border-[#e9b949]/20 bg-[#e9b949]/[0.045] p-4">
        <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#a88d49]">
          Support state
        </p>
        <p className="mt-2 text-[12px] font-semibold text-[#e0c36e]">
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
      <p className="mt-3 max-w-3xl text-[11px] leading-5 text-[#838f87]">
        These are conceptual categories ProofLayer could require before evaluating this
        claim. They are not evidence collected from, or associated with, the facility or
        asset shown.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {asset.expectedEvidence.map((item, index) => (
          <div
            key={item}
            className="flex items-center gap-3 rounded-[8px] border border-white/[0.07] bg-black/[0.08] p-3"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-[6px] border border-white/[0.08] font-mono text-[9px] text-[#8f84dd]">
              {String(index + 1).padStart(2, "0")}
            </span>
            <p className="text-[10px] leading-4 text-[#bdc6c0]">{item}</p>
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
        <AssetAuthenticityLabel label="DEMO FIXTURE EVIDENCE" tone="fixture" />
        <AssetAuthenticityLabel label="PROVENANCE COMMITTED" tone="success" />
      </div>
      <p className="mt-3 max-w-3xl text-[11px] leading-5 text-[#838f87]">
        The existing USDY demo fixture preserves normalized provenance and resolves its
        independent inputs into the deterministic evidence commitment below.
      </p>
      <div className="mt-4 rounded-[9px] border border-white/[0.08] bg-black/[0.09] p-4">
        <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#747987]">
          Evidence root
        </p>
        <div className="mt-2">
          <CopyValue value={certificate.solidity.evidenceRoot} label="Evidence root" />
        </div>
      </div>
      <dl className="mt-3 grid overflow-hidden rounded-[9px] border border-white/[0.08] sm:grid-cols-2 lg:grid-cols-4">
        {fields.map((field) => (
          <div
            key={field.label}
            className="border-b border-white/[0.07] p-3 last:border-b-0 sm:border-r sm:[&:nth-child(n+3)]:border-b-0"
          >
            <dt className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#747987]">
              {field.label}
            </dt>
            <dd className="mt-1.5 text-[10px] font-medium text-[#c5cdc8]">{field.value}</dd>
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
        <p className="mt-4 text-[14px] font-semibold text-[#d4dcd7]">
          No ProofLayer certificate has been issued for this asset.
        </p>
      </div>
    );
  }

  const registryUrl = `${XLAYER_TESTNET.explorerUrl}/address/${PROOFLAYER_CONTRACTS.registry}`;

  return (
    <div className="grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <div className="border-b border-white/[0.08] bg-black/[0.08] p-5 sm:p-6 lg:border-b-0 lg:border-r">
        <span className="grid size-10 place-items-center rounded-[8px] border border-[#36d17c]/20 bg-[#36d17c]/[0.06] text-[#36d17c]">
          <Icon name="certificate" className="size-5" />
        </span>
        <p className="mt-4 text-[8px] font-semibold uppercase tracking-[0.1em] text-[#747987]">
          Deterministic result
        </p>
        <p className="mt-1 text-2xl font-semibold text-[#36d17c]">{certificate.human.result}</p>
        <p className="mt-1 text-[10px] text-[#7f8a83]">
          Current certificate status: {certificateStatus ?? "Unavailable"}
        </p>
      </div>
      <div className="p-5 sm:p-6">
        <div>
          <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#747987]">
            Certificate ID
          </p>
          <div className="mt-2">
            <CopyValue value={certificate.solidity.certificateId} label="Certificate ID" />
          </div>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-[8px] uppercase tracking-[0.09em] text-[#747987]">Registered</dt>
            <dd className="mt-1 text-[10px] font-semibold text-[#c6cec9]">
              {onchain?.registered === null || onchain === null
                ? "Unavailable"
                : onchain.registered
                  ? "Yes"
                  : "No"}
            </dd>
          </div>
          <div>
            <dt className="text-[8px] uppercase tracking-[0.09em] text-[#747987]">Usable now</dt>
            <dd className="mt-1 text-[10px] font-semibold text-[#c6cec9]">
              {onchain?.usable === null || onchain === null
                ? "Unavailable"
                : onchain.usable
                  ? "Yes"
                  : "No"}
            </dd>
          </div>
          <div>
            <dt className="text-[8px] uppercase tracking-[0.09em] text-[#747987]">Valid until</dt>
            <dd className="mt-1 text-[10px] font-semibold text-[#c6cec9]">
              {formatIsoTime(certificate.human.valid_until)} UTC
            </dd>
          </div>
        </dl>
        <a
          href={registryUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex text-[10px] font-semibold text-[#a99fee] hover:text-[#c5bef5]"
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
        <p className="mt-4 text-[14px] font-semibold text-[#d4dcd7]">
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
          <dl className="mt-4 grid overflow-hidden rounded-[9px] border border-white/[0.08] grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Network", value: XLAYER_TESTNET.name },
              { label: "Chain ID", value: onchain.chainId?.toString() ?? "--" },
              {
                label: "Latest block",
                value: onchain.latestBlock?.toLocaleString("en-GB") ?? "--",
              },
              { label: "Decision count", value: onchain.decisionCount ?? "--" },
            ].map((field) => (
              <div key={field.label} className="border-b border-r border-white/[0.07] p-3">
                <dt className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#747987]">
                  {field.label}
                </dt>
                <dd className="mt-1.5 font-mono text-[10px] font-medium text-[#c5cdc8]">
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 rounded-[9px] border border-white/[0.08] bg-black/[0.08] p-4">
            <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#747987]">
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
                  <p className="mt-1 text-[9px] text-[#858a97]">
                    {formatUnixTime(onchain.decision.timestamp)} UTC
                  </p>
                </div>
                <a
                  href={`${XLAYER_TESTNET.explorerUrl}/tx/${onchain.decision.transactionHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] font-semibold text-[#a99fee] hover:text-[#c5bef5]"
                >
                  Inspect transaction &nearr;
                </a>
              </div>
            ) : onchain.decisionLookupComplete ? (
              <p className="mt-2 text-[10px] text-[#9da2ae]">
                No matching DecisionLog entry was found in the bounded deployment history.
              </p>
            ) : (
              <div className="mt-2">
                <p className="text-[10px] text-[#9da2ae]">
                  Historical DecisionLog lookup is deferred so this page does not block on a
                  public RPC log scan. The live total count above is current; no individual
                  decision state is inferred here.
                </p>
                <Link
                  href="/#demo"
                  className="mt-2 inline-flex text-[10px] font-semibold text-[#a99fee] hover:text-[#c5bef5]"
                >
                  Run the bounded lookup in Demo Stage 07 &rarr;
                </Link>
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="mt-3 text-[11px] leading-5 text-[#b89b54]">
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
}: AssetDetailProps) {
  const hasVerification = certificate !== null;

  return (
    <>
      <Link
        href="/assets"
        className="mb-3 inline-flex items-center gap-2 text-[10px] font-semibold text-[#9da2ae] hover:text-[#d6ddd8]"
      >
        <span aria-hidden="true">&larr;</span> Asset Explorer
      </Link>

      <section className="relative min-h-[420px] overflow-hidden rounded-[10px] border border-white/[0.09] bg-[#111319] sm:min-h-[460px]">
        {asset.image === null ? (
          <div className="asset-showcase-placeholder absolute inset-0 grid place-items-center" aria-hidden="true">
            <div className="grid size-28 place-items-center rounded-[16px] border border-white/[0.08] bg-black/15 text-[#747987]">
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
              <AssetAuthenticityLabel label={certificate.human.result} tone="success" />
            )}
            {certificateStatus === null ? null : (
              <AssetAuthenticityLabel
                label={certificateStatus.toUpperCase()}
                tone={certificateStatus === "Active" ? "success" : "warning"}
              />
            )}
          </div>
          <p className="mt-4 text-[9px] font-semibold uppercase tracking-[0.13em] text-[#9ba59f]">
            {asset.eyebrow}
          </p>
          <h1 className="mt-1.5 max-w-3xl text-[38px] font-semibold leading-none tracking-[-0.05em] text-[#f4f6f5] sm:text-[48px]">
            {asset.name}
          </h1>
          <p className="mt-2 text-[13px] font-medium text-[#c3cbc6]">{asset.claim}</p>
        </div>
      </section>

      <div className="mt-4 space-y-4">
        <section className="overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#111319]">
          <SectionHeading eyebrow="Asset overview" title="Verification coverage" />
          <dl className="grid sm:grid-cols-3">
            {[
              { label: "Asset class", value: asset.assetClass },
              { label: "Primary claim", value: asset.claim },
              { label: "ProofLayer support", value: asset.supportSummary },
            ].map((field) => (
              <div key={field.label} className="border-b border-white/[0.07] p-5 sm:border-b-0 sm:border-r sm:last:border-r-0">
                <dt className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#747987]">
                  {field.label}
                </dt>
                <dd className="mt-2 text-[11px] font-medium leading-4 text-[#c4ccc7]">{field.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#111319]">
          <SectionHeading
            eyebrow="Verification"
            title="Deterministic claim result"
            description="Fixture result and current certificate usability are shown separately."
          />
          {hasVerification && certificate !== null ? (
            <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="rounded-[9px] border border-[#36d17c]/20 bg-[#36d17c]/[0.05] p-5">
                <AssetAuthenticityLabel label="VERIFIED FIXTURE" tone="success" />
                <p className="mt-4 text-3xl font-semibold text-[#36d17c]">{certificate.human.result}</p>
                <p className="mt-2 text-[10px] leading-4 text-[#90a098]">
                  Claim satisfied under the fixture&apos;s encoded Treasury-backing policy.
                </p>
              </div>
              <div className="p-1 lg:p-3">
                <p className="text-[12px] font-semibold text-[#dbe1dd]">
                  Result and current enforcement state are not the same thing.
                </p>
                <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[#838f87]">
                  The exported fixture result is PASS. The live certificate is independently
                  read from X Layer and is currently {certificateStatus?.toLocaleLowerCase() ?? "unavailable"};
                  current usability is {onchain?.usable === null || onchain === null ? "unavailable" : onchain.usable ? "true" : "false"}.
                </p>
              </div>
            </div>
          ) : (
            <UnsupportedVerification asset={asset} />
          )}
        </section>

        <section className="overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#111319]">
          <SectionHeading
            eyebrow="Evidence"
            title={hasVerification ? "Evidence & provenance" : "Expected evidence model"}
          />
          {certificate === null ? <ExpectedEvidence asset={asset} /> : <ActualEvidence certificate={certificate} />}
        </section>

        <section id="certificate-record" className="scroll-mt-4 overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#111319]">
          <SectionHeading eyebrow="Certificates" title="ProofLayer certificate state" />
          <CertificateSection
            certificate={certificate}
            onchain={onchain}
            certificateStatus={certificateStatus}
          />
        </section>

        <section className="overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#111319]">
          <SectionHeading
            eyebrow="On-chain activity"
            title="X Layer enforcement state"
            description="Read-only contract data; this page never performs a blockchain write."
          />
          <OnchainActivity onchain={onchain} />
        </section>

        <section className="rounded-[10px] border border-white/[0.08] bg-[#111319] p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#747987]">Next action</p>
              <p className="mt-1 text-[14px] font-semibold text-[#e5e7ec]">
                {hasVerification
                  ? "Inspect the existing ProofLayer demo path"
                  : "Verification support not yet enabled"}
              </p>
            </div>
            {hasVerification ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href="/#demo"
                  className="surface-transition rounded-[8px] border border-[#8b7ce7]/30 bg-[#8b7ce7]/[0.1] px-4 py-2.5 text-center text-[11px] font-semibold text-[#c1b9f4] hover:border-[#8b7ce7]/50 hover:bg-[#8b7ce7]/[0.15]"
                >
                  Run Verification Demo
                </Link>
                <Link
                  href="#certificate-record"
                  className="surface-transition rounded-[8px] border border-white/[0.1] bg-white/[0.025] px-4 py-2.5 text-center text-[11px] font-semibold text-[#c8d0cb] hover:border-white/[0.17]"
                >
                  Inspect Certificate
                </Link>
              </div>
            ) : (
              <span
                aria-disabled="true"
                className="rounded-[8px] border border-white/[0.08] bg-black/15 px-4 py-2.5 text-center text-[10px] font-semibold text-[#626d66]"
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
