import type { Metadata } from "next";

import { CertificateExplorerIndex } from "@/components/certificate-explorer-index";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "Certificate Explorer",
  description: "Inspect ProofLayer verification certificates anchored on X Layer.",
};

export default function CertificatesPage() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:ml-[240px]">
        <div className="mx-auto max-w-[1180px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <header className="command-header relative overflow-hidden rounded-[9px] border border-edge px-5 py-8 sm:px-7 sm:py-10">
            <div className="relative z-10 max-w-3xl">
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-brand">
                <span className="size-1.5 rounded-full bg-success-soft" aria-hidden="true" />
                Public verification infrastructure
              </div>
              <h1 className="mt-4 text-[36px] font-semibold leading-none tracking-[-0.052em] text-accent sm:text-[46px]">Certificate Explorer</h1>
              <p className="mt-4 max-w-2xl text-[13px] leading-6 text-primary sm:text-[14px]">Inspect ProofLayer verification certificates anchored on X Layer.</p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-tertiary">Don&apos;t trust the dashboard. Verify the certificate.</p>
            </div>
          </header>

          <div className="mt-4">
            <CertificateExplorerIndex />
          </div>

          <footer className="mt-5 flex flex-col gap-1 border-t border-edge py-4 text-[10px] leading-4 text-tertiary sm:flex-row sm:justify-between">
            <p>Read-only Registry, DecisionLog, and fixture inspection.</p>
            <p>No wallet · No transaction · X Layer Testnet / 1952</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
