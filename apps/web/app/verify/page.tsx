import type { Metadata } from "next";

import { Sidebar } from "@/components/sidebar";
import { ProofLayerWordmark } from "@/components/prooflayer-wordmark";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Verify — ProofLayer",
  description:
    "Inspect deployment, issuer framework, evidence provenance and deterministic ProofLayer verification for tokenized real-world assets on X Layer Mainnet.",
};

export const dynamic = "force-dynamic";

async function getRegistryStats() {
  try {
    const res = await fetch("http://127.0.0.1:8010/assets", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const assets = data.assets as Array<{
      deployed_on_xlayer: boolean;
      deployment_verified: boolean;
      framework_verified: boolean;
      backing_verified: boolean;
      rvc_status: string;
      verification_support: string;
      asset_origin: string;
      asset_class: string;
    }>;
    return {
      total: data.total as number,
      xLayerDeployed: assets.filter((a) => a.deployed_on_xlayer).length,
      contractsVerified: assets.filter((a) => a.deployment_verified).length,
      frameworkVerified: assets.filter((a) => a.framework_verified).length,
      backingVerified: assets.filter((a) => a.backing_verified).length,
      fullySupported: assets.filter((a) => a.verification_support === "FULLY_SUPPORTED").length,
      partiallySupported: assets.filter((a) => a.verification_support === "PARTIALLY_SUPPORTED").length,
      discoveredOnly: assets.filter((a) => a.verification_support === "DISCOVERED_ONLY").length,
      unsupported: assets.filter((a) => a.verification_support === "UNSUPPORTED").length,
      assetClasses: [...new Set(assets.map((a) => a.asset_class))].sort(),
    };
  } catch {
    return null;
  }
}

export default async function VerifyPage() {
  const stats = await getRegistryStats();

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
                  <ProofLayerWordmark className="h-[10px] tracking-[-0.02em]" variant="compact" />
                  <span className="text-[8px] text-tertiary">&middot;</span>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-brand">
                    X Layer Mainnet
                  </p>
                  <span className="rounded-[3px] border border-success/20 bg-success-soft/[0.06] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-success">
                    Chain 196
                  </span>
                </div>
                <h1 className="mt-3 text-[32px] font-semibold leading-none tracking-[-0.04em] text-primary sm:text-[40px]">
                  Verify X Layer RWAs
                </h1>
                <p className="mt-3 max-w-xl text-[13px] leading-6 text-secondary sm:text-[14px]">
                  Inspect deployment, issuer framework, evidence provenance and deterministic
                  ProofLayer verification for tokenized real-world assets on X Layer Mainnet.
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

          {/* Top Metrics */}
          {stats && (
            <section className="mt-4 overflow-hidden border border-edge bg-surface">
              <div className="border-b border-edge px-6 py-4">
                <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-brand">
                  Coverage overview
                </p>
                <p className="mt-1 text-[10px] text-tertiary">
                  ProofLayer verification coverage for X Layer Mainnet RWA assets.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-px bg-edge sm:grid-cols-4 lg:grid-cols-6">
                {[
                  { label: "RWA Discovered", value: String(stats.total), tone: "text-success" },
                  { label: "Contracts Verified", value: String(stats.contractsVerified), tone: "text-success" },
                  { label: "Framework Verified", value: String(stats.frameworkVerified), tone: "text-success" },
                  { label: "Backing Verified", value: String(stats.backingVerified), tone: "text-success" },
                  { label: "Fully Supported", value: String(stats.fullySupported), tone: "text-success" },
                  { label: "Partially Supported", value: String(stats.partiallySupported), tone: "text-warning" },
                ].map((item) => (
                  <div key={item.label} className="bg-surface px-5 py-4">
                    <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-tertiary">
                      {item.label}
                    </p>
                    <p className={`mt-2 font-mono text-[14px] font-bold ${item.tone}`}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Quick Links */}
          <section className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/assets"
              className="surface-transition flex h-10 items-center justify-center gap-2 rounded-[6px] border border-brand/30 bg-brand/[0.08] px-6 text-[12px] font-semibold text-brand-bright hover:bg-brand/[0.14] hover:border-brand/40"
            >
              Browse All Assets
            </Link>
            <Link
              href="/evidence"
              className="surface-transition flex h-10 items-center justify-center gap-2 rounded-[6px] border border-edge bg-surface px-6 text-[12px] font-semibold text-primary hover:bg-overlay-hover"
            >
              Evidence Explorer
            </Link>
            <Link
              href="/certificates"
              className="surface-transition flex h-10 items-center justify-center gap-2 rounded-[6px] border border-edge bg-surface px-6 text-[12px] font-semibold text-primary hover:bg-overlay-hover"
            >
              Certificate Explorer
            </Link>
            <Link
              href="/monitoring"
              className="surface-transition flex h-10 items-center justify-center gap-2 rounded-[6px] border border-edge bg-surface px-6 text-[12px] font-semibold text-primary hover:bg-overlay-hover"
            >
              Monitoring
            </Link>
          </section>

          {/* Reference Assets Note */}
          <section className="mt-4 overflow-hidden border border-edge bg-surface">
            <div className="px-6 py-5">
              <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-tertiary">
                Reference Verification
              </p>
              <h2 className="mt-2 text-[15px] font-semibold tracking-[-0.02em] text-primary">
                Cross-chain Evidence Examples
              </h2>
              <p className="mt-2 max-w-3xl text-[11px] leading-5 text-secondary">
                USDY (Ondo Treasury) and PAXG (Paxos Gold) are cross-chain reference assets verified
                via Ethereum mainnet reads. They are not deployed on X Layer but demonstrate
                ProofLayer&apos;s verification pipeline for real-world asset evidence.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/assets/usdy"
                  className="surface-transition rounded-[6px] border border-edge bg-surface px-4 py-2 text-[11px] font-semibold text-primary hover:bg-overlay-hover"
                >
                  USDY — TreasuryBacking
                </Link>
                <Link
                  href="/assets/paxg"
                  className="surface-transition rounded-[6px] border border-edge bg-surface px-4 py-2 text-[11px] font-semibold text-primary hover:bg-overlay-hover"
                >
                  PAXG — GoldBacking
                </Link>
              </div>
            </div>
          </section>

          <footer className="mt-5 border-t border-edge py-4 text-[9px] leading-4 text-tertiary">
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
              <p>Deterministic verification over evidence fixtures, live Ethereum reads, and X Layer on-chain state.</p>
              <p>ProofLayer Verify · RVC Authority · X Layer Mainnet (Chain 196)</p>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
