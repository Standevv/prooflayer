import { Icon } from "@/components/icons";

function FlowRow({
  result,
  outcome,
  tone,
}: {
  result: string;
  outcome: string;
  tone: "pass" | "blocked";
}) {
  const isPass = tone === "pass";
  const color = isPass ? "#36d17c" : "#e9b949";

  return (
    <div className="surface-transition grid gap-3 rounded-[10px] border border-edge bg-elevated p-3 hover:border-edge sm:grid-cols-[145px_minmax(0,1fr)] sm:items-center sm:p-4">
      <span
        className="w-fit rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.07em]"
        style={{ borderColor: `${color}40`, backgroundColor: `${color}0d`, color }}
      >
        {result}
      </span>
      <div className="grid grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)_18px_minmax(0,1fr)] items-center text-center text-[10px] font-medium text-secondary sm:text-[11px]">
        <span className="truncate">Certificate</span>
        <span className="h-px bg-current opacity-25" aria-hidden="true" />
        <span className="flex items-center justify-center gap-1.5 text-primary"><Icon name="gate" className="size-3.5" /> PolicyGate</span>
        <span className="h-px bg-current opacity-25" aria-hidden="true" />
        <strong className={isPass ? "pass-glow text-success" : "text-warning"}>{outcome}</strong>
      </div>
    </div>
  );
}

export function PolicyGateFlow() {
  return (
    <section className="overflow-hidden rounded-[10px] border border-edge bg-surface" aria-labelledby="policy-flow-heading">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-edge px-5 py-4 sm:px-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-tertiary">PolicyGate</p>
          <h2 id="policy-flow-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em] text-brand-bright">Enforcement Outcomes</h2>
        </div>
        <p className="text-[11px] text-secondary">
          Reference rule: current certificate usability determines eligibility, not a historical result.
        </p>
      </div>
      <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-2">
        <FlowRow result="CURRENTLY USABLE PASS" outcome="ELIGIBLE" tone="pass" />
        <FlowRow result="UNUSABLE OR NON-PASS" outcome="BLOCKED" tone="blocked" />
      </div>
    </section>
  );
}
