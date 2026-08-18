import { Icon } from "@/components/icons";
import {
  type DemoCertificate,
  RESULT_DEFINITIONS,
  type VerificationResult,
} from "@/lib/demo-data";
import {
  buildTruthPresentation,
  type CurrentVerificationTruth,
} from "@/lib/truth-presentation";

const stateStyles: Record<VerificationResult, string> = {
  PASS: "border-success/30 bg-success-soft/10 text-success",
  FAIL: "border-fail/30 bg-fail/10 text-fail",
  INDETERMINATE: "border-warning/30 bg-warning/10 text-warning",
};

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function ResultSemantics({
  certificate,
  certificateStatus,
  currentCertificateUsable,
  currentVerification,
}: {
  certificate: DemoCertificate;
  certificateStatus: string;
  currentCertificateUsable: boolean | null;
  currentVerification: CurrentVerificationTruth | null;
}) {
  const truth = buildTruthPresentation({
    currentVerification,
    historicalCertificateResult: certificate.human.result,
    certificateStatus,
    currentCertificateUsable,
  });
  const currentResult = truth.currentRvcResult;
  const fields = [
    ["Historical certificate result", truth.historicalCertificateResult],
    ["Certificate observed", `${formatTime(certificate.human.observed_at)} UTC`],
    ["Certificate valid until", `${formatTime(certificate.human.valid_until)} UTC`],
    ["Current certificate usability", truth.currentCertificateUsability],
    ["Historical policy", certificate.human.policy_id],
  ] as const;

  const currentTone =
    currentResult === "PASS"
      ? "text-success"
      : currentResult === "FAIL"
        ? "text-fail"
        : "text-warning";
  const currentSurface =
    currentResult === "PASS"
      ? "bg-[linear-gradient(135deg,rgba(54,209,124,0.035),transparent_58%)]"
      : currentResult === "FAIL"
        ? "bg-[linear-gradient(135deg,rgba(255,107,107,0.055),transparent_58%)]"
        : "bg-[linear-gradient(135deg,rgba(233,185,73,0.045),transparent_58%)]";
  const currentIcon =
    currentResult === "PASS"
      ? "border-success/25 bg-success-soft/10 text-success"
      : currentResult === "FAIL"
        ? "border-fail/25 bg-fail/10 text-fail"
        : "border-warning/25 bg-warning/10 text-warning";

  return (
    <div id="verification-result" className={`min-w-0 p-5 sm:p-6 ${currentSurface}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-[10px] border ${currentIcon}`}>
            <Icon name="shield" className="size-5" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-tertiary">Current RVC result</p>
            <p className="mt-1 text-[13px] text-secondary">{certificate.human.asset} / Treasury Backing</p>
          </div>
        </div>
        <span className="rounded-[5px] border border-edge bg-scrim px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-tertiary">
          Authoritative evidence API
        </span>
      </div>

      <div className="mt-5">
        <p className={`text-[36px] font-bold leading-none tracking-[-0.045em] ${currentTone}`}>
          {currentResult}
        </p>
        <p className="mt-2 text-[14px] font-medium text-primary">
          {truth.currentRvcReasons.length
            ? truth.currentRvcReasons.join(" · ")
            : currentResult === "UNAVAILABLE"
              ? "No current result is inferred from the historical certificate."
              : "No blocking reason codes."}
        </p>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-edge pt-4 xl:grid-cols-3">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[9px] font-semibold uppercase tracking-[0.09em] text-tertiary">{label}</dt>
            <dd className={`mt-1.5 truncate text-[12px] font-medium ${
              label === "Current certificate usability" && certificateStatus === "Expired" ? "text-warning" : "text-primary"
            }`}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 border-t border-edge pt-4">
        <p className="text-[9px] font-semibold uppercase tracking-[0.09em] text-tertiary">Outcome semantics</p>
        <div className="mt-2 grid gap-2">
          {(Object.keys(RESULT_DEFINITIONS) as VerificationResult[]).map((state) => (
            <div key={state} className="flex items-start gap-2">
              <span className={`mt-0.5 shrink-0 rounded-[4px] border px-1.5 py-0.5 text-[8px] font-bold ${stateStyles[state]}`}>
                {state}
              </span>
              <p className="text-[10px] leading-4 text-tertiary">{RESULT_DEFINITIONS[state].description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
