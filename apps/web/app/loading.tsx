import Image from "next/image";

export default function Loading() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#0b0c10] px-5 text-[#f7f7fa]">
      <div className="w-full max-w-md rounded-[10px] border border-white/[0.08] bg-[#111319] p-6">
        <div className="flex items-center gap-3">
          <Image src="/prooflayer-logo.png" alt="" width={36} height={36} priority />
          <div>
            <p className="text-sm font-semibold">ProofLayer</p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#747987]">RWA Trust Infrastructure</p>
          </div>
        </div>
        <div className="mt-6 h-px overflow-hidden bg-white/[0.07]">
          <div className="h-full w-1/2 animate-pulse bg-[#8b7ce7]" />
        </div>
        <p className="mt-4 text-[11px] leading-5 text-[#969ba8]">Loading demo fixtures and current read-only X Layer state&hellip;</p>
      </div>
    </main>
  );
}
