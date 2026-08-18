import { CopyValue } from "@/components/copy-value";
import { Icon } from "@/components/icons";
import type { DemoCertificate } from "@/lib/demo-data";
import type { OnchainDashboardData } from "@/lib/onchain";

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

type TechnicalField = {
  label: string;
  value: React.ReactNode;
};

export function CertificateCard({
  certificate,
  onchain,
  certificateStatus,
}: {
  certificate: DemoCertificate;
  onchain: OnchainDashboardData;
  certificateStatus: string;
}) {
  const issuer = onchain.certificate?.issuer;
  const fields: TechnicalField[] = [
    {
      label: "Certificate ID",
      value: <CopyValue value={certificate.solidity.certificateId} label="Certificate ID" />,
    },
    { label: "Asset", value: certificate.human.asset },
    {
      label: "Asset ID",
      value: <CopyValue value={certificate.solidity.assetId} label="Asset ID" />,
    },
    {
      label: "Claim Type",
      value: <CopyValue value={certificate.solidity.claimType} label="Claim type" />,
    },
    {
      label: "Policy ID",
      value: <CopyValue value={certificate.solidity.policyId} label="Policy ID" />,
    },
    {
      label: "Evidence Root",
      value: <CopyValue value={certificate.solidity.evidenceRoot} label="Evidence root" />,
    },
    {
      label: "Observed At",
      value: <time dateTime={certificate.human.observed_at}>{formatTime(certificate.human.observed_at)} UTC</time>,
    },
    {
      label: "Valid Until",
      value: <time dateTime={certificate.human.valid_until}>{formatTime(certificate.human.valid_until)} UTC</time>,
    },
    { label: "Independent Root Count", value: certificate.human.independent_root_count },
    { label: "Revoked", value: onchain.certificate === null ? "Unavailable" : onchain.certificate.revoked ? "Yes" : "No" },
  ];

  const statusTone = certificateStatus === "Active" ? "text-success border-success/25 bg-success-soft/[0.07]" : "text-warning border-warning/25 bg-warning/[0.07]";

  return (
    <section
      id="certificate"
      className="overflow-hidden rounded-[10px] border border-edge bg-surface"
      aria-labelledby="certificate-heading"
    >
      <div className="border-b border-edge px-5 py-4 sm:px-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-tertiary">Attestation</p>
        <h2 id="certificate-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em] text-brand-bright">
          Verification Certificate
        </h2>
      </div>

      <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="border-b border-edge bg-overlay-active p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <span className="grid size-12 place-items-center rounded-[10px] border border-success/25 bg-success-soft/[0.07] text-success shadow-[0_0_30px_rgba(54,209,124,0.07)]">
            <Icon name="certificate" className="size-6" />
          </span>
          <p className="mt-5 text-[9px] font-semibold uppercase tracking-[0.11em] text-tertiary">Historical certificate result</p>
          <p className="pass-glow mt-1 text-3xl font-semibold tracking-[-0.04em] text-success">{certificate.human.result}</p>
          <p className="mt-2 text-[12px] leading-5 text-secondary">Immutable result recorded when this certificate was created; this is not the current RVC result.</p>

          <div className="mt-6 space-y-3 border-t border-edge pt-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] text-secondary">Current usability</span>
              <span className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.06em] ${statusTone}`}>{certificateStatus}</span>
            </div>
            <div>
              <p className="mb-1 text-[10px] text-secondary">Issuer</p>
              {issuer === undefined ? <span className="text-[11px] text-secondary">Unavailable</span> : <CopyValue value={issuer} label="Issuer" />}
            </div>
            <p className="flex items-center gap-1.5 text-[10px] font-medium text-secondary">
              <span className={`size-1.5 rounded-full ${onchain.registered ? "bg-success-soft" : "bg-warning"}`} aria-hidden="true" />
              {onchain.registered ? "Anchored on X Layer" : "On-chain status unavailable"}
            </p>
          </div>
        </div>

        <dl className="grid sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.label} className="min-w-0 border-b border-edge px-5 py-3.5 sm:odd:border-r sm:px-6">
              <dt className="text-[9px] font-semibold uppercase tracking-[0.09em] text-tertiary">{field.label}</dt>
              <dd className="mt-1.5 min-w-0 text-[12px] font-medium text-accent">{field.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
