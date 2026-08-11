import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AssetDetail } from "@/components/asset-detail";
import { Sidebar } from "@/components/sidebar";
import { getAssetBySlug } from "@/lib/assets";
import { getCertificateStatus } from "@/lib/certificate-status";
import { USDY_PASS_CERTIFICATE } from "@/lib/demo-data";
import { getOnchainDashboardData } from "@/lib/onchain";

type AssetPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: AssetPageProps): Promise<Metadata> {
  const { slug } = await params;
  const asset = getAssetBySlug(slug);

  if (asset === undefined) {
    return { title: "Asset not found" };
  }

  return {
    title: asset.name,
    description: `${asset.assetClass}: ${asset.claim}. ${asset.supportSummary}.`,
  };
}

export default async function AssetPage({ params }: AssetPageProps) {
  const { slug } = await params;
  const asset = getAssetBySlug(slug);

  if (asset === undefined) notFound();

  const onchain = asset.liveOnchainAvailable
    ? await getOnchainDashboardData(USDY_PASS_CERTIFICATE.solidity.certificateId, {
        includeDecision: false,
      })
    : null;
  const certificate = asset.fixtureAvailable ? USDY_PASS_CERTIFICATE : null;
  const certificateStatus = onchain === null ? null : getCertificateStatus(onchain);

  return (
    <div className="min-h-screen bg-[#0b0c10]">
      <Sidebar />
      <main className="lg:ml-[240px]">
        <div className="mx-auto max-w-[1280px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          <AssetDetail
            asset={asset}
            certificate={certificate}
            onchain={onchain}
            certificateStatus={certificateStatus}
          />

          <footer className="mt-5 flex flex-col gap-1 border-t border-white/[0.08] py-4 text-[10px] leading-4 text-[#747987] sm:flex-row sm:justify-between">
            <p>Contextual imagery does not represent source evidence for this asset.</p>
            <p>ProofLayer Asset Explorer / {asset.symbol}</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
