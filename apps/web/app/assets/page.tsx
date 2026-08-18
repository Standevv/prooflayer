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
      <main className="lg:ml-[220px]">
        <div className="mx-auto max-w-[1200px] px-5 py-5 sm:px-6 lg:px-8 lg:py-6">
          <section className="hero-surface px-6 py-8 sm:px-8 sm:py-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-brand">
                  ProofLayer coverage registry
                </p>
                <h1 className="mt-3 text-[32px] font-semibold leading-none tracking-[-0.04em] text-primary sm:text-[40px]">
                  Asset Explorer
                </h1>
                <p className="mt-3 max-w-xl text-[13px] leading-6 text-secondary sm:text-[14px]">
                  Real-world assets and claims covered by ProofLayer verification infrastructure.
                </p>
              </div>
              <div className="grid grid-cols-3 overflow-hidden border border-edge bg-surface/80">
                {[
                  { label: "Assets", value: "05" },
                  { label: "Fixtures", value: "01" },
                  { label: "Live certificates", value: onchain.registered ? "01" : "--" },
                ].map((item) => (
                  <div key={item.label} className="border-r border-edge px-4 py-3 last:border-r-0">
                    <p className="font-mono text-[14px] font-semibold text-primary">{item.value}</p>
                    <p className="mt-1 text-[7px] uppercase tracking-[0.1em] text-tertiary">{item.label}</p>
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

          <footer className="mt-5 border-t border-edge py-4 text-[9px] leading-4 text-tertiary">
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
              <p>Authenticity labels separate fixture, live, and conceptual coverage.</p>
              <p>ProofLayer Asset Explorer / X Layer Testnet</p>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
