import type { Metadata } from "next";

import { MonitoringOverviewView } from "@/components/monitoring-overview";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "Continuous Verification",
  description: "Track time-dependent trust conditions for supported real-world assets.",
};

export default function MonitoringPage() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:ml-[220px]">
        <div className="mx-auto max-w-[1200px] px-5 py-5 sm:px-6 lg:px-8 lg:py-6">
          <header className="hero-surface px-6 py-8 sm:px-8 sm:py-10">
            <div className="relative z-10 max-w-3xl">
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-brand">
                <span className="status-pulse size-1.5 rounded-full bg-success" aria-hidden="true" />
                Read-only trust monitoring
              </div>
              <h1 className="mt-4 text-[32px] font-semibold leading-[0.98] tracking-[-0.04em] text-primary sm:text-[42px]">
                Continuous Verification
              </h1>
              <p className="mt-4 max-w-2xl text-[13px] leading-6 text-secondary sm:text-[14px]">
                Track how asset trust conditions change as evidence, certificates and policy state evolve.
              </p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-brand">
                Trust is not static.
              </p>
            </div>
          </header>
          <div className="mt-4"><MonitoringOverviewView /></div>
          <footer className="mt-5 border-t border-edge py-4 text-[9px] leading-4 text-tertiary">
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
              <p>Verify → Monitor → Re-evaluate → Detect trust changes</p>
              <p>No wallet · No transaction · No automatic certificate actions</p>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
