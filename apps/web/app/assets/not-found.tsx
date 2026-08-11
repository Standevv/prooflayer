import Link from "next/link";

import { Sidebar } from "@/components/sidebar";

export default function AssetNotFound() {
  return (
    <div className="min-h-screen bg-[#0b0c10]">
      <Sidebar />
      <main className="lg:ml-[240px]">
        <div className="mx-auto max-w-[1280px] px-4 py-10 sm:px-6 lg:px-8">
          <section className="rounded-[10px] border border-white/[0.08] bg-[#111319] px-5 py-16 text-center">
            <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#747987]">Asset Explorer</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#eef2ef]">Asset not found</h1>
            <p className="mt-2 text-[12px] text-[#7f8a83]">This asset is not present in the ProofLayer coverage registry.</p>
            <Link href="/assets" className="mt-5 inline-flex text-[11px] font-semibold text-[#a99fee] hover:text-[#c5bef5]">
              Return to Asset Explorer
            </Link>
          </section>
        </div>
      </main>
    </div>
  );
}
