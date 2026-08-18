import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar";
import { DecisionLogPanel } from "@/components/decision-log";
import { USDY_PASS_CERTIFICATE } from "@/lib/demo-data";
import { getOnchainDashboardData } from "@/lib/onchain";

export const metadata: Metadata = {
  title: "Decisions",
  description:
    "Inspect ProofLayer DecisionLog activity: executed PolicyGate decisions and the immutable audit trail on X Layer Testnet.",
};

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const onchain = await getOnchainDashboardData(USDY_PASS_CERTIFICATE.solidity.certificateId, {
    includeDecision: true,
  });

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:ml-[240px]">
        <div className="mx-auto max-w-[1280px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <section className="hero-surface rounded-[10px] border border-edge px-5 py-8 sm:px-7 sm:py-10 lg:px-9">
            <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">
                  Immutable audit trail
                </p>
                <h1 className="mt-3 text-[38px] font-semibold leading-none tracking-[-0.052em] text-accent sm:text-[48px]">
                  Decision Activity
                </h1>
                <p className="mt-4 max-w-2xl text-[13px] leading-6 text-primary sm:text-[14px]">
                  Read-only PolicyGate decisions recorded on X Layer Testnet. Rejected calls revert
                  and do not create successful DecisionLog entries.
                </p>
              </div>
              <div className="overflow-hidden rounded-[9px] border border-edge bg-surface/65">
                <div className="border-b border-edge px-4 py-3">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">
                    DecisionLog / chain 1952
                  </p>
                </div>
                <div className="px-4 py-4">
                  <span className="font-mono text-[10px] text-accent">
                    {onchain.decisionCount ?? "0"} total decisions
                  </span>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-4">
            <DecisionLogPanel data={onchain} />
          </div>

          <footer className="mt-5 flex flex-col gap-1 border-t border-edge py-4 text-[10px] leading-4 text-tertiary sm:flex-row sm:justify-between">
            <p>Read-only DecisionLog inspection from the deployed X Layer Testnet contracts.</p>
            <p>ProofLayer Decisions / X Layer Testnet</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
