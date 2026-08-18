import type { DemoCertificate } from "@/lib/demo-data";
import type { OnchainDashboardData } from "@/lib/onchain";
import {
  buildTruthPresentation,
  type CurrentVerificationTruth,
} from "@/lib/truth-presentation";

type Tone = "pass" | "warning" | "bad" | "neutral";

const toneText: Record<Tone, string> = {
  pass: "text-success",
  warning: "text-warning",
  bad: "text-fail",
  neutral: "text-accent",
};

const toneDot: Record<Tone, string> = {
  pass: "bg-success-soft",
  warning: "bg-warning",
  bad: "bg-fail",
  neutral: "bg-overlay-active",
};

export function SummaryStrip({
  certificate,
  onchain,
  certificateStatus,
  currentVerification,
}: {
  certificate: DemoCertificate;
  onchain: OnchainDashboardData;
  certificateStatus: string;
  currentVerification: CurrentVerificationTruth | null;
}) {
  const registered =
    onchain.registered === null ? "Unavailable" : onchain.registered ? "Registered" : "Not registered";

  const truth = buildTruthPresentation({
    currentVerification,
    historicalCertificateResult: certificate.human.result,
    certificateStatus,
    currentCertificateUsable: onchain.usable,
  });

  const metrics: Array<{ label: string; value: string; tone: Tone; sub?: string }> = [
    {
      label: "Current RVC result",
      value: truth.currentRvcResult,
      tone:
        truth.currentRvcResult === "PASS"
          ? "pass"
          : truth.currentRvcResult === "FAIL"
            ? "bad"
            : "warning",
      sub: truth.currentRvcReasons.join(" · ") || "authoritative evidence API",
    },
    {
      label: "Historical certificate result",
      value: truth.historicalCertificateResult,
      tone: "neutral",
      sub: "immutable fixture record",
    },
    {
      label: "Current certificate usability",
      value: truth.currentCertificateUsability,
      tone: onchain.usable === true ? "pass" : onchain.usable === false ? "bad" : "neutral",
      sub: `${registered} on X Layer`,
    },
    {
      label: "X Layer Network",
      value: onchain.connected ? "Connected" : "Unavailable",
      tone: onchain.connected ? "pass" : "bad",
      sub: `X Layer Testnet · chain ${onchain.chainId ?? 1952}`,
    },
  ];

  return (
    <section aria-label="Verification summary" className="overflow-hidden rounded-[8px] border border-edge bg-surface">
      <dl className="grid grid-cols-2 sm:grid-cols-4">
        {metrics.map((metric, index) => (
          <div
            key={metric.label}
            className={`flex min-h-[76px] flex-col justify-center border-edge px-4 py-3 sm:min-h-[84px] sm:px-5 ${
              index % 2 === 1 ? "border-l" : ""
            } ${index >= 2 ? "border-t sm:border-t-0" : ""} sm:border-l sm:first:border-l-0`}
          >
            <dt className="text-[9px] font-semibold uppercase tracking-[0.12em] text-tertiary">{metric.label}</dt>
            <dd className={`mt-1.5 flex items-center gap-2 font-mono text-[14px] font-bold tracking-[-0.01em] sm:text-[15px] ${toneText[metric.tone]}`}>
              <span className={`size-1.5 rounded-full ${toneDot[metric.tone]}`} aria-hidden="true" />
              {metric.value}
            </dd>
            {metric.sub ? <dd className="mt-1 text-[9px] leading-3 text-secondary">{metric.sub}</dd> : null}
          </div>
        ))}
      </dl>
    </section>
  );
}
