"use client";

import { useState } from "react";

export function CopyCodeButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_400);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="surface-transition rounded-[6px] border border-edge bg-overlay-hover px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-secondary hover:border-brand/40 hover:text-primary"
      aria-live="polite"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
