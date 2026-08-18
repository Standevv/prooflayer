import Image from "next/image";

export default function Loading() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 text-accent">
      <div className="w-full max-w-md rounded-[10px] border border-edge bg-surface p-6">
        <div className="flex items-center gap-3">
          <Image src="/prooflayer-logo.png" alt="" width={36} height={36} priority />
          <div>
            <p className="text-sm font-semibold">ProofLayer</p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-tertiary">RWA Trust Infrastructure</p>
          </div>
        </div>
        <div className="mt-6 h-px overflow-hidden bg-overlay-active">
          <div className="h-full w-1/2 animate-pulse bg-brand" />
        </div>
        <p className="mt-4 text-[11px] leading-5 text-secondary">Loading verification fixtures and current X Layer state&hellip;</p>
      </div>
    </main>
  );
}
