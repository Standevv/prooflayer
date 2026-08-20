/**
 * Backend API types and fetcher for the /assets endpoint.
 *
 * The static PROOFLAYER_ASSETS in ./assets.ts is kept for backward
 * compatibility. This module provides dynamic data from the registry.
 */

const API_BASE =
  process.env.PROOFLAYER_API_URL ||
  process.env.PROOFLAYER_AGENT_API_URL ||
  "http://127.0.0.1:8010";

const REQUEST_TIMEOUT_MS = 15_000;

export type AssetOrigin = "X_LAYER_NATIVE" | "CROSS_CHAIN_REFERENCE";
export type VerificationSupport =
  | "FULLY_SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "DISCOVERED_ONLY"
  | "UNSUPPORTED";
export type DiscoveryStatus = "VERIFIED" | "WARNING" | "INDETERMINATE" | "FAILED" | "UNSUPPORTED";

export type ApiAsset = {
  symbol: string;
  name: string;
  issuer: string;
  asset_class: string;
  asset_origin: AssetOrigin;
  chain_id: number;
  contract_address: string;
  ethereum_address: string | null;
  verification_support: VerificationSupport;
  current_status: DiscoveryStatus;
  deployment_verified: boolean;
  framework_verified: boolean;
  backing_verified: boolean;
  rvc_status: string;
  deployed_on_xlayer: boolean;
  claims: string[];
  description: string;
};

export type ApiAssetDetail = ApiAsset & {
  decimals: number;
  evidence_adapter: string;
  deployment_source: string;
  issuer_source: string;
  discovery_timestamp: string;
  framework_evidence: Record<string, unknown> | null;
};

export type AssetsResponse = {
  assets: ApiAsset[];
  total: number;
  filters: Record<string, string | null>;
};

export type AssetFilters = {
  origin?: AssetOrigin;
  asset_class?: string;
  support?: VerificationSupport;
  search?: string;
};

export async function fetchAssets(
  filters: AssetFilters = {},
): Promise<AssetsResponse> {
  const params = new URLSearchParams();
  if (filters.origin) params.set("origin", filters.origin);
  if (filters.asset_class) params.set("asset_class", filters.asset_class);
  if (filters.support) params.set("support", filters.support);
  if (filters.search) params.set("search", filters.search);

  const qs = params.toString();
  const url = `${API_BASE}/assets${qs ? `?${qs}` : ""}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`Assets API returned ${res.status}`);
    return (await res.json()) as AssetsResponse;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchAssetDetail(
  symbol: string,
): Promise<ApiAssetDetail | null> {
  const url = `${API_BASE}/assets/${encodeURIComponent(symbol)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as ApiAssetDetail;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Derive human-readable asset class filter categories from the API data.
 */
export function assetClassCategories(assets: ApiAsset[]): string[] {
  const classes = new Set(assets.map((a) => a.asset_class));
  return Array.from(classes).sort();
}

/**
 * Map an API asset to a slug for the /assets/[slug] route.
 * Uses lowercase symbol, stripping the trailing 'x' for xStocks.
 */
export function assetToSlug(asset: ApiAsset): string {
  return asset.symbol.toLowerCase();
}

/**
 * Map a slug back to a symbol for API lookups.
 */
export function slugToSymbol(slug: string): string {
  // xStock symbols end in 'x' (AAPLx, TSLAx) — the slug is lowercase
  const upper = slug.toUpperCase();
  // If it already looks like an xStock symbol, return as-is
  if (upper.endsWith("X") && upper.length > 2) return upper;
  // Reference assets (USDY, PAXG)
  return upper;
}

/**
 * Derive authenticity labels for an asset.
 */
export function assetAuthenticityLabels(asset: ApiAsset): { label: string; tone: "live" | "fixture" | "success" | "warning" | "neutral" }[] {
  const labels: { label: string; tone: "live" | "fixture" | "success" | "warning" | "neutral" }[] = [];

  if (asset.asset_origin === "CROSS_CHAIN_REFERENCE") {
    labels.push({ label: "CROSS-CHAIN REFERENCE", tone: "warning" });
    labels.push({ label: "NOT X LAYER NATIVE", tone: "neutral" });
  } else if (asset.deployed_on_xlayer) {
    labels.push({ label: "X LAYER NATIVE", tone: "success" });
  }

  if (asset.deployment_verified) {
    labels.push({ label: "DEPLOYMENT VERIFIED", tone: "live" });
  }
  if (asset.framework_verified) {
    labels.push({ label: "FRAMEWORK VERIFIED", tone: "fixture" });
  }
  if (asset.backing_verified) {
    labels.push({ label: "BACKING VERIFIED", tone: "success" });
  }

  return labels;
}
