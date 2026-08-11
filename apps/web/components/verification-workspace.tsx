"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { AssetContextPanel } from "@/components/asset-context-panel";
import { Icon } from "@/components/icons";
import { VerifyPanel, type VerificationAsset } from "@/components/verify-panel";

function PaxgUnavailableResult() {
  return (
    <div
      id="verification-result"
      className="asset-context-panel min-w-0 bg-[linear-gradient(135deg,rgba(233,185,73,0.035),transparent_58%)] p-5 sm:p-6"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-[#e9b949]/20 bg-[#e9b949]/[0.055] text-[#d1b35e]">
            <Icon name="certificate" className="size-5" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#818693]">Verification result</p>
            <p className="mt-1 text-[13px] text-[#aab3ad]">PAXG / Gold Backing</p>
          </div>
        </div>
        <span className="rounded-[5px] border border-[#e9b949]/20 bg-[#e9b949]/[0.045] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#c3a755]">
          Fixture unavailable
        </span>
      </div>

      <div className="mt-6">
        <p className="text-[24px] font-semibold leading-tight tracking-[-0.035em] text-[#ececf1]">No exported certificate fixture</p>
        <p className="mt-2 max-w-lg text-[12px] leading-5 text-[#9da2ae]">
          PAXG verification exists in the RVC, but no frontend certificate fixture is exported yet. No result has been inferred.
        </p>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-white/[0.08] pt-5">
        <div>
          <dt className="text-[9px] font-semibold uppercase tracking-[0.09em] text-[#747987]">Asset class</dt>
          <dd className="mt-1.5 text-[12px] font-medium text-[#d4d7df]">Commodity</dd>
        </div>
        <div>
          <dt className="text-[9px] font-semibold uppercase tracking-[0.09em] text-[#747987]">Verification</dt>
          <dd className="mt-1.5 text-[12px] font-medium text-[#d1b35e]">Not displayed</dd>
        </div>
      </dl>
    </div>
  );
}

export function VerificationWorkspace({ result }: { result: ReactNode }) {
  const [asset, setAsset] = useState<VerificationAsset>("USDY");

  return (
    <div className="grid xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.7fr)]">
      <div className="grid min-w-0 lg:grid-cols-[0.78fr_1.22fr]">
        <VerifyPanel asset={asset} onAssetChange={setAsset} />
        {asset === "USDY" ? result : <PaxgUnavailableResult />}
      </div>
      <AssetContextPanel asset={asset} />
    </div>
  );
}
