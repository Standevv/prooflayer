import Link from "next/link";

import { Sidebar } from "@/components/sidebar";

export default function AssetNotFound() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:ml-[240px]">
        <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6 lg:px-8">
          <section className="rounded-[10px] border border-edge bg-surface px-5 py-16 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-tertiary">Asset Explorer</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-success">Asset not found</h1>
            <p className="mt-2 text-[12px] text-tertiary">This asset is not present in the ProofLayer coverage registry.</p>
            <Link href="/assets" className="mt-5 inline-flex text-[11px] font-semibold text-accent hover:text-brand-bright">
              Return to Asset Explorer
            </Link>
          </section>
        </div>
      </main>
    </div>
  );
}
