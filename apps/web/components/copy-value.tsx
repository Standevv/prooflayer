"use client";

import { useState } from "react";

type CopyValueProps = {
  value: string;
  label: string;
  href?: string;
  full?: boolean;
};

function shorten(value: string): string {
  if (value.length <= 22) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function copyWithSelection(value: string): boolean {
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();

  try {
    return document.execCommand("copy");
  } finally {
    input.remove();
  }
}

export function CopyValue({ value, label, href, full = false }: CopyValueProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
    } catch {
      setCopyState(copyWithSelection(value) ? "copied" : "failed");
    }
    window.setTimeout(() => setCopyState("idle"), 1_600);
  }

  const display = (
    <span className={`min-w-0 font-mono text-[11px] font-medium text-accent ${full ? "break-all leading-5" : "truncate"}`}>
      {full ? value : shorten(value)}
    </span>
  );

  return (
    <div className="relative flex min-w-0 items-center gap-1.5">
      {href === undefined ? display : (
        <a
          className="min-w-0 underline decoration-edge underline-offset-4 transition-colors hover:decoration-success/70"
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${label} in the X Layer explorer`}
        >
          {display}
        </a>
      )}
      <button
        type="button"
        onClick={copy}
        className="surface-transition grid size-6 shrink-0 place-items-center rounded-[4px] text-secondary hover:bg-overlay-active hover:text-accent"
        aria-label={`Copy ${label}`}
        title={`Copy ${label}`}
      >
        {copyState === "copied" ? (
          <svg viewBox="0 0 16 16" className="size-3.5 text-success" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="m3 8.2 3 3L13 4.5" />
          </svg>
        ) : copyState === "failed" ? (
          <span className="text-xs font-bold text-fail" aria-hidden="true">!</span>
        ) : (
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
            <rect x="5.25" y="5.25" width="7.25" height="7.25" rx="1" />
            <path d="M10.5 5.25v-1.5a1 1 0 0 0-1-1H3.75a1 1 0 0 0-1 1V9.5a1 1 0 0 0 1 1h1.5" />
          </svg>
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {copyState === "copied" ? `${label} copied` : copyState === "failed" ? `${label} could not be copied` : ""}
      </span>
    </div>
  );
}
