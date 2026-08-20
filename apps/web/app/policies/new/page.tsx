import type { Metadata } from "next";
import Link from "next/link";

import { PolicyBuilder } from "@/components/policy-builder";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = { title: "Create Policy", description: "Create a typed, versioned institutional policy over ProofLayer verification." };

export default async function NewPolicyPage({ searchParams }: { searchParams: Promise<{ preset?: string }> }) {
  const { preset } = await searchParams;
  return <div className="min-h-screen bg-background"><Sidebar /><main className="lg:ml-[220px]"><div className="mx-auto max-w-[1240px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6"><header className="command-header relative overflow-hidden rounded-[9px] border border-edge px-5 py-7 sm:px-7 sm:py-8"><div className="relative z-10 max-w-3xl"><Link href="/policies" className="text-[9px] font-semibold uppercase tracking-[0.12em] text-brand hover:text-accent">← Policy Studio</Link><h1 className="mt-4 text-[34px] font-semibold leading-none tracking-[-0.052em] text-accent sm:text-[44px]">Create Institutional Policy</h1><p className="mt-3 max-w-2xl text-[12px] leading-5 text-secondary">Configure requirements above ProofLayer’s authoritative verification layer. Typed fields only—no expressions or executable code.</p></div></header><div className="mt-4"><PolicyBuilder presetId={preset} /></div><footer className="mt-5 flex flex-col gap-1 border-t border-edge py-4 text-[10px] leading-4 text-tertiary sm:flex-row sm:justify-between"><p>Structured configuration · Deterministic commitment</p><p>MVP / Pre-production · Local persistence</p></footer></div></main></div>;
}
