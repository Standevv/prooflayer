import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar";
import { getCertificateStatus } from "@/lib/certificate-status";
import { getCurrentVerification } from "@/lib/current-verification";
import { USDY_PASS_CERTIFICATE } from "@/lib/demo-data";
import { getOnchainDashboardData } from "@/lib/onchain";
import { buildTruthPresentation } from "@/lib/truth-presentation";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ProofLayer — Verification Infrastructure for Tokenized Real-World Assets",
  description:
    "ProofLayer verifies the evidence behind tokenized real-world assets and makes the resulting trust state enforceable by applications on X Layer.",
};

export const dynamic = "force-dynamic";

const pipeline = [
  { number: "01", label: "Evidence", description: "Normalized real-world evidence from institutional sources" },
  { number: "02", label: "Verify", description: "Deterministic policy evaluation against evidence" },
  { number: "03", label: "Certify", description: "On-chain certificate of verification state" },
  { number: "04", label: "Enforce", description: "PolicyGate blocks or allows protected actions" },
] as const;

export default async function OverviewPage() {
  const [onchain, currentVerification] = await Promise.all([
    getOnchainDashboardData(USDY_PASS_CERTIFICATE.solidity.certificateId, {
      includeDecision: false,
    }),
    getCurrentVerification("usdy"),
  ]);
  const certificateStatus = getCertificateStatus(onchain);
  const truth = buildTruthPresentation({
    currentVerification,
    historicalCertificateResult: USDY_PASS_CERTIFICATE.human.result,
    certificateStatus,
    currentCertificateUsable: onchain.usable,
  });

  const rvcResult = truth.currentRvcResult;
  const isBlocked = rvcResult === "FAIL" || rvcResult === "INDETERMINATE" || rvcResult === "UNAVAILABLE";

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:ml-[220px]">
        <div className="mx-auto max-w-[1200px] px-5 py-5 sm:px-6 lg:px-8 lg:py-6">
          {/* Hero */}
          <section className="hero-surface px-6 py-8 sm:px-8 sm:py-10 lg:px-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-brand">
                  ProofLayer
                </p>
                <h1 className="mt-3 text-[32px] font-semibold leading-none tracking-[-0.04em] text-primary sm:text-[40px]">
                  Verification Infrastructure
                </h1>
                <p className="mt-3 max-w-xl text-[13px] leading-6 text-secondary sm:text-[14px]">
                  ProofLayer verifies the evidence behind tokenized real-world assets and makes
                  the resulting trust state enforceable by applications on X Layer.
                </p>
              </div>
              <Link
                href="/verify"
                className="surface-transition flex h-10 shrink-0 items-center justify-center gap-2 rounded-[6px] border border-brand/30 bg-brand/[0.08] px-6 text-[12px] font-semibold text-brand-bright hover:bg-brand/[0.14] hover:border-brand/40"
              >
                View Verification
              </Link>
            </div>
          </section>

          {/* Pipeline */}
          <section className="mt-4 overflow-hidden border border-edge bg-surface">
            <div className="border-b border-edge px-6 py-4">
              <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-brand">
                Core pipeline
              </p>
              <h2 className="mt-1.5 text-[15px] font-semibold tracking-[-0.02em] text-primary">
                EVIDENCE → VERIFY → CERTIFY → ENFORCE
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-px bg-edge md:grid-cols-4">
              {pipeline.map((step) => (
                <div key={step.number} className="bg-surface px-5 py-5">
                  <span className="font-mono text-[8px] text-brand">{step.number}</span>
                  <p className="mt-2 text-[12px] font-bold uppercase tracking-[0.06em] text-primary">
                    {step.label}
                  </p>
                  <p className="mt-1.5 text-[10px] leading-4 text-secondary">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Current USDY State */}
          <section className="mt-4 overflow-hidden border border-edge bg-surface">
            <div className="border-b border-edge px-6 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-brand">
                  Current asset state
                </p>
                <span className="rounded-[3px] border border-success/20 bg-success-soft/[0.06] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-success">
                  USDY / TreasuryBacking
                </span>
              </div>
              <p className="mt-1 text-[10px] text-tertiary">
                Authoritative deterministic truth from ProofLayer RVC.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-px bg-edge sm:grid-cols-4">
              {[
                {
                  label: "Current RVC",
                  value: rvcResult,
                  tone: rvcResult === "PASS" ? "text-success" : rvcResult === "FAIL" ? "text-fail" : "text-warning",
                  sub: truth.currentRvcReasons.join(" · ") || "deterministic evaluation",
                },
                {
                  label: "Certificate",
                  value: onchain.registered ? (onchain.usable ? "USABLE" : "EXPIRED") : "NOT REGISTERED",
                  tone: onchain.usable ? "text-success" : "text-warning",
                  sub: `Historical: ${truth.historicalCertificateResult}`,
                },
                {
                  label: "PolicyGate",
                  value: isBlocked ? "BLOCK" : "ALLOW",
                  tone: isBlocked ? "text-warning" : "text-success",
                  sub: isBlocked ? "Enforcement active" : "Action permitted",
                },
                {
                  label: "Market",
                  value: isBlocked ? "RESTRICTED" : "ACCESSIBLE",
                  tone: isBlocked ? "text-warning" : "text-success",
                  sub: isBlocked ? "Verification required" : "Trading permitted",
                },
              ].map((item) => (
                <div key={item.label} className="bg-surface px-5 py-4">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-tertiary">
                    {item.label}
                  </p>
                  <p className={`mt-2 font-mono text-[14px] font-bold ${item.tone}`}>
                    {item.value}
                  </p>
                  <p className="mt-1 text-[9px] leading-3 text-secondary">{item.sub}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Consequence Chain */}
          {isBlocked && (
            <section className="mt-4 border border-warning/15 bg-warning/[0.02] px-6 py-5">
              <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-warning">
                Enforcement consequence
              </p>
              <h2 className="mt-2 text-[15px] font-semibold tracking-[-0.02em] text-primary">
                Why is the market restricted?
              </h2>
              <div className="mt-4 flex flex-col gap-2.5">
                {[
                  { step: "Evidence", detail: "Attestation data is stale or missing" },
                  { step: "Verification", detail: `RVC returned ${rvcResult}` },
                  { step: "Certificate", detail: onchain.usable ? "Certificate is usable" : "Certificate is not currently usable" },
                  { step: "PolicyGate", detail: "BLOCK — certificate not usable" },
                  { step: "Market", detail: "RESTRICTED — verification gate enforced" },
                ].map((item, i) => (
                  <div key={item.step} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-warning/25 bg-warning/[0.06] text-[8px] font-bold text-warning">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-[11px] font-semibold text-primary">{item.step}</p>
                      <p className="text-[10px] text-secondary">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href="/verify"
                  className="surface-transition flex h-9 items-center justify-center gap-2 rounded-[6px] border border-edge bg-surface px-4 text-[11px] font-semibold text-primary hover:bg-overlay-hover"
                >
                  View Verification
                </Link>
                <Link
                  href="/markets"
                  className="surface-transition flex h-9 items-center justify-center gap-2 rounded-[6px] border border-edge bg-surface px-4 text-[11px] font-semibold text-primary hover:bg-overlay-hover"
                >
                  View Markets
                </Link>
              </div>
            </section>
          )}

          <footer className="mt-5 border-t border-edge py-4 text-[9px] leading-4 text-tertiary">
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
              <p>ProofLayer deterministic verification. No wallet connection required.</p>
              <p>ProofLayer / X Layer Testnet</p>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
