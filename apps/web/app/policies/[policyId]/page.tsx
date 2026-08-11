import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PolicyDetailView } from "@/components/policy-detail";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = { title: "Policy Detail", description: "Inspect and evaluate an exact versioned ProofLayer institutional policy." };
const POLICY_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;

export default async function PolicyDetailPage({ params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = await params;
  if (!POLICY_ID.test(policyId)) notFound();
  return <div className="min-h-screen bg-[#0b0c10]"><Sidebar /><main className="lg:ml-[240px]"><div className="mx-auto max-w-[1240px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6"><PolicyDetailView policyId={policyId} /><footer className="mt-5 flex flex-col gap-1 border-t border-white/[0.08] py-4 text-[10px] leading-4 text-[#747987] sm:flex-row sm:justify-between"><p>Authoritative fact · Custom requirements · Deterministic decision</p><p>No wallet · No transaction · No OpenAI</p></footer></div></main></div>;
}
