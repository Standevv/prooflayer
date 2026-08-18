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
      <main className="lg:ml-[240px]">
        <div className="mx-auto max-w-[1280px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          {/* Header */}
          <section className="hero-surface rounded-[10px] border border-edge px-5 py-8 sm:px-7 sm:py-10 lg:px-9">
            <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">
                    Deterministic verification
                  </p>
                  <span className="rounded-[3px] border border-success/20 bg-success-soft/[0.045] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-success">
                    X Layer Testnet
                  </span>
                </div>
                <h1 className="mt-3 text-[38px] font-semibold leading-none tracking-[-0.052em] text-accent sm:text-[48px]">
                  Verify
                </h1>
                <p className="mt-4 max-w-2xl text-[13px] leading-6 text-primary sm:text-[14px]">
                  Run verification against real-world evidence. Inspect the deterministic result,
                  certificate state, and PolicyGate enforcement.
                </p>
              </div>
              <div className="overflow-hidden rounded-[9px] border border-edge bg-surface/65">
                <div className="border-b border-edge px-4 py-3">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">
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

          {/* Verify workspace */}
          <div className="mt-4">
            <section className="overflow-hidden rounded-[10px] border border-edge bg-surface">
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

          {/* AI Intelligence (optional) */}
          <div className="mt-4">
            <section className="overflow-hidden rounded-[10px] border border-edge bg-surface">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-edge px-5 py-4 sm:px-6">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-tertiary">
                    Optional
                  </p>
                  <h2 className="mt-1 text-xl font-bold tracking-[-0.03em] text-brand-bright">
                    AI Investigation
                  </h2>
                </div>
                <p className="text-[11px] text-tertiary">
                  AI explains · RVC decides · PolicyGate enforces
                </p>
              </div>
              <VerificationAgent />
            </section>
          </div>

          <footer className="mt-5 flex flex-col gap-1 border-t border-edge py-4 text-[10px] leading-4 text-tertiary sm:flex-row sm:justify-between">
            <p>Deterministic verification over evidence fixtures and live X Layer reads.</p>
            <p>ProofLayer Verify / X Layer Testnet</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
