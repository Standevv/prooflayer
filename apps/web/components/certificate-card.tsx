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

  const statusTone = certificateStatus === "Active" ? "text-[#36d17c] border-[#36d17c]/25 bg-[#36d17c]/[0.07]" : "text-[#e9b949] border-[#e9b949]/25 bg-[#e9b949]/[0.07]";

  return (
    <section
      id="certificate"
      className="overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#111319]"
      aria-labelledby="certificate-heading"
    >
      <div className="border-b border-white/[0.08] px-5 py-4 sm:px-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#747987]">Attestation</p>
        <h2 id="certificate-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[#f5f4f8]">
          Verification Certificate
        </h2>
      </div>

      <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="border-b border-white/[0.08] bg-black/[0.08] p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <span className="grid size-12 place-items-center rounded-[10px] border border-[#36d17c]/25 bg-[#36d17c]/[0.07] text-[#36d17c] shadow-[0_0_30px_rgba(54,209,124,0.07)]">
            <Icon name="certificate" className="size-6" />
          </span>
          <p className="mt-5 text-[9px] font-semibold uppercase tracking-[0.11em] text-[#747987]">Verification result</p>
          <p className="pass-glow mt-1 text-3xl font-semibold tracking-[-0.04em] text-[#36d17c]">{certificate.human.result}</p>
          <p className="mt-2 text-[12px] leading-5 text-[#9da2ae]">Claim satisfied under the encoded backing policy.</p>

          <div className="mt-6 space-y-3 border-t border-white/[0.08] pt-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] text-[#858a97]">Status</span>
              <span className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.06em] ${statusTone}`}>{certificateStatus}</span>
            </div>
            <div>
              <p className="mb-1 text-[10px] text-[#858a97]">Issuer</p>
              {issuer === undefined ? <span className="text-[11px] text-[#969ba8]">Unavailable</span> : <CopyValue value={issuer} label="Issuer" />}
            </div>
            <p className="flex items-center gap-1.5 text-[10px] font-medium text-[#a4ada7]">
              <span className={`size-1.5 rounded-full ${onchain.registered ? "bg-[#36d17c]" : "bg-[#e9b949]"}`} aria-hidden="true" />
              {onchain.registered ? "Anchored on X Layer" : "On-chain status unavailable"}
            </p>
          </div>
        </div>

        <dl className="grid sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.label} className="min-w-0 border-b border-white/[0.07] px-5 py-3.5 sm:odd:border-r sm:px-6">
              <dt className="text-[9px] font-semibold uppercase tracking-[0.09em] text-[#747987]">{field.label}</dt>
              <dd className="mt-1.5 min-w-0 text-[12px] font-medium text-[#d4d7df]">{field.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
