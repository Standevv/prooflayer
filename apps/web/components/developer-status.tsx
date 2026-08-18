"use client";

import { useEffect, useState } from "react";

import type { DeveloperApiError, DeveloperComponentStatus, DeveloperPlatformStatus } from "@/lib/developers";

type StatusKey = "api" | "xlayer" | "ai_agent" | "deterministic_verification";

const statusLabels: Array<{ key: StatusKey; label: string }> = [
  { key: "api", label: "ProofLayer API" },
  { key: "xlayer", label: "X Layer" },
  { key: "ai_agent", label: "AI Agent" },
  { key: "deterministic_verification", label: "Deterministic RVC" },
];

function unavailable(detail: string): DeveloperComponentStatus {
  return { status: "UNAVAILABLE", detail, authenticity_labels: ["UNAVAILABLE"] };
}

export function DeveloperStatus() {
  const [status, setStatus] = useState<DeveloperPlatformStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/developers/status", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as DeveloperPlatformStatus | DeveloperApiError;
        if (!response.ok || "error" in payload) throw new Error("error" in payload ? payload.error : "Developer status unavailable.");
        setStatus(payload);
      })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Developer status unavailable.");
      });
    return () => controller.abort();
  }, []);

  return (
    <section aria-label="Developer platform status" className="rounded-[9px] border border-edge bg-surface p-3">
      <div className="grid gap-px overflow-hidden rounded-[7px] border border-edge bg-overlay-active sm:grid-cols-2 xl:grid-cols-4">
        {statusLabels.map(({ key, label }) => {
          const item = status?.[key] ?? unavailable(error ?? "Checking availability…");
          const good = item.status === "AVAILABLE" || item.status === "CONNECTED";
          const waiting = status === null && error === null;
          return (
            <div key={key} className="min-w-0 bg-surface px-3.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-secondary">{label}</p>
                <span className={`size-1.5 shrink-0 rounded-full ${waiting ? "bg-overlay-active" : good ? "bg-success-soft" : item.status === "UNCONFIGURED" ? "bg-warning" : "bg-fail"}`} aria-hidden="true" />
              </div>
              <p className={`mt-2 text-[11px] font-semibold ${good ? "text-success" : item.status === "UNCONFIGURED" ? "text-warning" : "text-primary"}`}>{waiting ? "CHECKING" : item.status}</p>
              <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-secondary">{item.detail}</p>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 font-mono text-[9px] uppercase tracking-[0.08em] text-secondary">
        <span>X Layer Testnet · Chain 1952{status?.latest_block !== null && status?.latest_block !== undefined ? ` · Block ${status.latest_block.toLocaleString()}` : ""}</span>
        <span>MVP / Pre-production · Read only</span>
      </div>
    </section>
  );
}
