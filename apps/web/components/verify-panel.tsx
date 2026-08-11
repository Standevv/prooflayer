"use client";

import { useState } from "react";

import { Icon } from "@/components/icons";

export type VerificationAsset = "USDY" | "PAXG";

const claims: Record<VerificationAsset, string> = {
  USDY: "Treasury Backing",
  PAXG: "Gold Backing",
};

export function VerifyPanel({
  asset,
  onAssetChange,
}: {
  asset: VerificationAsset;
  onAssetChange: (asset: VerificationAsset) => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);

  function selectAsset(nextAsset: VerificationAsset) {
    onAssetChange(nextAsset);
    setNotice(null);
  }

  function verify() {
    if (asset === "USDY") {
      setNotice("USDY PASS fixture loaded. Live certificate state is shown alongside it.");
      document.getElementById("verification-result")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setNotice(
      "PAXG verification exists in the RVC, but no frontend certificate fixture is exported yet. No result has been invented.",
    );
  }

  return (
    <div className="border-b border-white/[0.08] p-5 lg:border-b-0 lg:border-r lg:p-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          verify();
        }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#747987]">Verification request</p>
        <p className="mt-2 text-[13px] leading-5 text-[#b1b5bf]">Evaluate evidence against the selected policy.</p>

        <fieldset className="mt-5">
          <legend className="text-[11px] font-semibold text-[#aab3ad]">Asset</legend>
          <div className="mt-2 grid grid-cols-2 rounded-[8px] border border-white/[0.09] bg-black/20 p-1">
            {(["USDY", "PAXG"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={asset === option}
                onClick={() => selectAsset(option)}
                className={`surface-transition rounded-[6px] px-3 py-2 text-xs font-semibold ${
                  asset === option
                    ? "bg-white/[0.09] text-[#f7f7fa] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
                    : "text-[#8b909c] hover:text-[#c5c8d0]"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="mt-4 block text-[11px] font-semibold text-[#aab3ad]">
          Claim
          <input
            value={claims[asset]}
            readOnly
            className="mt-2 h-10 w-full rounded-[8px] border border-white/[0.09] bg-black/20 px-3 text-[13px] font-medium text-[#e5e7ec]"
            aria-label="Claim"
          />
        </label>

        <button
          type="submit"
          className="surface-transition mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-[8px] bg-[#36d17c] px-5 text-[13px] font-bold text-[#07110b] shadow-[0_0_0_rgba(54,209,124,0)] hover:-translate-y-px hover:bg-[#45dd8a] hover:shadow-[0_8px_24px_rgba(54,209,124,0.14)]"
        >
          <Icon name="shield" className="size-4" />
          Run Verification
        </button>

        <p className="mt-3 min-h-8 text-[11px] leading-4 text-[#8b909c]" aria-live="polite">
          {notice ?? "No wallet required. Public X Layer reads only."}
        </p>
      </form>
    </div>
  );
}
