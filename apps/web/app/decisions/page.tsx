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
      <main className="lg:ml-[220px]">
        <div className="mx-auto max-w-[1200px] px-5 py-5 sm:px-6 lg:px-8 lg:py-6">
          <section className="hero-surface px-6 py-8 sm:px-8 sm:py-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-brand">
                  Immutable audit trail
                </p>
                <h1 className="mt-3 text-[32px] font-semibold leading-none tracking-[-0.04em] text-primary sm:text-[40px]">
                  Decision Activity
                </h1>
                <p className="mt-3 max-w-xl text-[13px] leading-6 text-secondary sm:text-[14px]">
                  Read-only PolicyGate decisions recorded on X Layer Testnet. Rejected calls revert
                  and do not create successful DecisionLog entries.
                </p>
              </div>
              <div className="overflow-hidden border border-edge bg-surface/80">
                <div className="border-b border-edge px-4 py-3">
                  <p className="text-[7px] font-semibold uppercase tracking-[0.12em] text-tertiary">
                    DecisionLog / chain 1952
                  </p>
                </div>
                <div className="px-4 py-4">
                  <span className="font-mono text-[10px] text-primary">
                    {onchain.decisionCount ?? "0"} total decisions
                  </span>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-4">
            <DecisionLogPanel data={onchain} />
          </div>

          <footer className="mt-5 border-t border-edge py-4 text-[9px] leading-4 text-tertiary">
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
              <p>Read-only DecisionLog inspection from the deployed X Layer Testnet contracts.</p>
              <p>ProofLayer Decisions / X Layer Testnet</p>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
