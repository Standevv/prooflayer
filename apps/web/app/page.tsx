import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar";
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

async function getRwaStats() {
  try {
    const res = await fetch("http://127.0.0.1:8010/assets", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      total: data.total as number,
      xLayerDeployed: (data.assets as Array<{ deployed_on_xlayer: boolean }>).filter((a) => a.deployed_on_xlayer).length,
      contractsVerified: (data.assets as Array<{ deployment_verified: boolean }>).filter((a) => a.deployment_verified).length,
    };
  } catch {
    return null;
  }
}

export default async function OverviewPage() {
  const rwaStats = await getRwaStats();

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
                Explore X Layer RWAs
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

          {/* X Layer RWA Stats */}
          {rwaStats && (
            <section className="mt-4 overflow-hidden border border-edge bg-surface">
              <div className="border-b border-edge px-6 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-brand">
                    X Layer Mainnet
                  </p>
                  <span className="rounded-[3px] border border-success/20 bg-success-soft/[0.06] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-success">
                    Chain 196
                  </span>
                </div>
                <p className="mt-1 text-[10px] text-tertiary">
                  Real-world assets discovered and verified on X Layer Mainnet.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-px bg-edge">
                {[
                  {
                    label: "RWA Assets Discovered",
                    value: String(rwaStats.total),
                  },
                  {
                    label: "Contracts Verified",
                    value: String(rwaStats.contractsVerified),
                  },
                  {
                    label: "X Layer Deployed",
                    value: String(rwaStats.xLayerDeployed),
                  },
                ].map((item) => (
                  <div key={item.label} className="bg-surface px-5 py-4">
                    <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-tertiary">
                      {item.label}
                    </p>
                    <p className="mt-2 font-mono text-[14px] font-bold text-success">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* CTAs */}
          <section className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/verify"
              className="surface-transition flex h-10 items-center justify-center gap-2 rounded-[6px] border border-brand/30 bg-brand/[0.08] px-6 text-[12px] font-semibold text-brand-bright hover:bg-brand/[0.14] hover:border-brand/40"
            >
              Verify X Layer Assets
            </Link>
            <Link
              href="/assets"
              className="surface-transition flex h-10 items-center justify-center gap-2 rounded-[6px] border border-edge bg-surface px-6 text-[12px] font-semibold text-primary hover:bg-overlay-hover"
            >
              Asset Explorer
            </Link>
            <Link
              href="/markets"
              className="surface-transition flex h-10 items-center justify-center gap-2 rounded-[6px] border border-edge bg-surface px-6 text-[12px] font-semibold text-primary hover:bg-overlay-hover"
            >
              View Markets
            </Link>
          </section>

          <footer className="mt-5 border-t border-edge py-4 text-[9px] leading-4 text-tertiary">
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
              <p>ProofLayer deterministic verification. No wallet connection required.</p>
              <p>ProofLayer / X Layer Mainnet (Chain 196)</p>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
