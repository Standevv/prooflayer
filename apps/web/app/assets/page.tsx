import type { Metadata } from "next";

import { AssetExplorer } from "@/components/asset-explorer";
import { Sidebar } from "@/components/sidebar";
import { getCertificateStatus } from "@/lib/certificate-status";
import { USDY_PASS_CERTIFICATE } from "@/lib/demo-data";
import { getOnchainDashboardData } from "@/lib/onchain";

export const metadata: Metadata = {
  title: "Asset Explorer",
  description:
    "Explore real-world assets and verification claims covered by ProofLayer infrastructure.",
};

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const onchain = await getOnchainDashboardData(
    USDY_PASS_CERTIFICATE.solidity.certificateId,
    { includeDecision: false },
  );
  const certificateStatus = getCertificateStatus(onchain);

  return (
    <div className="min-h-screen bg-[#0b0c10]">
      <Sidebar />
      <main className="lg:ml-[240px]">
        <div className="mx-auto max-w-[1280px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <section className="hero-surface rounded-[10px] border border-white/[0.08] px-5 py-8 sm:px-7 sm:py-10 lg:px-9">
            <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f84dd]">
                  ProofLayer coverage registry
                </p>
                <h1 className="mt-3 text-[38px] font-semibold leading-none tracking-[-0.052em] text-[#f7f7fa] sm:text-[48px]">
                  Asset Explorer
                </h1>
                <p className="mt-4 max-w-2xl text-[13px] leading-6 text-[#b1b5bf] sm:text-[14px]">
                  Real-world assets and claims covered by ProofLayer verification infrastructure.
                </p>
              </div>
              <div className="grid grid-cols-3 overflow-hidden rounded-[9px] border border-white/[0.09] bg-black/15">
                {[
                  { label: "Assets", value: "05" },
                  { label: "Demo fixtures", value: "01" },
                  { label: "Live certificates", value: onchain.registered ? "01" : "--" },
                ].map((item) => (
                  <div key={item.label} className="border-r border-white/[0.08] px-4 py-3 last:border-r-0">
                    <p className="font-mono text-[15px] font-semibold text-[#e1e6e3]">{item.value}</p>
                    <p className="mt-1 text-[8px] uppercase tracking-[0.09em] text-[#747987]">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="mt-4">
            <AssetExplorer
              usdyState={{
                connected: onchain.connected,
                registered: onchain.registered,
                usable: onchain.usable,
                certificateStatus,
                result: USDY_PASS_CERTIFICATE.human.result as "PASS",
              }}
            />
          </div>

          <footer className="mt-5 flex flex-col gap-1 border-t border-white/[0.08] py-4 text-[10px] leading-4 text-[#747987] sm:flex-row sm:justify-between">
            <p>Authenticity labels separate fixture, live, and conceptual coverage.</p>
            <p>ProofLayer Asset Explorer / X Layer Testnet</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
