import { Icon } from "@/components/icons";
import {
  type DemoCertificate,
  RESULT_DEFINITIONS,
  type VerificationResult,
} from "@/lib/demo-data";

const stateStyles: Record<VerificationResult, string> = {
  PASS: "border-[#36d17c]/30 bg-[#36d17c]/10 text-[#36d17c]",
  FAIL: "border-[#ff6b6b]/30 bg-[#ff6b6b]/10 text-[#ff6b6b]",
  INDETERMINATE: "border-[#e9b949]/30 bg-[#e9b949]/10 text-[#e9b949]",
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
}: {
  certificate: DemoCertificate;
  certificateStatus: string;
}) {
  const result = certificate.human.result;
  const fields = [
    ["Policy", certificate.human.policy_id],
    ["Independent roots", String(certificate.human.independent_root_count)],
    ["Observed", `${formatTime(certificate.human.observed_at)} UTC`],
    ["Valid until", `${formatTime(certificate.human.valid_until)} UTC`],
    ["Certificate status", certificateStatus],
  ] as const;

  return (
    <div id="verification-result" className="pass-glow min-w-0 bg-[linear-gradient(135deg,rgba(54,209,124,0.035),transparent_58%)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-[#36d17c]/25 bg-[#36d17c]/10 text-[#36d17c] shadow-[0_0_22px_rgba(54,209,124,0.08)]">
            <Icon name="shield" className="size-5" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#818693]">Verification result</p>
            <p className="mt-1 text-[13px] text-[#aab3ad]">{certificate.human.asset} / Treasury Backing</p>
          </div>
        </div>
        <span className="rounded-[5px] border border-white/[0.08] bg-black/20 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8b909c]">
          Fixture
        </span>
      </div>

      <div className="mt-6">
        <p className="text-[36px] font-semibold leading-none tracking-[-0.045em] text-[#36d17c] drop-shadow-[0_0_16px_rgba(54,209,124,0.16)]">
          {result}
        </p>
        <p className="mt-2 text-[15px] font-medium text-[#e5eae7]">Claim satisfied under policy.</p>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-white/[0.08] pt-5 xl:grid-cols-3">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[9px] font-semibold uppercase tracking-[0.09em] text-[#747987]">{label}</dt>
            <dd className={`mt-1.5 truncate text-[12px] font-medium ${
              label === "Certificate status" && certificateStatus === "Expired" ? "text-[#e9b949]" : "text-[#d4d7df]"
            }`}>
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 border-t border-white/[0.08] pt-4">
        <p className="text-[9px] font-semibold uppercase tracking-[0.09em] text-[#747987]">Outcome semantics</p>
        <div className="mt-2 grid gap-2">
          {(Object.keys(RESULT_DEFINITIONS) as VerificationResult[]).map((state) => (
            <div key={state} className="flex items-start gap-2">
              <span className={`mt-0.5 shrink-0 rounded-[4px] border px-1.5 py-0.5 text-[8px] font-bold ${stateStyles[state]}`}>
                {state}
              </span>
              <p className="text-[10px] leading-4 text-[#8b909c]">{RESULT_DEFINITIONS[state].description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
