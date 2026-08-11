"use client";

import Image from "next/image";
import { useState } from "react";

type AssetId = "usdy" | "paxg" | "solar" | "grain";

type ShowcaseAsset = {
  id: AssetId;
  category: string;
  name: string;
  descriptor: string;
  description: string;
  claim: string;
  assetClass: string;
  verification: string;
  scope: string;
  image: {
    src: string;
    alt: string;
    position?: string;
    treatment?: "gold" | "grain";
  };
};

const showcaseAssets: readonly ShowcaseAsset[] = [
  {
    id: "usdy",
    category: "Government securities",
    name: "USDY",
    descriptor: "Treasury Backing",
    description: "Government-security context for evidence-backed Treasury claims.",
    claim: "Treasury-backed asset",
    assetClass: "Securities",
    verification: "Fixture available",
    scope: "Existing fixture",
    image: {
      src: "/assets/us-treasury.webp",
      alt: "United States Treasury building in Washington, D.C.",
    },
  },
  {
    id: "paxg",
    category: "Commodity",
    name: "PAXG",
    descriptor: "Gold Backing",
    description: "Physical-reserve context for commodity-backed asset claims.",
    claim: "Allocated gold claim",
    assetClass: "Commodity",
    verification: "Frontend fixture pending",
    scope: "Fixture context",
    image: {
      src: "/assets/paxg-gold-vault.jpeg",
      alt: "Gold bullion stored in an institutional reserve vault",
      position: "center",
      treatment: "gold",
    },
  },
  {
    id: "solar",
    category: "Physical infrastructure",
    name: "Solar Infrastructure",
    descriptor: "Renewable Energy",
    description: "Illustrative infrastructure context; no certificate fixture is issued.",
    claim: "Project / Asset Backing",
    assetClass: "Infrastructure",
    verification: "Not yet issued",
    scope: "Example asset",
    image: {
      src: "/assets/solar-infrastructure.jpeg",
      alt: "Aerial view of a large solar-energy farm and electrical infrastructure",
      position: "center",
    },
  },
  {
    id: "grain",
    category: "Agricultural commodity",
    name: "Stored Grain Inventory",
    descriptor: "Grain Inventory",
    description: "Physical inventory can require evidence of quantity, custody, and provenance before protocols rely on the claim.",
    claim: "Warehouse / Reserve Backing",
    assetClass: "Agricultural Commodity",
    verification: "No verification fixture",
    scope: "Example asset",
    image: {
      src: "/assets/agricultural-commodity-storage.jpeg",
      alt: "Aerial view of grain-storage silos surrounded by agricultural fields",
      position: "center",
      treatment: "grain",
    },
  },
];

const verificationFlow = ["Real world", "Evidence", "ProofLayer", "Certificate", "Enforce"] as const;

export function RealWorldAssets() {
  const [selectedAssetId, setSelectedAssetId] = useState<AssetId>("usdy");
  const selectedAsset = showcaseAssets.find((asset) => asset.id === selectedAssetId) ?? showcaseAssets[0];

  return (
    <section
      className="overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#111319]"
      aria-labelledby="real-world-assets-heading"
    >
      <div className="flex flex-col gap-4 border-b border-white/[0.08] px-5 py-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#747987]">Real-world assets</p>
          <h2 id="real-world-assets-heading" className="mt-1 text-xl font-semibold tracking-[-0.03em] text-[#f5f4f8]">
            Verification infrastructure beyond the blockchain
          </h2>
          <p className="mt-1.5 text-[11px] text-[#7d8981]">Explore how evidence-backed claims map to distinct physical asset classes.</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.07em] text-[#747987]" aria-label="ProofLayer verification flow">
          {verificationFlow.map((step, index) => (
            <span key={step} className="flex items-center gap-1.5">
              <span className={step === "ProofLayer" ? "text-[#36d17c]" : ""}>{step}</span>
              {index < verificationFlow.length - 1 ? <span className="text-[#3f4a43]" aria-hidden="true">&rarr;</span> : null}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <div className="rounded-[10px] border border-white/[0.08] bg-[#0d0f14] p-3 sm:p-4" role="group" aria-label="Asset coverage examples">
          <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#747987]">Coverage explorer</p>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-1">
            {showcaseAssets.map((asset) => {
              const isSelected = asset.id === selectedAsset.id;

              return (
                <button
                  key={asset.id}
                  type="button"
                  aria-pressed={isSelected}
                  aria-controls="asset-coverage-panel"
                  onClick={() => setSelectedAssetId(asset.id)}
                  className={`surface-transition min-w-0 rounded-[8px] border p-3 text-left ${
                    isSelected
                      ? "border-[#36d17c]/30 bg-[#36d17c]/[0.055]"
                      : "border-white/[0.07] bg-white/[0.015] hover:border-white/[0.14] hover:bg-white/[0.025]"
                  }`}
                >
                  <span className={`block text-[8px] font-semibold uppercase tracking-[0.1em] ${isSelected ? "text-[#36d17c]" : "text-[#747987]"}`}>
                    {asset.category}
                  </span>
                  <span className="mt-1.5 block truncate text-[11px] font-semibold text-[#d6ddd8]">{asset.name}</span>
                  <span className="mt-1 block truncate text-[9px] text-[#8b909c]">{asset.descriptor}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-[8px] leading-3 text-[#676c78]">Context examples do not imply verification unless a fixture is explicitly available.</p>
        </div>

        <article
          key={selectedAsset.id}
          id="asset-coverage-panel"
          className="asset-showcase-card asset-showcase-panel group relative min-h-[330px] overflow-hidden rounded-[10px] border border-white/[0.09] bg-[#0d0f14] sm:min-h-[360px]"
          aria-live="polite"
        >
          <Image
            src={selectedAsset.image.src}
            alt={selectedAsset.image.alt}
            fill
            sizes="(max-width: 1023px) calc(100vw - 32px), 70vw"
            loading={selectedAsset.id === "usdy" ? "eager" : "lazy"}
            className={`asset-showcase-photo ${
              selectedAsset.image.treatment === "gold"
                ? "asset-showcase-photo-gold"
                : selectedAsset.image.treatment === "grain"
                  ? "asset-showcase-photo-grain"
                  : ""
            } object-cover`}
            style={{ objectPosition: selectedAsset.image.position ?? "center" }}
          />

          <div className="asset-showcase-shade absolute inset-0" aria-hidden="true" />
          <div className="asset-showcase-grid absolute inset-0" aria-hidden="true" />

          <span className="absolute right-4 top-4 z-10 rounded-[4px] border border-white/[0.1] bg-[#08100d]/75 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-[#a1aaa4] backdrop-blur-sm">
            {selectedAsset.scope}
          </span>

          <div className="absolute inset-x-0 bottom-0 z-10 p-5 sm:p-6">
            <p className="text-[8px] font-semibold uppercase tracking-[0.13em] text-[#a0aaa3]">{selectedAsset.category}</p>
            <h3 className="mt-1.5 text-[20px] font-semibold tracking-[-0.025em] text-[#f2f5f3] sm:text-[22px]">{selectedAsset.name}</h3>
            <p className="mt-1 text-[11px] font-medium text-[#b2bbb5]">{selectedAsset.descriptor}</p>
            <p className="mt-2 max-w-2xl text-[10px] leading-4 text-[#9da7a0] sm:text-[11px]">{selectedAsset.description}</p>

            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/[0.1] pt-3 sm:grid-cols-3">
              <div>
                <dt className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#747987]">Asset class</dt>
                <dd className="mt-1 text-[10px] font-medium text-[#c2cac5]">{selectedAsset.assetClass}</dd>
              </div>
              <div>
                <dt className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#747987]">Claim</dt>
                <dd className="mt-1 text-[10px] font-medium text-[#c2cac5]">{selectedAsset.claim}</dd>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <dt className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#747987]">Verification</dt>
                <dd className={`mt-1 text-[10px] font-medium ${selectedAsset.verification === "Fixture available" ? "text-[#36d17c]" : "text-[#b7a56d]"}`}>
                  {selectedAsset.verification}
                </dd>
              </div>
            </dl>
          </div>
        </article>
      </div>
    </section>
  );
}
