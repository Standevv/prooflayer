"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { AssetContextPanel } from "@/components/asset-context-panel";
import { Icon } from "@/components/icons";
import { VerifyPanel, type VerificationAsset } from "@/components/verify-panel";
import type { CurrentVerificationTruth } from "@/lib/truth-presentation";

function PaxgUnavailableResult() {
  return (
    <div
      id="verification-result"
      className="asset-context-panel min-w-0 bg-[linear-gradient(135deg,rgba(233,185,73,0.035),transparent_58%)] p-5 sm:p-6"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-warning/20 bg-warning/[0.055] text-warning">
            <Icon name="certificate" className="size-5" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-secondary">Verification result</p>
            <p className="mt-1 text-[13px] text-secondary">PAXG / Gold Backing</p>
          </div>
        </div>
        <span className="rounded-[5px] border border-warning/20 bg-warning/[0.045] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] text-warning">
          Fixture unavailable
        </span>
      </div>

      <div className="mt-6">
        <p className="text-[24px] font-semibold leading-tight tracking-[-0.035em] text-accent">No exported certificate fixture</p>
        <p className="mt-2 max-w-lg text-[12px] leading-5 text-secondary">
          PAXG verification exists in the RVC, but no frontend certificate fixture is exported yet. No result has been inferred.
        </p>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-edge pt-5">
        <div>
          <dt className="text-[9px] font-semibold uppercase tracking-[0.09em] text-tertiary">Asset class</dt>
          <dd className="mt-1.5 text-[12px] font-medium text-accent">Commodity</dd>
        </div>
        <div>
          <dt className="text-[9px] font-semibold uppercase tracking-[0.09em] text-tertiary">Verification</dt>
          <dd className="mt-1.5 text-[12px] font-medium text-warning">Not displayed</dd>
        </div>
      </dl>
    </div>
  );
}

export function VerificationWorkspace({
  result,
  currentVerification,
}: {
  result: ReactNode;
  currentVerification: CurrentVerificationTruth | null;
}) {
  const [asset, setAsset] = useState<VerificationAsset>("USDY");

  return (
    <div className="grid xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.7fr)]">
      <div className="grid min-w-0 lg:grid-cols-[0.78fr_1.22fr]">
        <VerifyPanel
          asset={asset}
          currentVerification={currentVerification}
          onAssetChange={setAsset}
        />
        {asset === "USDY" ? result : <PaxgUnavailableResult />}
      </div>
      <AssetContextPanel asset={asset} />
    </div>
  );
}
