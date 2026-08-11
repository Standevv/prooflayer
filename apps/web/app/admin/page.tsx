import type { Metadata } from "next";

import { OperatorConsole } from "@/components/operator-console";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "Operator Console",
  description:
    "Read-only operator control and observation for ProofLayer verification infrastructure.",
};

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-[#0b0c10]">
      <Sidebar />
      <main className="lg:ml-[240px]">
        <div className="mx-auto max-w-[1240px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <header className="command-header relative overflow-hidden rounded-[9px] border border-white/[0.08] px-5 py-8 sm:px-7 sm:py-10">
            <div className="relative z-10 max-w-3xl">
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8f84dd]">
                <span className="status-pulse size-1.5 rounded-full bg-[#36d17c]" aria-hidden="true" />
                Operator console · local / demo mode
              </div>
              <h1 className="mt-4 text-[34px] font-semibold leading-[0.98] tracking-[-0.052em] text-[#f7f7fa] sm:text-[46px]">
                Operator Console
              </h1>
              <p className="mt-4 max-w-2xl text-[13px] leading-6 text-[#b1b5bf] sm:text-[14px]">
                Observe and control ProofLayer verification infrastructure from one read-only surface.
                Every value below is composed from the real backend: deterministic RVC, live Ethereum and
                X Layer reads, and the Ankura attestation evidence.
              </p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8e84d4]">
                Observe · Verify · Never override
              </p>
            </div>
          </header>
          <div className="mt-4">
            <OperatorConsole />
          </div>
        </div>
      </main>
    </div>
  );
}
