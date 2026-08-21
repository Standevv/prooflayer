import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar";
import { HeroWordmark } from "@/components/hero-wordmark";
import Image from "next/image";
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
          {/* Hero — compact premium composition */}
          <section className="hero-surface relative overflow-hidden px-5 py-5 sm:px-8 sm:py-6 lg:px-10 lg:py-8">
            {/* Top accent line */}
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-brand/40 to-transparent" />

            {/* Background wordmark — oversized, subtle */}
            <HeroWordmark />

            {/* Main content grid */}
            <div className="relative z-10 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
              {/* Left: branding + headline + description */}
              <div>
                {/* Brand logo */}
                <Image
                  src="/prooflayer-logo.png"
                  alt="ProofLayer"
                  width={1200}
                  height={400}
                  sizes="(max-width: 640px) 55vw, (max-width: 1024px) 45vw, 420px"
                  className="h-[48px] w-auto sm:h-[56px] lg:h-[64px]"
                  priority
                />

                {/* Tagline */}
                <div className="mt-3 flex items-center gap-2.5">
                  <span className="h-px w-6 bg-brand/30" />
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-brand/60 sm:text-[11px] lg:text-[12px]">
                    Evidence &rarr; Verification &rarr; Intelligence &rarr; Action
                  </p>
                </div>

                {/* Network badge */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-brand">
                    X Layer Mainnet
                  </span>
                  <span className="rounded-[3px] border border-success/20 bg-success-soft/[0.06] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-success">
                    Chain 196
                  </span>
                  {rwaStats && (
                    <span className="text-[8px] font-medium text-tertiary">
                      {rwaStats.total} assets discovered
                    </span>
                  )}
                </div>

                {/* Headline */}
                <h1 className="mt-3 text-[32px] font-bold leading-[1.02] tracking-[-0.03em] text-primary sm:text-[40px] lg:text-[48px]">
                  Verify what backs the asset.
                </h1>

                {/* Description */}
                <p className="mt-3 max-w-[520px] text-[13px] leading-[1.6] text-secondary sm:text-[14px]">
                  Evidence-grounded verification infrastructure for tokenized real-world assets on X Layer.
                  Every claim traced to source. Every trust state deterministic.
                </p>

                {/* CTAs — directly under description */}
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href="/assets"
                    className="surface-transition flex h-9 items-center justify-center gap-2 rounded-[6px] border border-brand/40 bg-brand/[0.12] px-5 text-[11px] font-bold uppercase tracking-[0.06em] text-brand-bright hover:bg-brand/[0.2] hover:border-brand/50"
                  >
                    Explore RWA Assets
                  </Link>
                  <Link
                    href="/verify"
                    className="surface-transition flex h-9 items-center justify-center gap-2 rounded-[6px] border border-edge bg-surface px-5 text-[11px] font-semibold text-secondary hover:bg-overlay-hover hover:text-primary"
                  >
                    How ProofLayer Works
                  </Link>
                </div>
              </div>

              {/* Right: compact stats (desktop only) */}
              {rwaStats && (
                <div className="hidden lg:block">
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      { label: "Assets", value: String(rwaStats.total) },
                      { label: "Verified", value: String(rwaStats.contractsVerified) },
                      { label: "Deployed", value: String(rwaStats.xLayerDeployed) },
                    ].map((item) => (
                      <div key={item.label} className="text-right">
                        <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-tertiary">
                          {item.label}
                        </p>
                        <p className="font-mono text-[20px] font-bold text-success">
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Pipeline */}
          <section className="mt-3 overflow-hidden border border-edge bg-surface">
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
