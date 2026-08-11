"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { AssetAuthenticityLabel } from "@/components/asset-authenticity-label";
import { Icon } from "@/components/icons";
import {
  ASSET_CLASS_FILTERS,
  PROOFLAYER_ASSETS,
  VERIFICATION_FILTERS,
  type AssetClassFilter,
  type ProofLayerAsset,
  type VerificationFilter,
} from "@/lib/assets";

export type UsdyExplorerState = {
  connected: boolean;
  registered: boolean | null;
  usable: boolean | null;
  certificateStatus: string;
  result: "PASS";
};

function AssetCard({
  asset,
  usdyState,
}: {
  asset: ProofLayerAsset;
  usdyState: UsdyExplorerState;
}) {
  const isUsdy = asset.slug === "usdy";

  return (
    <article className="asset-directory-card group overflow-hidden rounded-[10px] border border-white/[0.09] bg-[#111319]">
      <Link
        href={`/assets/${asset.slug}`}
        className="block h-full focus-visible:outline-none"
        aria-label={`Explore ${asset.name}`}
      >
        <div className="relative min-h-[220px] overflow-hidden border-b border-white/[0.08] sm:min-h-[230px]">
          {asset.image === null ? (
            <div className="asset-showcase-placeholder absolute inset-0 grid place-items-center" aria-hidden="true">
              <div className="grid size-20 place-items-center rounded-[10px] border border-white/[0.08] bg-black/15 text-[#818693]">
                <Icon name="overview" className="size-8" />
              </div>
            </div>
          ) : (
            <Image
              src={asset.image.src}
              alt={asset.image.alt}
              fill
              sizes="(max-width: 767px) 100vw, (max-width: 1199px) 50vw, 33vw"
              className={`asset-showcase-photo object-cover ${
                asset.image.treatment === "gold"
                  ? "asset-showcase-photo-gold"
                  : asset.image.treatment === "grain"
                    ? "asset-showcase-photo-grain"
                    : ""
              }`}
              style={{ objectPosition: asset.image.position ?? "center" }}
            />
          )}
          <div className="asset-showcase-shade absolute inset-0" aria-hidden="true" />
          <div className="asset-showcase-grid absolute inset-0" aria-hidden="true" />
          <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap gap-1.5 p-4">
            {asset.authenticityLabels.map((item) => (
              <AssetAuthenticityLabel key={item.label} {...item} />
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 z-10 p-4">
            <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-[#9aa49e]">
              {asset.eyebrow}
            </p>
            <h2 className="mt-1.5 text-[21px] font-semibold tracking-[-0.035em] text-[#f2f5f3]">
              {asset.name}
            </h2>
            <p className="mt-1 text-[11px] font-medium text-[#b4bdb7]">{asset.claim}</p>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-[10px] font-semibold text-[#d4d7df]">{asset.assetClass}</p>
          <p className="mt-2 min-h-10 text-[10px] leading-4 text-[#7f8a83]">
            {asset.description}
          </p>
          <div className="mt-4 flex items-end justify-between gap-3 border-t border-white/[0.08] pt-3">
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#747987]">
                Current state
              </p>
              {isUsdy ? (
                <p className="mt-1 text-[10px] font-semibold text-[#36d17c]">
                  {usdyState.result}
                  <span className="font-normal text-[#7f8a83]"> / {usdyState.certificateStatus}</span>
                </p>
              ) : (
                <p className="mt-1 text-[10px] font-semibold text-[#9b8e67]">UNVERIFIED</p>
              )}
            </div>
            <span className="surface-transition text-[10px] font-semibold text-[#9c91e9] group-hover:translate-x-0.5 group-hover:text-[#c2baf5]">
              Inspect asset &rarr;
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

export function AssetExplorer({ usdyState }: { usdyState: UsdyExplorerState }) {
  const [query, setQuery] = useState("");
  const [assetClass, setAssetClass] = useState<AssetClassFilter>(
    "All asset classes",
  );
  const [verificationState, setVerificationState] =
    useState<VerificationFilter>("All verification states");

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleAssets = PROOFLAYER_ASSETS.filter((asset) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      [asset.name, asset.symbol, asset.assetClass, asset.claim]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    const matchesClass =
      assetClass === "All asset classes" || asset.assetClassFilter === assetClass;
    const matchesVerification =
      verificationState === "All verification states" ||
      asset.verificationFilters.some((state) => state === verificationState);

    return matchesQuery && matchesClass && matchesVerification;
  });

  return (
    <>
      <section
        className="rounded-[10px] border border-white/[0.08] bg-[#111319] p-4 sm:p-5"
        aria-label="Asset Explorer controls"
      >
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_210px_220px]">
          <label className="block">
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#747987]">
              Search assets
            </span>
            <span className="relative mt-2 block">
              <Icon
                name="overview"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#747987]"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, class, or claim"
                className="h-10 w-full rounded-[8px] border border-white/[0.1] bg-[#0b110e] pl-10 pr-3 text-[12px] text-[#e5eae7] placeholder:text-[#59645d]"
              />
            </span>
          </label>

          <label className="block">
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#747987]">
              Asset class
            </span>
            <select
              value={assetClass}
              onChange={(event) => setAssetClass(event.target.value as AssetClassFilter)}
              className="mt-2 h-10 w-full rounded-[8px] border border-white/[0.1] bg-[#0b110e] px-3 text-[11px] text-[#d4d7df]"
            >
              {ASSET_CLASS_FILTERS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#747987]">
              Verification state
            </span>
            <select
              value={verificationState}
              onChange={(event) =>
                setVerificationState(event.target.value as VerificationFilter)
              }
              className="mt-2 h-10 w-full rounded-[8px] border border-white/[0.1] bg-[#0b110e] px-3 text-[11px] text-[#d4d7df]"
            >
              {VERIFICATION_FILTERS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <div className="mt-4 flex items-center justify-between gap-3 px-1">
        <p className="text-[10px] text-[#858a97]" aria-live="polite">
          Showing <strong className="font-semibold text-[#c3cbc6]">{visibleAssets.length}</strong>{" "}
          of {PROOFLAYER_ASSETS.length} assets
        </p>
        <p className="hidden text-[9px] uppercase tracking-[0.09em] text-[#59645d] sm:block">
          Verification coverage / not a marketplace
        </p>
      </div>

      {visibleAssets.length === 0 ? (
        <div className="mt-4 rounded-[10px] border border-dashed border-white/[0.11] bg-[#111319] px-5 py-14 text-center">
          <p className="text-sm font-semibold text-[#d6ddd8]">No assets match these filters</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setAssetClass("All asset classes");
              setVerificationState("All verification states");
            }}
            className="mt-3 text-[11px] font-semibold text-[#a99fee] hover:text-[#c5bef5]"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleAssets.map((asset) => (
            <AssetCard key={asset.slug} asset={asset} usdyState={usdyState} />
          ))}
        </div>
      )}
    </>
  );
}
