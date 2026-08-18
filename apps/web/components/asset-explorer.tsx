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
  currentRvcResult: "PASS" | "FAIL" | "INDETERMINATE" | "UNAVAILABLE";
  currentRvcReasons: string[];
  historicalCertificateResult: "PASS" | "FAIL" | "INDETERMINATE" | "UNAVAILABLE";
  currentCertificateUsability: string;
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
    <article className="asset-directory-card group overflow-hidden rounded-[10px] border border-edge bg-surface">
      <Link
        href={`/assets/${asset.slug}`}
        className="block h-full focus-visible:outline-none"
        aria-label={`Explore ${asset.name}`}
      >
        <div className="relative min-h-[220px] overflow-hidden border-b border-edge sm:min-h-[230px]">
          {asset.image === null ? (
            <div className="asset-showcase-placeholder absolute inset-0 grid place-items-center" aria-hidden="true">
              <div className="grid size-20 place-items-center rounded-[10px] border border-edge bg-scrim text-secondary">
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
            <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-secondary">
              {asset.eyebrow}
            </p>
            <h2 className="mt-1.5 text-[21px] font-semibold tracking-[-0.035em] text-success">
              {asset.name}
            </h2>
            <p className="mt-1 text-[11px] font-medium text-primary">{asset.claim}</p>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-[10px] font-semibold text-accent">{asset.assetClass}</p>
          <p className="mt-2 min-h-10 text-[10px] leading-4 text-tertiary">
            {asset.description}
          </p>
          <div className="mt-4 grid gap-3 border-t border-edge pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-[0.09em] text-tertiary">
                Verification truth
              </p>
              <dl className="mt-2 space-y-2">
              {isUsdy ? (
                <>
                  <div>
                    <dt className="text-[8px] uppercase tracking-[0.08em] text-tertiary">Current RVC result</dt>
                    <dd className={`mt-0.5 text-[10px] font-semibold ${usdyState.currentRvcResult === "PASS" ? "text-success" : usdyState.currentRvcResult === "FAIL" ? "text-fail" : "text-warning"}`}>
                      {usdyState.currentRvcResult}
                      {usdyState.currentRvcReasons.length ? <span className="font-normal"> — {usdyState.currentRvcReasons.join(", ")}</span> : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[8px] uppercase tracking-[0.08em] text-tertiary">Historical certificate result</dt>
                    <dd className="mt-0.5 text-[10px] font-semibold text-primary">{usdyState.historicalCertificateResult}</dd>
                  </div>
                  <div>
                    <dt className="text-[8px] uppercase tracking-[0.08em] text-tertiary">Current certificate usability</dt>
                    <dd className="mt-0.5 text-[10px] font-semibold text-warning">{usdyState.currentCertificateUsability}</dd>
                  </div>
                </>
              ) : (
                <div>
                  <dt className="text-[8px] uppercase tracking-[0.08em] text-tertiary">Current RVC result</dt>
                  <dd className="mt-1 text-[10px] font-semibold text-warning">UNVERIFIED</dd>
                </div>
              )}
              </dl>
            </div>
            <span className="surface-transition text-[10px] font-semibold text-accent group-hover:translate-x-0.5 group-hover:text-accent">
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
        className="rounded-[10px] border border-edge bg-surface p-4 sm:p-5"
        aria-label="Asset Explorer controls"
      >
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_210px_220px]">
          <label className="block">
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-tertiary">
              Search assets
            </span>
            <span className="relative mt-2 block">
              <Icon
                name="overview"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tertiary"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, class, or claim"
                className="h-10 w-full rounded-[8px] border border-edge bg-success-soft pl-10 pr-3 text-[12px] text-primary placeholder:text-tertiary"
              />
            </span>
          </label>

          <label className="block">
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-tertiary">
              Asset class
            </span>
            <select
              value={assetClass}
              onChange={(event) => setAssetClass(event.target.value as AssetClassFilter)}
              className="mt-2 h-10 w-full rounded-[8px] border border-edge bg-success-soft px-3 text-[11px] text-accent"
            >
              {ASSET_CLASS_FILTERS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-tertiary">
              Verification state
            </span>
            <select
              value={verificationState}
              onChange={(event) =>
                setVerificationState(event.target.value as VerificationFilter)
              }
              className="mt-2 h-10 w-full rounded-[8px] border border-edge bg-success-soft px-3 text-[11px] text-accent"
            >
              {VERIFICATION_FILTERS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <div className="mt-4 flex items-center justify-between gap-3 px-1">
        <p className="text-[10px] text-secondary" aria-live="polite">
          Showing <strong className="font-semibold text-success">{visibleAssets.length}</strong>{" "}
          of {PROOFLAYER_ASSETS.length} assets
        </p>
        <p className="hidden text-[9px] uppercase tracking-[0.09em] text-tertiary sm:block">
          Verification coverage / not a marketplace
        </p>
      </div>

      {visibleAssets.length === 0 ? (
        <div className="mt-4 rounded-[10px] border border-dashed border-edge bg-surface px-5 py-14 text-center">
          <p className="text-sm font-semibold text-primary">No assets match these filters</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setAssetClass("All asset classes");
              setVerificationState("All verification states");
            }}
            className="mt-3 text-[11px] font-semibold text-accent hover:text-brand-bright"
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
