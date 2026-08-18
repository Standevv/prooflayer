import type { Metadata } from "next";

import { ProtocolIntegrationSandbox } from "@/components/protocol-integration-sandbox";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "Protocol Integration Sandbox",
  description:
    "Simulate how another protocol can consume current ProofLayer verification and enforcement state.",
};

const integrationExample = `const response = await fetch("/api/protocol/check", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    protocol_type: "lending",
    asset: "USDY",
    claim: "TreasuryBacking",
    action: "accept_as_collateral"
  })
});

const result = await response.json();

if (result.final_protocol_recommendation === "ACCEPT") {
  // Continue the protocol action.
}`;

const useCases = [
  {
    number: "01",
    title: "Lending",
    copy: "Prevent stale or unverifiable RWAs from being accepted as collateral.",
  },
  {
    number: "02",
    title: "RWA Vaults",
    copy: "Require ProofLayer verification before admitting an asset into a vault.",
  },
  {
    number: "03",
    title: "Treasury Management",
    copy: "Check backing evidence and certificate state before allocation.",
  },
] as const;

export default function IntegrationsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:ml-[240px]">
        <div className="mx-auto max-w-[1280px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <section className="hero-surface rounded-[10px] border border-edge px-5 py-8 sm:px-7 sm:py-10 lg:px-9">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">
                    Integration surface / read only
                  </p>
                  <span className="rounded-[3px] border border-success/20 bg-success-soft/[0.045] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-success">
                    X Layer Testnet
                  </span>
                </div>
                <h1 className="mt-4 max-w-3xl text-[36px] font-semibold leading-[0.98] tracking-[-0.052em] text-accent sm:text-[48px] lg:text-[54px]">
                  Protocol Integration Sandbox
                </h1>
                <p className="mt-5 max-w-2xl text-[13px] leading-6 text-primary sm:text-[14px]">
                  See how another protocol can use ProofLayer verification before accepting an RWA.
                </p>
                <p className="mt-2 max-w-2xl text-[11px] leading-5 text-tertiary">
                  Simulate how a protocol would use ProofLayer before accepting a tokenized
                  real-world asset. Protocol context is simulated; marked verification and X Layer
                  state comes from the existing read-only stack.
                </p>
              </div>

              <div className="overflow-hidden rounded-[9px] border border-edge bg-surface/65">
                <div className="border-b border-edge px-4 py-3">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">
                    Acceptance path
                  </p>
                </div>
                <ol className="grid grid-cols-4">
                  {[
                    ["01", "Claim"],
                    ["02", "Certificate"],
                    ["03", "PolicyGate"],
                    ["04", "Decision"],
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

          <div className="mt-4">
            <ProtocolIntegrationSandbox />
          </div>

          <section className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
            <div className="overflow-hidden rounded-[10px] border border-edge bg-surface">
              <div className="border-b border-edge px-5 py-4 sm:px-6">
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-brand">
                  How a protocol would integrate
                </p>
                <h2 className="mt-1.5 text-lg font-semibold tracking-[-0.025em] text-primary">
                  Consume the structured decision over HTTP
                </h2>
                <p className="mt-2 text-[10px] leading-5 text-tertiary">
                  The example uses the actual backend endpoint and response field. No fictional SDK
                  package is required.
                </p>
              </div>
              <pre className="overflow-x-auto bg-surface p-5 text-[9px] leading-[1.75] text-accent sm:p-6">
                <code>{integrationExample}</code>
              </pre>
            </div>

            <div className="rounded-[10px] border border-brand/15 bg-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-brand">
                  On-chain enforcement
                </p>
                <span className="rounded-[3px] border border-success/20 bg-success-soft/[0.045] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-success">
                  Live contract
                </span>
              </div>
              <h2 className="mt-2 text-lg font-semibold tracking-[-0.025em] text-primary">
                X Layer Testnet enforcement path
              </h2>
              <ol className="mt-5 overflow-hidden rounded-[8px] border border-edge bg-surface">
                {[
                  ["External smart contract", "Protocol-owned action"],
                  ["ProofLayer PolicyGate", "Current policy conditions"],
                  ["CertificateRegistry", "Certificate usability"],
                  ["ALLOW / BLOCK", "Enforced result"],
                ].map(([title, detail], index) => (
                  <li key={title} className="relative border-b border-edge px-4 py-3 last:border-b-0">
                    <p className="text-[10px] font-semibold text-primary">{title}</p>
                    <p className="mt-0.5 text-[8px] text-tertiary">{detail}</p>
                    {index < 3 ? (
                      <span className="absolute -bottom-2 left-1/2 z-10 -translate-x-1/2 bg-surface px-1 text-[10px] text-brand">
                        ↓
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
              <div className="mt-4">
                <p className="text-[8px] font-semibold uppercase tracking-[0.09em] text-tertiary">
                  PolicyGate / chain 1952
                </p>
                <p className="mt-1 break-all font-mono text-[8px] leading-4 text-accent">
                  0x8e07048285D5f54a3D1D2093b80F4Aa2ce75C645
                </p>
              </div>
            </div>
          </section>

          <section className="mt-4 overflow-hidden rounded-[10px] border border-edge bg-surface">
            <div className="border-b border-edge px-5 py-4 sm:px-6">
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-tertiary">
                Integration contexts
              </p>
              <h2 className="mt-1.5 text-lg font-semibold tracking-[-0.025em] text-primary">
                One trust policy, three protocol use cases
              </h2>
              <p className="mt-2 text-[10px] leading-5 text-tertiary">
                Presets differ only by use-case context and intended action. They do not introduce
                protocol-specific financial rules.
              </p>
            </div>
            <div className="grid md:grid-cols-3">
              {useCases.map((item) => (
                <article key={item.number} className="border-b border-edge p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 sm:p-6">
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
            <p>Protocol context is simulated. ProofLayer tool outputs remain authoritative.</p>
            <p>Protocol Integration Sandbox / X Layer Testnet</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
