import Image from "next/image";

import { Icon } from "@/components/icons";
import type { VerificationAsset } from "@/components/verify-panel";

type AssetVisual = {
  src: string;
  alt: string;
  eyebrow: string;
  title: string;
  detail: string;
  verification: string;
  verificationTone: "available" | "unavailable";
  imageClassName?: string;
};

const assetVisuals: Partial<Record<VerificationAsset, AssetVisual>> = {
  USDY: {
    src: "/assets/us-treasury.webp",
    alt: "United States Treasury building in Washington, D.C.",
    eyebrow: "Underlying claim",
    title: "U.S. Treasury-backed asset",
    detail: "USDY • Treasury Backing",
    verification: "Deterministic fixture available",
    verificationTone: "available",
  },
  PAXG: {
    src: "/assets/paxg-gold-vault.jpeg",
    alt: "Gold bullion stored in an institutional reserve vault",
    eyebrow: "Physical reserve",
    title: "Gold Bullion",
    detail: "PAXG • Gold Backing",
    verification: "Frontend certificate fixture unavailable",
    verificationTone: "unavailable",
    imageClassName: "asset-context-photo-gold",
  },
};

export function AssetContextPanel({ asset }: { asset: VerificationAsset }) {
  const visual = assetVisuals[asset];

  if (visual === undefined) {
    return (
      <div
        className="grid min-h-[190px] place-items-center border-t border-white/[0.08] bg-[radial-gradient(circle_at_70%_30%,rgba(233,185,73,0.05),transparent_42%),#0d0f14] px-6 py-8 text-center sm:min-h-[220px] xl:min-h-full xl:border-l xl:border-t-0"
        aria-live="polite"
      >
        <div>
          <span className="mx-auto grid size-9 place-items-center rounded-[8px] border border-white/[0.08] bg-white/[0.025] text-[#747987]">
            <Icon name="database" className="size-4" />
          </span>
          <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.11em] text-[#747987]">Asset context</p>
          <p className="mt-1 text-[11px] font-medium text-[#969ba8]">Gold/vault visual not configured</p>
        </div>
      </div>
    );
  }

  return (
    <figure
      key={asset}
      className="asset-context-panel relative min-h-[210px] overflow-hidden border-t border-white/[0.08] bg-[#0d0f14] sm:min-h-[240px] xl:min-h-full xl:border-l xl:border-t-0"
      aria-live="polite"
    >
      <Image
        src={visual.src}
        alt={visual.alt}
        fill
        sizes="(max-width: 1279px) 100vw, 340px"
        loading="eager"
        className={`asset-context-photo ${visual.imageClassName ?? ""} object-cover`}
      />
      <div className="asset-context-shade absolute inset-0" aria-hidden="true" />
      <div className="asset-context-grid absolute inset-0" aria-hidden="true" />

      <figcaption className="absolute inset-x-0 bottom-0 z-10 p-5 sm:p-6">
        <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-[#b1b5bf]">{visual.eyebrow}</p>
        <p className="mt-1.5 text-[14px] font-semibold tracking-[-0.015em] text-[#f5f4f8]">{visual.title}</p>
        <p className="mt-1.5 font-mono text-[10px] text-[#a7b0aa]">{visual.detail}</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-1.5 border-t border-white/[0.09] pt-2.5 text-[8px]">
          <span className="font-semibold uppercase tracking-[0.1em] text-[#8b909c]">Verification</span>
          <span className={visual.verificationTone === "available" ? "text-[#36d17c]" : "text-[#d1b35e]"}>
            {visual.verification}
          </span>
        </div>
      </figcaption>
    </figure>
  );
}
