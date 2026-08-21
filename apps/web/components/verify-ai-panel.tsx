"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const VerificationAgent = dynamic(
  () =>
    import("@/components/verification-agent").then((mod) => ({
      default: mod.VerificationAgent,
    })),
  { ssr: false },
);

export function VerifyAIPanel() {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-4 overflow-hidden border border-edge bg-surface">
      <div className="px-6 py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-brand">
                AI Verification Intelligence
              </p>
              <span className="rounded-[3px] border border-brand/15 bg-brand/[0.06] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-brand">
                AI explains · RVC decides · PolicyGate enforces
              </span>
              <span className="rounded-[3px] border border-edge bg-overlay-hover px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-tertiary">
                Non-authoritative
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-[11px] leading-5 text-secondary">
              Ask ProofLayer AI to explain evidence, compare verification states,
              and interpret RVC results. AI provides interpretation only — it
              cannot change verification outcomes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="surface-transition shrink-0 rounded-[6px] border border-brand/35 bg-brand/[0.10] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-brand-bright hover:border-brand/55 hover:bg-brand/[0.18]"
          >
            {open ? "Close AI Panel" : "Open AI Verification"}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-edge">
          <VerificationAgent />
        </div>
      )}
    </section>
  );
}
