import type { Metadata } from "next";

import { AssetExplorer } from "@/components/asset-explorer";
import { ProofLayerWordmark } from "@/components/prooflayer-wordmark";
import { Sidebar } from "@/components/sidebar";
import { fetchAssets } from "@/lib/assets-api";

export const metadata: Metadata = {
  title: "Asset Explorer",
  description:
    "Explore real-world assets and verification claims covered by ProofLayer infrastructure.",
};

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  let assets: Awaited<ReturnType<typeof fetchAssets>> | null = null;
  try {
    assets = await fetchAssets();
  } catch {
    // Backend may not be running — show empty state
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:ml-[220px]">
        <div className="mx-auto max-w-[1200px] px-5 py-5 sm:px-6 lg:px-8 lg:py-6">
          <section className="hero-surface px-6 py-8 sm:px-8 sm:py-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ProofLayerWordmark className="h-[10px] tracking-[-0.02em]" variant="compact" />
                  <span className="text-[8px] text-tertiary">&middot;</span>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-brand">
                    Coverage Registry
                  </p>
                </div>
                <h1 className="mt-3 text-[32px] font-semibold leading-none tracking-[-0.04em] text-primary sm:text-[40px]">
                  Asset Explorer
                </h1>
                <p className="mt-3 max-w-xl text-[13px] leading-6 text-secondary sm:text-[14px]">
                  {assets
                    ? `${assets.total} real-world assets with verification depth on X Layer.`
                    : "Real-world assets and claims covered by ProofLayer verification infrastructure."}
                </p>
              </div>
              {assets && (
                <div className="grid grid-cols-4 overflow-hidden border border-edge bg-surface/80">
                  {[
                    { label: "Assets", value: String(assets.total).padStart(2, "0") },
                    {
                      label: "X Layer",
                      value: String(
                        assets.assets.filter((a) => a.deployed_on_xlayer).length,
                      ).padStart(2, "0"),
                    },
                    {
                      label: "Reference",
                      value: String(
                        assets.assets.filter(
                          (a) => a.asset_origin === "CROSS_CHAIN_REFERENCE",
                        ).length,
                      ).padStart(2, "0"),
                    },
                    { label: "Chain", value: "196" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="border-r border-edge px-4 py-3 last:border-r-0"
                    >
                      <p className="font-mono text-[14px] font-semibold text-primary">
                        {item.value}
                      </p>
                      <p className="mt-1 text-[7px] uppercase tracking-[0.1em] text-tertiary">
                        {item.label}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <div className="mt-4">
            <AssetExplorer
              apiAssets={assets?.assets ?? []}
              apiTotal={assets?.total ?? 0}
            />
          </div>

          <footer className="mt-5 border-t border-edge py-4 text-[9px] leading-4 text-tertiary">
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
              <p>
                Authenticity labels separate fixture, live, and conceptual
                coverage.
              </p>
              <p>ProofLayer Asset Explorer / X Layer Mainnet</p>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
