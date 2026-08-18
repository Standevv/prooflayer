import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar";
import { VerificationAgent } from "@/components/verification-agent";

export const metadata: Metadata = {
  title: "ProofLayer Intelligence",
  description:
    "Ask ProofLayer about the architecture, evidence, verification, certificates, and PolicyGate — or investigate a supported asset claim with grounded, read-only ProofLayer tools.",
};

export const dynamic = "force-dynamic";

const askPresets = [
  { label: "What is ProofLayer?", query: "What is ProofLayer and what problem does it solve for tokenized real-world assets?" },
  { label: "Explain the architecture", query: "Explain ProofLayer's current architecture to a Web3 developer. Distinguish current implementation, disclosed limitations, and target architecture." },
  { label: "How does ProofLayer get data?", query: "How does ProofLayer get its data, and which sources are live, cached, snapshot, or fixture?" },
  { label: "Why X Layer?", query: "Why does ProofLayer matter to X Layer, and what shared verification and enforcement state does it provide?" },
  { label: "How does PolicyGate work?", query: "How does PolicyGate work, and how does it use certificates to enforce read-only eligibility?" },
  { label: "How would a protocol integrate?", query: "How would a protocol integrate ProofLayer, and what remains target work for a protected downstream action?" },
] as const;

const investigatePresets = [
  { label: "Investigate USDY backing", query: "Investigate USDY TreasuryBacking. Explain the deterministic result, evidence provenance, current certificate usability, and PolicyGate state." },
  { label: "Why is USDY restricted?", query: "Why is USDY currently restricted? Explain the evidence, provenance, deterministic result, certificate usability, and PolicyGate state." },
  { label: "Compare USDY and PAXG", query: "Compare the evidence quality, provenance, and deterministic verification results for USDY TreasuryBacking and PAXG GoldBacking." },
  { label: "Show supported claims", query: "What assets and claims can ProofLayer deterministically verify today?" },
] as const;

export default async function IntelligencePage() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:ml-[240px]">
        <div className="mx-auto max-w-[1280px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          {/* Header */}
          <section className="hero-surface rounded-[10px] border border-edge px-5 py-8 sm:px-7 sm:py-10 lg:px-9">
            <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">
                    ProofLayer Intelligence
                  </p>
                  <span className="rounded-[3px] border border-brand/20 bg-brand/[0.06] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-accent">
                    AI explains · RVC decides · PolicyGate enforces
                  </span>
                </div>
                <h1 className="mt-3 text-[38px] font-semibold leading-none tracking-[-0.052em] text-accent sm:text-[48px]">
                  Ask ProofLayer
                </h1>
                <p className="mt-4 max-w-2xl text-[13px] leading-6 text-primary sm:text-[14px]">
                  Ask about ProofLayer&apos;s architecture, evidence, and enforcement — or investigate
                  a supported asset. The model selects read-only ProofLayer tools; the deterministic
                  RVC remains the only authority for PASS / FAIL / INDETERMINATE.
                </p>
              </div>
              <div className="overflow-hidden rounded-[9px] border border-edge bg-surface/65">
                <div className="border-b border-edge px-4 py-3">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">
                    Authority model
                  </p>
                </div>
                <ol className="grid grid-cols-3">
                  {[
                    ["01", "AI investigates"],
                    ["02", "RVC decides"],
                    ["03", "PolicyGate enforces"],
                  ].map(([number, label]) => (
                    <li key={number} className="border-r border-edge px-3 py-4 last:border-r-0">
                      <span className="font-mono text-[8px] text-secondary">{number}</span>
                      <span className="mt-1.5 block text-[8px] font-semibold uppercase tracking-[0.08em] text-secondary">
                        {label}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </section>

          {/* Two modes */}
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <section className="overflow-hidden rounded-[10px] border border-edge bg-surface">
              <div className="border-b border-edge px-5 py-4 sm:px-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-tertiary">Mode 01</p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-brand-bright">Ask ProofLayer</h2>
                <p className="mt-2 text-[12px] leading-5 text-secondary">
                  Project and architecture questions answered from grounded repository context — no
                  verification workflow required.
                </p>
                <ul className="mt-4 space-y-1.5">
                  {askPresets.map((preset) => (
                    <li key={preset.label} className="flex items-start gap-2 text-[11px] leading-5 text-secondary">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                      {preset.label}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
            <section className="overflow-hidden rounded-[10px] border border-edge bg-surface">
              <div className="border-b border-edge px-5 py-4 sm:px-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-tertiary">Mode 02</p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-brand-bright">Investigate Verification</h2>
                <p className="mt-2 text-[12px] leading-5 text-secondary">
                  Run the read-only ProofLayer toolchain for a supported asset and get a grounded
                  explanation separated from authoritative state.
                </p>
                <ul className="mt-4 space-y-1.5">
                  {investigatePresets.map((preset) => (
                    <li key={preset.label} className="flex items-start gap-2 text-[11px] leading-5 text-secondary">
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-success-soft" aria-hidden="true" />
                      {preset.label}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>

          {/* Agent workspace */}
          <div className="mt-4">
            <section className="overflow-hidden rounded-[10px] border border-edge bg-surface">
              <VerificationAgent />
            </section>
          </div>

          <footer className="mt-5 flex flex-col gap-1 border-t border-edge py-4 text-[10px] leading-4 text-tertiary sm:flex-row sm:justify-between">
            <p>AI investigates with read-only ProofLayer tools. The deterministic RVC remains authoritative.</p>
            <p>ProofLayer Intelligence / X Layer Testnet</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
