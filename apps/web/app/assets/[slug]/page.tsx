import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AssetDetail } from "@/components/asset-detail";
import { Sidebar } from "@/components/sidebar";
import {
  fetchAssetDetail,
  slugToSymbol,
  type ApiAssetDetail,
} from "@/lib/assets-api";

type AssetPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: AssetPageProps): Promise<Metadata> {
  const { slug } = await params;
  const symbol = slugToSymbol(slug);
  const asset = await fetchAssetDetail(symbol);
  if (!asset) return { title: "Asset not found" };
  return {
    title: `${asset.symbol} — ${asset.name}`,
    description: `${asset.asset_class}: ${asset.description}`,
  };
}

export default async function AssetPage({ params }: AssetPageProps) {
  const { slug } = await params;
  const symbol = slugToSymbol(slug);
  const asset = await fetchAssetDetail(symbol);

  if (!asset) notFound();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:ml-[240px]">
        <div className="mx-auto max-w-[1280px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <AssetDetail asset={asset} />

          <footer className="mt-5 flex flex-col gap-1 border-t border-edge py-4 text-[10px] leading-4 text-tertiary sm:flex-row sm:justify-between">
            <p>
              Contextual imagery does not represent source evidence for this
              asset.
            </p>
            <p>
              ProofLayer Asset Explorer / {asset.symbol}
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}
