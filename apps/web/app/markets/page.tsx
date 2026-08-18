import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar";
import { VerifiedMarketCard } from "@/components/verified-market-card";

export const metadata: Metadata = {
  title: "Verified Markets — ProofLayer",
  description:
    "Verification-gated RWA market experience. Market actions are enforced on-chain via PolicyGate.",
};

export default function MarketsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:ml-[240px]">
        <div className="mx-auto max-w-[1280px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <section className="hero-surface rounded-[10px] border border-edge px-5 py-8 sm:px-7 sm:py-10 lg:px-9">
            <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">
                    Verification-gated market access
                  </p>
                  <span className="rounded-[3px] border border-success/20 bg-success-soft/[0.045] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-success">
                    X Layer Testnet
                  </span>
                </div>
                <h1 className="mt-3 text-[38px] font-semibold leading-none tracking-[-0.052em] text-accent sm:text-[48px]">
                  Verified Markets
                </h1>
                <p className="mt-4 max-w-2xl text-[13px] leading-6 text-primary sm:text-[14px]">
                  Market actions are gated by ProofLayer verification. A valid PASS certificate
                  is required before any protected interaction is allowed on-chain.
                </p>
              </div>

              <div className="overflow-hidden rounded-[9px] border border-edge bg-surface/65">
                <div className="border-b border-edge px-4 py-3">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">
                    Enforcement path
                  </p>
                </div>
                <ol className="grid grid-cols-4">
                  {[
                    ["01", "Claim"],
                    ["02", "Certificate"],
                    ["03", "PolicyGate"],
                    ["04", "Market"],
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

          <section className="mt-4 grid gap-4 xl:grid-cols-2">
            <VerifiedMarketCard asset="USDY" />
            <VerifiedMarketCard asset="PAXG" />
          </section>

          <section className="mt-4 overflow-hidden rounded-[10px] border border-edge bg-surface">
            <div className="border-b border-edge px-5 py-4 sm:px-6">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-brand">
                Why verification matters
              </p>
              <h2 className="mt-1.5 text-lg font-semibold tracking-[-0.025em] text-primary">
                Without ProofLayer, markets cannot verify RWA claims
              </h2>
            </div>
            <div className="grid md:grid-cols-3">
              {[
                {
                  number: "01",
                  title: "No fake PASS",
                  copy: "The RVC result is deterministic. If verification returns FAIL or STALE_ATTESTATION, the certificate is unusable and market access is blocked.",
                },
                {
                  number: "02",
                  title: "On-chain enforcement",
                  copy: "PolicyGate validates the certificate on X Layer Testnet. A frontend button disable is not the enforcement — the contract reverts unauthorized actions.",
                },
                {
                  number: "03",
                  title: "Machine-readable trust",
                  copy: "Applications consume structured verification state. AI explains the result but cannot authorize — only the certificate and PolicyGate decide.",
                },
              ].map((item) => (
                <article
                  key={item.number}
                  className="border-b border-edge p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 sm:p-6"
                >
                  <p className="font-mono text-[8px] text-brand">{item.number}</p>
                  <h3 className="mt-3 text-[11px] font-bold uppercase tracking-[0.09em] text-primary">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-[10px] leading-5 text-secondary">{item.copy}</p>
                </article>
              ))}
            </div>
          </section>

          <footer className="mt-5 flex flex-col gap-1 border-t border-edge py-4 text-[10px] leading-4 text-tertiary sm:flex-row sm:justify-between">
            <p>Market context is testnet-only. ProofLayer tool outputs remain authoritative.</p>
            <p>Verified Markets / X Layer Testnet</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
