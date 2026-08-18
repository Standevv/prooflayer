import type { Metadata } from "next";

import { AssetExplorer } from "@/components/asset-explorer";
import { Sidebar } from "@/components/sidebar";
import { getCertificateStatus } from "@/lib/certificate-status";
import { getCurrentVerification } from "@/lib/current-verification";
import { USDY_PASS_CERTIFICATE } from "@/lib/demo-data";
import { getOnchainDashboardData } from "@/lib/onchain";
import { buildTruthPresentation } from "@/lib/truth-presentation";

export const metadata: Metadata = {
  title: "Asset Explorer",
  description:
    "Explore real-world assets and verification claims covered by ProofLayer infrastructure.",
};

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
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

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:ml-[240px]">
        <div className="mx-auto max-w-[1280px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <section className="hero-surface rounded-[10px] border border-edge px-5 py-8 sm:px-7 sm:py-10 lg:px-9">
            <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">
                  ProofLayer coverage registry
                </p>
                <h1 className="mt-3 text-[38px] font-semibold leading-none tracking-[-0.052em] text-accent sm:text-[48px]">
                  Asset Explorer
                </h1>
                <p className="mt-4 max-w-2xl text-[13px] leading-6 text-primary sm:text-[14px]">
                  Real-world assets and claims covered by ProofLayer verification infrastructure.
                </p>
              </div>
              <div className="grid grid-cols-3 overflow-hidden rounded-[9px] border border-edge bg-scrim">
                {[
                  { label: "Assets", value: "05" },
                  { label: "Fixtures", value: "01" },
                  { label: "Live certificates", value: onchain.registered ? "01" : "--" },
                ].map((item) => (
                  <div key={item.label} className="border-r border-edge px-4 py-3 last:border-r-0">
                    <p className="font-mono text-[15px] font-semibold text-primary">{item.value}</p>
                    <p className="mt-1 text-[8px] uppercase tracking-[0.09em] text-tertiary">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="mt-4">
            <AssetExplorer
              usdyState={{
                currentRvcResult: truth.currentRvcResult,
                currentRvcReasons: truth.currentRvcReasons,
                historicalCertificateResult: truth.historicalCertificateResult,
                currentCertificateUsability: truth.currentCertificateUsability,
              }}
            />
          </div>

          <footer className="mt-5 flex flex-col gap-1 border-t border-edge py-4 text-[10px] leading-4 text-tertiary sm:flex-row sm:justify-between">
            <p>Authenticity labels separate fixture, live, and conceptual coverage.</p>
            <p>ProofLayer Asset Explorer / X Layer Testnet</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
