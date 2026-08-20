"use client";

import Link from "next/link";
import { useState, useMemo } from "react";

import { AssetAuthenticityLabel } from "@/components/asset-authenticity-label";
import { Icon } from "@/components/icons";
import {
  type ApiAsset,
  type AssetOrigin,
  type VerificationSupport,
  assetToSlug,
  assetAuthenticityLabels,
} from "@/lib/assets-api";

export type UsdyExplorerState = {
  currentRvcResult: "PASS" | "FAIL" | "INDETERMINATE" | "UNAVAILABLE";
  currentRvcReasons: string[];
  historicalCertificateResult: "PASS" | "FAIL" | "INDETERMINATE" | "UNAVAILABLE";
  currentCertificateUsability: string;
};

const ORIGIN_FILTERS = [
  { label: "All origins", value: "" },
  { label: "X Layer Native", value: "X_LAYER_NATIVE" },
  { label: "Cross-chain Reference", value: "CROSS_CHAIN_REFERENCE" },
] as const;

const SUPPORT_FILTERS = [
  { label: "All support levels", value: "" },
  { label: "Fully Supported", value: "FULLY_SUPPORTED" },
  { label: "Framework Verified", value: "PARTIALLY_SUPPORTED" },
  { label: "Discovered Only", value: "DISCOVERED_ONLY" },
  { label: "Failed / Indeterminate", value: "FAILED_INDETERMINATE" },
] as const;

const ASSET_CLASS_FILTERS = [
  "All classes",
  "TOKENIZED_EQUITY",
  "TOKENIZED_ETF",
  "TOKENIZED_YIELD",
  "TOKENIZED_TREASURY",
  "TOKENIZED_GOLD",
] as const;

function humanizeAssetClass(cls: string): string {
  return cls
    .replace("TOKENIZED_", "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function AssetCard({ asset }: { asset: ApiAsset }) {
  const slug = assetToSlug(asset);
  const labels = assetAuthenticityLabels(asset);
  const isReference = asset.asset_origin === "CROSS_CHAIN_REFERENCE";

  return (
    <article className="asset-directory-card group overflow-hidden rounded-[10px] border border-edge bg-surface">
      <Link
        href={`/assets/${slug}`}
        className="block h-full focus-visible:outline-none"
        aria-label={`Explore ${asset.name}`}
      >
        <div className="relative min-h-[180px] overflow-hidden border-b border-edge bg-overlay-active">
          <div className="asset-showcase-grid absolute inset-0" aria-hidden="true" />
          <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap gap-1.5 p-4">
            {labels.map((item) => (
              <AssetAuthenticityLabel key={item.label} {...item} />
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 z-10 p-4">
            <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-secondary">
              {humanizeAssetClass(asset.asset_class)}
            </p>
            <h2 className="mt-1.5 text-[21px] font-semibold tracking-[-0.035em] text-success">
              {asset.symbol}
            </h2>
            <p className="mt-1 text-[11px] font-medium text-primary">
              {asset.name}
            </p>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-[10px] font-semibold text-accent">
            {asset.issuer}
          </p>
          <p className="mt-2 min-h-8 text-[10px] leading-4 text-tertiary line-clamp-2">
            {asset.description}
          </p>
          <div className="mt-4 grid gap-3 border-t border-edge pt-3">
            <dl className="grid grid-cols-2 gap-2">
              <div>
                <dt className="text-[8px] uppercase tracking-[0.08em] text-tertiary">
                  Deployment
                </dt>
                <dd
                  className={`mt-0.5 text-[10px] font-semibold ${
                    asset.deployment_verified ? "text-success" : "text-warning"
                  }`}
                >
                  {asset.deployment_verified ? "VERIFIED" : "NOT VERIFIED"}
                </dd>
              </div>
              <div>
                <dt className="text-[8px] uppercase tracking-[0.08em] text-tertiary">
                  Framework
                </dt>
                <dd
                  className={`mt-0.5 text-[10px] font-semibold ${
                    asset.framework_verified ? "text-success" : "text-warning"
                  }`}
                >
                  {asset.framework_verified ? "VERIFIED" : "NOT VERIFIED"}
                </dd>
              </div>
              <div>
                <dt className="text-[8px] uppercase tracking-[0.08em] text-tertiary">
                  Backing
                </dt>
                <dd
                  className={`mt-0.5 text-[10px] font-semibold ${
                    asset.backing_verified ? "text-success" : "text-warning"
                  }`}
                >
                  {asset.backing_verified ? "VERIFIED" : "NOT AVAILABLE"}
                </dd>
              </div>
              <div>
                <dt className="text-[8px] uppercase tracking-[0.08em] text-tertiary">
                  RVC Status
                </dt>
                <dd className="mt-0.5 text-[10px] font-semibold text-primary">
                  {asset.rvc_status}
                </dd>
              </div>
            </dl>
            <span className="surface-transition text-[10px] font-semibold text-accent group-hover:translate-x-0.5 group-hover:text-accent">
              Inspect asset &rarr;
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

export function AssetExplorer({
  apiAssets,
  apiTotal,
}: {
  apiAssets: ApiAsset[];
  apiTotal: number;
}) {
  const [query, setQuery] = useState("");
  const [originFilter, setOriginFilter] = useState("");
  const [supportFilter, setSupportFilter] = useState("");
  const [classFilter, setClassFilter] = useState("All classes");

  const visibleAssets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apiAssets.filter((asset) => {
      const matchesQuery =
        q.length === 0 ||
        [asset.symbol, asset.name, asset.issuer, asset.asset_class, asset.description]
          .join(" ")
          .toLowerCase()
          .includes(q);

      const matchesOrigin =
        !originFilter || asset.asset_origin === originFilter;

      let matchesSupport = true;
      if (supportFilter === "FAILED_INDETERMINATE") {
        matchesSupport =
          asset.rvc_status === "FAIL" ||
          asset.rvc_status === "INDETERMINATE" ||
          asset.verification_support === "UNSUPPORTED";
      } else if (supportFilter) {
        matchesSupport = asset.verification_support === supportFilter;
      }

      const matchesClass =
        classFilter === "All classes" || asset.asset_class === classFilter;

      return matchesQuery && matchesOrigin && matchesSupport && matchesClass;
    });
  }, [apiAssets, query, originFilter, supportFilter, classFilter]);

  const assetClasses = useMemo(() => {
    const classes = new Set(apiAssets.map((a) => a.asset_class));
    return Array.from(classes).sort();
  }, [apiAssets]);

  return (
    <>
      <section
        className="rounded-[10px] border border-edge bg-surface p-4 sm:p-5"
        aria-label="Asset Explorer controls"
      >
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px_180px]">
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
                placeholder="Search name, symbol, issuer..."
                className="h-10 w-full rounded-[8px] border border-edge bg-success-soft pl-10 pr-3 text-[12px] text-primary placeholder:text-tertiary"
              />
            </span>
          </label>

          <label className="block">
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-tertiary">
              Origin
            </span>
            <select
              value={originFilter}
              onChange={(e) => setOriginFilter(e.target.value)}
              className="mt-2 h-10 w-full rounded-[8px] border border-edge bg-success-soft px-3 text-[11px] text-accent"
            >
              {ORIGIN_FILTERS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-tertiary">
              Support level
            </span>
            <select
              value={supportFilter}
              onChange={(e) => setSupportFilter(e.target.value)}
              className="mt-2 h-10 w-full rounded-[8px] border border-edge bg-success-soft px-3 text-[11px] text-accent"
            >
              {SUPPORT_FILTERS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-tertiary">
              Asset class
            </span>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="mt-2 h-10 w-full rounded-[8px] border border-edge bg-success-soft px-3 text-[11px] text-accent"
            >
              <option value="All classes">All classes</option>
              {assetClasses.map((cls) => (
                <option key={cls} value={cls}>
                  {humanizeAssetClass(cls)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <div className="mt-4 flex items-center justify-between gap-3 px-1">
        <p className="text-[10px] text-secondary" aria-live="polite">
          Showing <strong className="font-semibold text-success">{visibleAssets.length}</strong>{" "}
          of {apiTotal} assets
        </p>
        <p className="hidden text-[9px] uppercase tracking-[0.09em] text-tertiary sm:block">
          Verification coverage / not a marketplace
        </p>
      </div>

      {visibleAssets.length === 0 ? (
        <div className="mt-4 rounded-[10px] border border-dashed border-edge bg-surface px-5 py-14 text-center">
          <p className="text-sm font-semibold text-primary">
            No assets match these filters
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setOriginFilter("");
              setSupportFilter("");
              setClassFilter("All classes");
            }}
            className="mt-3 text-[11px] font-semibold text-accent hover:text-brand-bright"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleAssets.map((asset) => (
            <AssetCard key={asset.symbol} asset={asset} />
          ))}
        </div>
      )}
    </>
  );
}
