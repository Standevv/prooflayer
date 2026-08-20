/**
 * ProofLayerLoading — branded verification animation for loading states.
 * Replaces generic loading indicators with the EVIDENCE → VERIFY → PROOF flow.
 */
export function ProofLayerLoading({ message }: { message?: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 text-accent">
      <div className="w-full max-w-md rounded-[10px] border border-edge bg-surface p-6">
        {/* Verification ring icon */}
        <div className="flex items-center gap-3">
          <span className="inline-flex size-9 items-center justify-center">
            <svg viewBox="0 0 40 40" fill="none" className="size-full loading-ring" aria-hidden="true">
              <circle
                cx="20"
                cy="20"
                r="17"
                stroke="currentColor"
                strokeWidth="2.5"
                opacity="0.3"
              />
              <circle
                cx="20"
                cy="20"
                r="17"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeDasharray="107"
                strokeDashoffset="80"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold">ProofLayer</p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-tertiary">
              RWA Trust Infrastructure
            </p>
          </div>
        </div>

        {/* Verification flow animation */}
        <div className="mt-6 flex items-center justify-center gap-3">
          <span className="loading-step text-[9px] font-bold uppercase tracking-[0.1em] text-brand">
            EVIDENCE
          </span>
          <span className="text-tertiary">&darr;</span>
          <span className="loading-step text-[9px] font-bold uppercase tracking-[0.1em] text-brand">
            VERIFY
          </span>
          <span className="text-tertiary">&darr;</span>
          <span className="loading-step text-[9px] font-bold uppercase tracking-[0.1em] text-brand">
            PROOF
          </span>
        </div>

        <p className="mt-5 text-center text-[11px] leading-5 text-secondary">
          {message || "Loading verification state\u2026"}
        </p>
      </div>
    </main>
  );
}
