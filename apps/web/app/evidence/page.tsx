import type { Metadata } from "next";

import { EvidenceExplorerIndexView } from "@/components/evidence-explorer-index";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "Evidence & Provenance Explorer",
  description: "Inspect normalized ProofLayer evidence, independent roots, and deterministic commitments.",
};

export default function EvidencePage() {
  return (
    <div className="min-h-screen bg-[#0b0c10]">
      <Sidebar />
      <main className="lg:ml-[240px]">
        <div className="mx-auto max-w-[1240px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <header className="command-header relative overflow-hidden rounded-[9px] border border-white/[0.08] px-5 py-8 sm:px-7 sm:py-10">
            <div className="relative z-10 max-w-3xl">
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8f84dd]">
                <span className="size-1.5 rounded-full bg-[#36d17c]" aria-hidden="true" />
                Deterministic evidence inspection
              </div>
              <h1 className="mt-4 text-[34px] font-semibold leading-[0.98] tracking-[-0.052em] text-[#f7f7fa] sm:text-[46px]">
                Evidence &amp; Provenance Explorer
              </h1>
              <p className="mt-4 max-w-2xl text-[13px] leading-6 text-[#b1b5bf] sm:text-[14px]">
                Inspect the sources, dependencies and evidence roots behind ProofLayer verification.
              </p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-[#777d89]">
                More sources do not always mean more independent proof.
              </p>
            </div>
          </header>
          <div className="mt-4"><EvidenceExplorerIndexView /></div>
          <footer className="mt-5 flex flex-col gap-1 border-t border-white/[0.08] py-4 text-[10px] leading-4 text-[#747987] sm:flex-row sm:justify-between">
            <p>Read-only evidence, provenance, and RVC inspection.</p>
            <p>No wallet · No transaction · No fabricated proof data</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
