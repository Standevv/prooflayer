"use client";

import { useState } from "react";

import { Icon } from "@/components/icons";
import type { CurrentVerificationTruth } from "@/lib/truth-presentation";

export type VerificationAsset = "USDY" | "PAXG";

const claims: Record<VerificationAsset, string> = {
  USDY: "Treasury Backing",
  PAXG: "Gold Backing",
};

export function VerifyPanel({
  asset,
  currentVerification,
  onAssetChange,
}: {
  asset: VerificationAsset;
  currentVerification: CurrentVerificationTruth | null;
  onAssetChange?: (asset: VerificationAsset) => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);

  function selectAsset(nextAsset: VerificationAsset) {
    onAssetChange?.(nextAsset);
    setNotice(null);
  }

  function verify() {
    if (asset === "USDY") {
      setNotice(
        currentVerification
          ? `Current USDY RVC result: ${currentVerification.result}${currentVerification.reason_codes.length ? ` — ${currentVerification.reason_codes.join(", ")}` : ""}. Historical certificate state is shown separately.`
          : "Current USDY RVC result is unavailable. The historical certificate fixture is not used as a current-result fallback.",
      );
      document.getElementById("verification-result")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setNotice(
      "PAXG verification exists in the RVC, but no frontend certificate fixture is exported yet. No result has been invented.",
    );
  }

  return (
    <div className="border-b border-edge p-5 lg:border-b-0 lg:border-r lg:p-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          verify();
        }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-tertiary">Verification request</p>
        <p className="mt-2 text-[13px] leading-5 text-primary">Evaluate evidence against the selected policy.</p>

        <fieldset className="mt-5">
          <legend className="text-[11px] font-semibold text-secondary">Asset</legend>
          <div className="mt-2 grid grid-cols-2 rounded-[8px] border border-edge bg-scrim p-1">
            {(["USDY", "PAXG"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={asset === option}
                onClick={() => selectAsset(option)}
                className={`surface-transition rounded-[6px] px-3 py-2 text-xs font-semibold ${
                  asset === option
                    ? "bg-overlay-active text-accent shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
                    : "text-secondary hover:text-primary"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="mt-4 block text-[11px] font-semibold text-secondary">
          Claim
          <input
            value={claims[asset]}
            readOnly
            className="mt-2 h-10 w-full rounded-[8px] border border-edge bg-scrim px-3 text-[13px] font-medium text-accent"
            aria-label="Claim"
          />
        </label>

        <button
          type="submit"
          className="surface-transition mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-success-soft px-5 text-[13px] font-bold text-success shadow-[0_0_0_rgba(54,209,124,0)] hover:-translate-y-px hover:bg-success hover:shadow-[0_8px_24px_rgba(54,209,124,0.14)]"
        >
          <Icon name="shield" className="size-4" />
          Run Verification
        </button>

        <p className="mt-3 min-h-8 text-[11px] leading-4 text-secondary" aria-live="polite">
          {notice ?? "No wallet required. Public X Layer reads only."}
        </p>
      </form>
    </div>
  );
}
