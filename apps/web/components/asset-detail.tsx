import Link from "next/link";

import { AssetAuthenticityLabel } from "@/components/asset-authenticity-label";
import { CopyValue } from "@/components/copy-value";
import { Icon } from "@/components/icons";
import {
  type ApiAssetDetail,
  assetAuthenticityLabels,
} from "@/lib/assets-api";
import { XLAYER_MAINNET } from "@/lib/contracts";

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

function VerificationDepthCard({
  label,
  verified,
  description,
}: {
  label: string;
  verified: boolean;
  description: string;
}) {
  return (
    <div
      className={`rounded-[9px] border p-5 ${
        verified
          ? "border-success/20 bg-success-soft/[0.05]"
          : "border-warning/20 bg-warning/[0.045]"
      }`}
    >
      <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">
        {label}
      </p>
      <p
        className={`mt-3 text-2xl font-semibold ${
          verified ? "text-success" : "text-warning"
        }`}
      >
        {verified ? "VERIFIED" : "NOT VERIFIED"}
      </p>
      <p className="mt-2 text-[10px] leading-4 text-secondary">{description}</p>
    </div>
  );
}

function FrameworkEvidenceSection({
  evidence,
}: {
  evidence: Record<string, unknown>;
}) {
  const issuer = evidence.issuer as Record<string, string> | undefined;
  const backing = evidence.backing_model as Record<string, string> | undefined;
  const deployment = evidence.deployment_model as Record<string, string> | undefined;
  const limitations = evidence.limitations as string[] | undefined;
  const sources = evidence.source_urls as string[] | undefined;

  return (
    <div className="p-5 sm:p-6">
      <AssetAuthenticityLabel label="FRAMEWORK EVIDENCE" tone="fixture" />
      <p className="mt-3 max-w-3xl text-[11px] leading-5 text-secondary">
        Shared framework-level evidence for the xStocks tokenization platform.
        This applies to all xStocks assets, not individually per token.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {issuer && (
          <div className="rounded-[9px] border border-edge bg-overlay-active p-4">
            <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">
              Issuer
            </p>
            <p className="mt-2 text-[12px] font-semibold text-primary">
              {issuer.name}
            </p>
            <p className="mt-1 text-[10px] text-secondary">
              {issuer.jurisdiction}
            </p>
          </div>
        )}

        {backing && (
          <div className="rounded-[9px] border border-edge bg-overlay-active p-4">
            <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">
              Backing Model
            </p>
            <p className="mt-2 text-[12px] font-semibold text-primary">
              {backing.type?.replace(/_/g, " ")}
            </p>
            {backing.custody && (
              <p className="mt-1 text-[10px] text-secondary">
                {backing.custody}
              </p>
            )}
          </div>
        )}

        {deployment && (
          <div className="rounded-[9px] border border-edge bg-overlay-active p-4">
            <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">
              Deployment Model
            </p>
            <p className="mt-2 text-[12px] font-semibold text-primary">
              {deployment.type?.replace(/_/g, " ")}
            </p>
          </div>
        )}
      </div>

      {limitations && limitations.length > 0 && (
        <div className="mt-4 rounded-[9px] border border-warning/20 bg-warning/[0.045] p-4">
          <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-warning">
            Limitations
          </p>
          <ul className="mt-2 space-y-1">
            {limitations.map((lim, i) => (
              <li key={i} className="text-[10px] leading-4 text-secondary">
                {" "}
                {lim}
              </li>
            ))}
          </ul>
        </div>
      )}

      {sources && sources.length > 0 && (
        <div className="mt-4">
          <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">
            Source URLs
          </p>
          <ul className="mt-2 space-y-1">
            {sources.map((url, i) => (
              <li key={i}>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-accent hover:text-brand-bright"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RvcStatusCard({ rvcStatus }: { rvcStatus: string }) {
  const color =
    rvcStatus === "PASS"
      ? "text-success"
      : rvcStatus === "FAIL"
        ? "text-fail"
        : rvcStatus === "UNSUPPORTED"
          ? "text-tertiary"
          : "text-warning";
  const border =
    rvcStatus === "PASS"
      ? "border-success/20 bg-success-soft/[0.05]"
      : rvcStatus === "FAIL"
        ? "border-fail/25 bg-fail/[0.05]"
        : rvcStatus === "UNSUPPORTED"
          ? "border-edge bg-surface"
          : "border-warning/20 bg-warning/[0.045]";

  return (
    <div className={`rounded-[9px] border p-5 ${border}`}>
      <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">
        Current RVC Status
      </p>
      <p className={`mt-3 text-2xl font-semibold ${color}`}>{rvcStatus}</p>
      <p className="mt-2 text-[10px] leading-4 text-secondary">
        {rvcStatus === "UNAVAILABLE"
          ? "No deterministic RVC has been run for this asset."
          : rvcStatus === "UNSUPPORTED"
            ? "No deterministic backing claim is currently supported for this asset. Deployment and framework evidence may still be available."
            : rvcStatus === "INDETERMINATE"
              ? "Framework evidence is available but per-token reserve attestation is not publicly verifiable."
              : rvcStatus === "FAIL"
                ? "RVC returned a FAIL result — see reason codes."
                : "RVC returned a PASS result."}
      </p>
    </div>
  );
}

export function AssetDetail({ asset }: { asset: ApiAssetDetail }) {
  const labels = assetAuthenticityLabels(asset);
  const isReference = asset.asset_origin === "CROSS_CHAIN_REFERENCE";
  const hasFrameworkEvidence =
    asset.framework_evidence !== null &&
    typeof asset.framework_evidence === "object";

  return (
    <>
      <Link
        href="/assets"
        className="mb-3 inline-flex items-center gap-2 text-[10px] font-semibold text-secondary hover:text-primary"
      >
        <span aria-hidden="true">&larr;</span> Asset Explorer
      </Link>

      {/* Hero */}
      <section className="relative min-h-[280px] overflow-hidden rounded-[10px] border border-edge bg-surface">
        <div className="asset-detail-shade absolute inset-0" aria-hidden="true" />
        <div className="asset-showcase-grid absolute inset-0" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 z-10 p-5 sm:p-7 lg:p-9">
          <div className="flex flex-wrap gap-1.5">
            {labels.map((item) => (
              <AssetAuthenticityLabel key={item.label} {...item} />
            ))}
          </div>
          <p className="mt-4 text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">
            {isReference ? "Cross-chain reference asset" : "X Layer native asset"}
          </p>
          <h1 className="mt-1.5 max-w-3xl text-[38px] font-semibold leading-none tracking-[-0.05em] text-primary sm:text-[48px]">
            {asset.symbol}
          </h1>
          <p className="mt-2 text-[13px] font-medium text-success">
            {asset.name}
          </p>
        </div>
      </section>

      <div className="mt-4 space-y-4">
        {/* Core info */}
        <section className="overflow-hidden rounded-[10px] border border-edge bg-surface">
          <SectionHeading
            eyebrow="Asset overview"
            title="Verification coverage"
          />
          <dl className="grid sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Issuer", value: asset.issuer },
              { label: "Asset class", value: asset.asset_class.replace("TOKENIZED_", "").replace(/_/g, " ") },
              { label: "Chain", value: `X Layer Mainnet (${asset.chain_id})` },
              {
                label: "Contract",
                value: asset.contract_address
                  ? `${asset.contract_address.slice(0, 10)}...${asset.contract_address.slice(-6)}`
                  : "Not deployed",
              },
            ].map((field) => (
              <div
                key={field.label}
                className="border-b border-edge p-5 sm:border-b-0 sm:border-r sm:last:border-r-0"
              >
                <dt className="text-[8px] font-semibold uppercase tracking-[0.09em] text-tertiary">
                  {field.label}
                </dt>
                <dd className="mt-2 text-[11px] font-medium leading-4 text-primary">
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Verification depth */}
        <section className="overflow-hidden rounded-[10px] border border-edge bg-surface">
          <SectionHeading
            eyebrow="Verification depth"
            title="Layer-by-layer verification"
            description="Each verification layer is independently assessed. Deployment = bytecode on chain. Framework = issuer documentation. Backing = reserve attestation."
          />
          <div className="grid gap-3 p-5 sm:p-6 lg:grid-cols-3">
            <VerificationDepthCard
              label="Deployment Verified"
              verified={asset.deployment_verified}
              description={
                asset.deployment_verified
                  ? `Bytecode confirmed on X Layer chain ${asset.chain_id} via eth_getCode.`
                  : "Bytecode not confirmed on the target chain."
              }
            />
            <VerificationDepthCard
              label="Framework Verified"
              verified={asset.framework_verified}
              description={
                asset.framework_verified
                  ? `Issuer framework evidence available: ${asset.evidence_adapter}`
                  : "No issuer framework documentation available."
              }
            />
            <VerificationDepthCard
              label="Backing Verified"
              verified={asset.backing_verified}
              description={
                asset.backing_verified
                  ? "Per-token reserve attestation available."
                  : "No per-token reserve attestation is publicly available."
              }
            />
          </div>
        </section>

        {/* RVC Status */}
        <section className="overflow-hidden rounded-[10px] border border-edge bg-surface">
          <SectionHeading
            eyebrow="RVC Status"
            title="Deterministic verification result"
            description="The deterministic RVC is the sole authority for PASS/FAIL/INDETERMINATE."
          />
          <div className="p-5 sm:p-6">
            <RvcStatusCard rvcStatus={asset.rvc_status} />
            {asset.rvc_status === "UNSUPPORTED" && (
              <div className="mt-4 rounded-[9px] border border-edge bg-overlay-active p-4">
                <p className="text-[11px] font-semibold text-primary">
                  No deterministic backing claim is currently supported
                </p>
                <p className="mt-1 text-[10px] leading-4 text-secondary">
                  ProofLayer has verified deployment and framework evidence, but no deterministic
                  backing claim is currently supported for this asset. Deployment and framework
                  verification are still available above.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Framework evidence (xStocks only) */}
        {hasFrameworkEvidence && (
          <section className="overflow-hidden rounded-[10px] border border-edge bg-surface">
            <SectionHeading
              eyebrow="Framework Evidence"
              title="xStocks platform evidence"
              description="Shared evidence for the entire xStocks tokenization framework."
            />
            <FrameworkEvidenceSection
              evidence={asset.framework_evidence as Record<string, unknown>}
            />
          </section>
        )}

        {/* Contract details */}
        <section className="overflow-hidden rounded-[10px] border border-edge bg-surface">
          <SectionHeading
            eyebrow="Contract"
            title="On-chain deployment"
          />
          <div className="p-5 sm:p-6">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-[8px] font-semibold uppercase tracking-[0.09em] text-tertiary">
                  Contract Address (X Layer)
                </dt>
                <dd className="mt-2">
                  {asset.contract_address ? (
                    <CopyValue
                      value={asset.contract_address}
                      label="Contract address"
                    />
                  ) : (
                    <span className="text-[11px] text-warning">
                      Not deployed on X Layer
                    </span>
                  )}
                </dd>
              </div>
              {asset.ethereum_address && (
                <div>
                  <dt className="text-[8px] font-semibold uppercase tracking-[0.09em] text-tertiary">
                    Ethereum Address
                  </dt>
                  <dd className="mt-2">
                    <CopyValue
                      value={asset.ethereum_address}
                      label="Ethereum address"
                    />
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-[8px] font-semibold uppercase tracking-[0.09em] text-tertiary">
                  Decimals
                </dt>
                <dd className="mt-2 text-[11px] font-medium text-primary">
                  {asset.decimals}
                </dd>
              </div>
              <div>
                <dt className="text-[8px] font-semibold uppercase tracking-[0.09em] text-tertiary">
                  Evidence Adapter
                </dt>
                <dd className="mt-2 text-[11px] font-medium text-primary">
                  {asset.evidence_adapter}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Token-specific evidence */}
        <section className="overflow-hidden rounded-[10px] border border-edge bg-surface">
          <SectionHeading
            eyebrow="Token-Specific Evidence"
            title="On-chain deployment evidence"
            description="Per-token evidence verified directly on X Layer chain 196."
          />
          <div className="p-5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-[9px] border border-edge bg-overlay-active p-4">
                <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">
                  Contract Address
                </p>
                <p className="mt-2 font-mono text-[11px] font-medium text-primary">
                  {asset.contract_address || "Not deployed"}
                </p>
              </div>
              <div className="rounded-[9px] border border-edge bg-overlay-active p-4">
                <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">
                  Chain
                </p>
                <p className="mt-2 text-[11px] font-medium text-primary">
                  X Layer Mainnet ({asset.chain_id})
                </p>
              </div>
              <div className="rounded-[9px] border border-edge bg-overlay-active p-4">
                <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">
                  Deployment Verified
                </p>
                <p className={`mt-2 text-[11px] font-semibold ${asset.deployment_verified ? "text-success" : "text-warning"}`}>
                  {asset.deployment_verified ? "Bytecode confirmed via eth_getCode" : "Bytecode not confirmed"}
                </p>
              </div>
              <div className="rounded-[9px] border border-edge bg-overlay-active p-4">
                <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">
                  Evidence Adapter
                </p>
                <p className="mt-2 text-[11px] font-medium text-primary">
                  {asset.evidence_adapter}
                </p>
              </div>
            </div>
            <p className="mt-4 text-[10px] leading-4 text-tertiary">
              Observed: {asset.discovery_timestamp ? new Date(asset.discovery_timestamp).toLocaleString() : "Unknown"}
            </p>
          </div>
        </section>

        {/* Description and sources */}
        <section className="overflow-hidden rounded-[10px] border border-edge bg-surface">
          <SectionHeading
            eyebrow="Description"
            title="Asset description"
          />
          <div className="p-5 sm:p-6">
            <p className="max-w-3xl text-[12px] leading-5 text-secondary">
              {asset.description}
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-[8px] uppercase tracking-[0.09em] text-tertiary">
                  Deployment source
                </dt>
                <dd className="mt-1 text-[10px] text-primary">
                  {asset.deployment_source}
                </dd>
              </div>
              <div>
                <dt className="text-[8px] uppercase tracking-[0.09em] text-tertiary">
                  Issuer source
                </dt>
                <dd className="mt-1 text-[10px] text-primary">
                  {asset.issuer_source}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Limitations */}
        <section className="overflow-hidden rounded-[10px] border border-edge bg-surface">
          <SectionHeading
            eyebrow="Limitations"
            title="Known limitations"
            description="What ProofLayer can and cannot verify for this asset."
          />
          <div className="p-5 sm:p-6">
            <ul className="space-y-2">
              {!asset.deployment_verified && (
                <li className="flex items-start gap-2 text-[11px] leading-4 text-secondary">
                  <span className="mt-0.5 text-warning">!</span>
                  Contract deployment not verified on X Layer chain {asset.chain_id}.
                </li>
              )}
              {!asset.framework_verified && (
                <li className="flex items-start gap-2 text-[11px] leading-4 text-secondary">
                  <span className="mt-0.5 text-warning">!</span>
                  No issuer framework documentation available.
                </li>
              )}
              {!asset.backing_verified && (
                <li className="flex items-start gap-2 text-[11px] leading-4 text-secondary">
                  <span className="mt-0.5 text-warning">!</span>
                  No per-token reserve attestation is publicly available.
                </li>
              )}
              {asset.rvc_status === "UNSUPPORTED" && (
                <li className="flex items-start gap-2 text-[11px] leading-4 text-secondary">
                  <span className="mt-0.5 text-tertiary">—</span>
                  No deterministic backing claim is currently supported for this asset.
                </li>
              )}
              {asset.asset_origin === "CROSS_CHAIN_REFERENCE" && (
                <li className="flex items-start gap-2 text-[11px] leading-4 text-secondary">
                  <span className="mt-0.5 text-tertiary">—</span>
                  This is a cross-chain reference asset, not deployed on X Layer.
                </li>
              )}
            </ul>
          </div>
        </section>

        {/* Next action */}
        <section className="rounded-[10px] border border-edge bg-surface p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-tertiary">
                Next action
              </p>
              <p className="mt-1 text-[14px] font-semibold text-accent">
                {asset.deployment_verified
                  ? "Inspect on-chain verification"
                  : "Verification support not yet enabled"}
              </p>
            </div>
            {asset.deployment_verified && asset.contract_address ? (
              <a
                href={`${XLAYER_MAINNET.explorerUrl}/address/${asset.contract_address}`}
                target="_blank"
                rel="noreferrer"
                className="surface-transition rounded-[8px] border border-brand/30 bg-brand/[0.1] px-4 py-2.5 text-center text-[11px] font-semibold text-accent hover:border-brand/50 hover:bg-brand/[0.15]"
              >
                Inspect on X Layer Explorer &nearr;
              </a>
            ) : (
              <span
                aria-disabled="true"
                className="rounded-[8px] border border-edge bg-scrim px-4 py-2.5 text-center text-[10px] font-semibold text-success"
              >
                No on-chain inspection available
              </span>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
