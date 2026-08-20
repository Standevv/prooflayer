"use client";

import { useEffect, useState } from "react";

/**
 * ProofLayerWordmark — distinctive SVG wordmark for ProofLayer.
 *
 * The "O" in PROOF is replaced with a verification ring motif:
 * a circle with a checkmark node, representing evidence → verification.
 *
 * Usage:
 *   <ProofLayerWordmark className="h-8" />
 *   <ProofLayerWordmark className="h-12" variant="hero" />
 *   <ProofLayerWordmark className="h-6" variant="compact" />
 */

type WordmarkProps = {
  className?: string;
  variant?: "default" | "hero" | "compact" | "icon";
};

export function ProofLayerWordmark({
  className = "h-8",
  variant = "default",
}: WordmarkProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  if (variant === "icon") {
    return <VerificationIcon className={className} mounted={mounted} />;
  }

  return (
    <span
      className={`inline-flex items-center gap-0 font-bold tracking-[-0.04em] text-primary ${className} ${
        mounted ? "wordmark-enter" : "opacity-0"
      }`}
      aria-label="ProofLayer"
    >
      <span className="text-[0.82em]">PR</span>
      <VerificationLetterO className="mx-[-0.02em]" size={className} />
      <span className="text-[0.82em]">FLAYER</span>
    </span>
  );
}

/**
 * The verification "O" — a ring with a checkmark node inside.
 * Communicates: evidence verified, proof confirmed.
 */
function VerificationLetterO({
  className,
  size,
}: {
  className?: string;
  size: string;
}) {
  // Derive SVG size from the CSS class
  const isHero = size.includes("text-[4") || size.includes("text-[3");
  const isCompact = size.includes("text-[1") || size.includes("h-6") || size.includes("h-5");
  const svgSize = isHero ? 44 : isCompact ? 20 : 28;

  return (
    <span
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: svgSize, height: svgSize }}
    >
      <svg
        viewBox="0 0 40 40"
        fill="none"
        className="absolute inset-0 size-full"
        aria-hidden="true"
      >
        {/* Outer verification ring */}
        <circle
          cx="20"
          cy="20"
          r="17"
          stroke="currentColor"
          strokeWidth="2.5"
          className="verification-ring"
        />
        {/* Inner ring — evidence node */}
        <circle
          cx="20"
          cy="20"
          r="11"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.35"
        />
        {/* Checkmark — proof confirmed */}
        <path
          d="M13 20l4.5 4.5L27 16"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="verification-check"
        />
        {/* Evidence node dot — top */}
        <circle cx="20" cy="3" r="2" fill="currentColor" opacity="0.5" />
        {/* Evidence node dot — right */}
        <circle cx="37" cy="20" r="2" fill="currentColor" opacity="0.5" />
        {/* Evidence node dot — bottom */}
        <circle cx="20" cy="37" r="2" fill="currentColor" opacity="0.5" />
        {/* Connecting lines — evidence network */}
        <line x1="20" y1="5" x2="20" y2="9" stroke="currentColor" strokeWidth="1" opacity="0.2" />
        <line x1="35" y1="20" x2="31" y2="20" stroke="currentColor" strokeWidth="1" opacity="0.2" />
        <line x1="20" y1="35" x2="20" y2="31" stroke="currentColor" strokeWidth="1" opacity="0.2" />
      </svg>
    </span>
  );
}

/**
 * Standalone verification icon — the "O" motif as a product icon.
 */
function VerificationIcon({
  className,
  mounted,
}: {
  className: string;
  mounted: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center ${className} ${
        mounted ? "wordmark-enter" : "opacity-0"
      }`}
    >
      <svg viewBox="0 0 40 40" fill="none" className="size-full" aria-hidden="true">
        <circle
          cx="20"
          cy="20"
          r="17"
          stroke="currentColor"
          strokeWidth="2.5"
          className="verification-ring"
        />
        <circle
          cx="20"
          cy="20"
          r="11"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.35"
        />
        <path
          d="M13 20l4.5 4.5L27 16"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="verification-check"
        />
        <circle cx="20" cy="3" r="2" fill="currentColor" opacity="0.5" />
        <circle cx="37" cy="20" r="2" fill="currentColor" opacity="0.5" />
        <circle cx="20" cy="37" r="2" fill="currentColor" opacity="0.5" />
        <line x1="20" y1="5" x2="20" y2="9" stroke="currentColor" strokeWidth="1" opacity="0.2" />
        <line x1="35" y1="20" x2="31" y2="20" stroke="currentColor" strokeWidth="1" opacity="0.2" />
        <line x1="20" y1="35" x2="20" y2="31" stroke="currentColor" strokeWidth="1" opacity="0.2" />
      </svg>
    </span>
  );
}
