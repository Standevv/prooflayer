import type { Metadata } from "next";

import { EvidenceAssetExplorer } from "@/components/evidence-asset-explorer";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "Evidence Detail",
  description: "Inspect an asset's normalized evidence and provenance graph.",
};

export default async function EvidenceAssetPage({
  params,
}: {
  params: Promise<{ asset: string }>;
}) {
  const { asset } = await params;
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:ml-[240px]">
        <div className="mx-auto max-w-[1320px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <EvidenceAssetExplorer asset={asset} />
        </div>
      </main>
    </div>
  );
}
