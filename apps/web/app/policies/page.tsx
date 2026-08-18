import type { Metadata } from "next";

import { PolicyStudioOverviewView } from "@/components/policy-studio-overview";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = { title: "Policy Studio", description: "Define how applications consume authoritative ProofLayer verification." };

export default function PoliciesPage() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:ml-[220px]">
        <div className="mx-auto max-w-[1200px] px-5 py-5 sm:px-6 lg:px-8 lg:py-6">
          <header className="hero-surface px-6 py-8 sm:px-8 sm:py-10">
            <div className="relative z-10 max-w-3xl">
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-brand">
                <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
                Institutional trust configuration
              </div>
              <h1 className="mt-4 text-[32px] font-semibold leading-[0.98] tracking-[-0.04em] text-primary sm:text-[42px]">
                Policy Studio
              </h1>
              <p className="mt-4 max-w-2xl text-[13px] leading-6 text-secondary sm:text-[14px]">
                Define how your application consumes ProofLayer verification.
              </p>
              <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.11em] text-brand">
                Different institutions have different trust requirements.
              </p>
            </div>
          </header>
          <div className="mt-4"><PolicyStudioOverviewView /></div>
          <footer className="mt-5 border-t border-edge py-4 text-[9px] leading-4 text-tertiary">
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
              <p>ProofLayer determines facts · Your application defines requirements</p>
              <p>Custom policy never changes the RVC result</p>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
