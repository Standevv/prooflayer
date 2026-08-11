import type { DemoCertificate } from "@/lib/demo-data";
import type { OnchainDashboardData } from "@/lib/onchain";

export function SummaryStrip({
  certificate,
  onchain,
  certificateStatus,
}: {
  certificate: DemoCertificate;
  onchain: OnchainDashboardData;
  certificateStatus: string;
}) {
  const registered =
    onchain.registered === null ? "Unavailable" : onchain.registered ? "Registered" : "Not registered";

  const metrics = [
    { label: "Verification", value: certificate.human.result, tone: "pass" },
    { label: "Certificate", value: registered, tone: "neutral" },
    {
      label: "Usability",
      value: certificateStatus,
      tone: certificateStatus === "Active" ? "pass" : certificateStatus === "Expired" ? "warning" : "neutral",
    },
    { label: "Evidence roots", value: String(certificate.human.independent_root_count), tone: "neutral" },
  ] as const;

  return (
    <section aria-label="Verification summary" className="overflow-hidden rounded-[8px] border border-[#8f7df0]/[0.12] bg-[#0f1116]">
      <dl className="grid grid-cols-2 sm:grid-cols-4">
        {metrics.map((metric, index) => (
          <div
            key={metric.label}
            className={`flex min-h-[72px] flex-col justify-center border-white/[0.09] px-4 py-3 sm:min-h-[76px] sm:px-5 ${
              index % 2 === 1 ? "border-l" : ""
            } ${index >= 2 ? "border-t sm:border-t-0" : ""} sm:border-l sm:first:border-l-0`}
          >
            <dt className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#7f8491]">{metric.label}</dt>
            <dd className={`mt-1.5 font-mono text-[14px] font-semibold uppercase tracking-[-0.01em] sm:text-[15px] ${
              metric.tone === "pass"
                ? "text-[#36d17c]"
                : metric.tone === "warning"
                  ? "text-[#e9b949]"
                  : "text-[#e7e8ed]"
            }`}>
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
