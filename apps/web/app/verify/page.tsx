import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar";
import { getCertificateStatus } from "@/lib/certificate-status";
import { getCurrentVerification } from "@/lib/current-verification";
import { USDY_PASS_CERTIFICATE } from "@/lib/demo-data";
import { getOnchainDashboardData } from "@/lib/onchain";
import { VerifyPanel } from "@/components/verify-panel";
import { ResultSemantics } from "@/components/result-semantics";
import { VerificationAgent } from "@/components/verification-agent";
import { EvidencePanel } from "@/components/evidence-panel";
import { CertificateCard } from "@/components/certificate-card";
import { PolicyGateFlow } from "@/components/policy-gate-flow";
import { OnchainStatus } from "@/components/onchain-status";
import { DecisionLogPanel } from "@/components/decision-log";

export const metadata: Metadata = {
  title: "Verify — ProofLayer",
  description:
    "Run deterministic verification against real-world asset evidence. Inspect evidence, provenance, certificate state, and PolicyGate enforcement.",
};

export const dynamic = "force-dynamic";

export default async function VerifyPage() {
  const [onchain, currentVerification] = await Promise.all([
    getOnchainDashboardData(USDY_PASS_CERTIFICATE.solidity.certificateId, {
      includeDecision: false,
    }),
    getCurrentVerification("usdy"),
  ]);
  const certificateStatus = getCertificateStatus(onchain);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:ml-[220px]">
        <div className="mx-auto max-w-[1200px] px-5 py-5 sm:px-6 lg:px-8 lg:py-6">
          {/* Header */}
          <section className="hero-surface px-6 py-8 sm:px-8 sm:py-10 lg:px-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-brand">
                    Deterministic verification
                  </p>
                  <span className="rounded-[3px] border border-success/20 bg-success-soft/[0.06] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-success">
                    X Layer Testnet
                  </span>
                </div>
                <h1 className="mt-3 text-[32px] font-semibold leading-none tracking-[-0.04em] text-primary sm:text-[40px]">
                  Verify
                </h1>
                <p className="mt-3 max-w-xl text-[13px] leading-6 text-secondary sm:text-[14px]">
                  Run verification against real-world evidence. Inspect the deterministic result,
                  certificate state, and PolicyGate enforcement.
                </p>
              </div>
              <div className="overflow-hidden border border-edge bg-surface/80">
                <div className="border-b border-edge px-4 py-3">
                  <p className="text-[7px] font-semibold uppercase tracking-[0.12em] text-tertiary">
                    Verification pipeline
                  </p>
                </div>
                <ol className="grid grid-cols-4">
                  {[
                    ["01", "Evidence"],
                    ["02", "RVC"],
                    ["03", "Certificate"],
                    ["04", "PolicyGate"],
                  ].map(([number, label]) => (
                    <li key={number} className="border-r border-edge px-3 py-3 last:border-r-0">
                      <span className="font-mono text-[7px] text-tertiary">{number}</span>
                      <span className="mt-1 block text-[7px] font-semibold uppercase tracking-[0.08em] text-secondary">
                        {label}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </section>

          {/* Verify workspace */}
          <div className="mt-4">
            <section className="overflow-hidden border border-edge bg-surface">
              <VerifyPanel
                asset="USDY"
                currentVerification={currentVerification}
              />
              <ResultSemantics
                certificate={USDY_PASS_CERTIFICATE}
                certificateStatus={certificateStatus}
                currentCertificateUsable={onchain.usable}
                currentVerification={currentVerification}
              />
            </section>
          </div>

          {/* Evidence */}
          <div className="mt-4">
            <EvidencePanel certificate={USDY_PASS_CERTIFICATE} />
          </div>

          {/* Certificate + PolicyGate */}
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <CertificateCard certificate={USDY_PASS_CERTIFICATE} onchain={onchain} certificateStatus={certificateStatus} />
            <PolicyGateFlow />
          </div>

          {/* On-chain status */}
          <div className="mt-4">
            <OnchainStatus data={onchain} />
          </div>

          {/* Decision log */}
          <div className="mt-4">
            <DecisionLogPanel data={onchain} />
          </div>

          {/* AI Intelligence */}
          <div className="mt-4">
            <section className="overflow-hidden border border-edge bg-surface">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-edge px-6 py-4">
                <div>
                  <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-tertiary">
                    Optional
                  </p>
                  <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-brand-bright">
                    AI Investigation
                  </h2>
                </div>
                <p className="text-[10px] text-tertiary">
                  AI explains · RVC decides · PolicyGate enforces
                </p>
              </div>
              <VerificationAgent />
            </section>
          </div>

          <footer className="mt-5 border-t border-edge py-4 text-[9px] leading-4 text-tertiary">
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
              <p>Deterministic verification over evidence fixtures and live X Layer reads.</p>
              <p>ProofLayer Verify / X Layer Testnet</p>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
