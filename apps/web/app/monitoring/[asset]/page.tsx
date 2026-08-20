import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AssetMonitor } from "@/components/asset-monitor";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = { title: "Asset Monitor", description: "Inspect persisted ProofLayer trust snapshots and factual state transitions." };

export default async function AssetMonitoringPage({ params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  const normalized = asset.toLowerCase();
  if (normalized !== "usdy" && normalized !== "paxg") notFound();
  return <div className="min-h-screen bg-background"><Sidebar /><main className="lg:ml-[220px]"><div className="mx-auto max-w-[1240px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6"><AssetMonitor asset={normalized} /><footer className="mt-5 flex flex-col gap-1 border-t border-edge py-4 text-[10px] leading-4 text-tertiary sm:flex-row sm:justify-between"><p>Deterministic snapshots · Factual transitions · Local JSONL history</p><p>No blockchain writes · No OpenAI calls</p></footer></div></main></div>;
}
