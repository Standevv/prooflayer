/**
 * Runtime validation guards for Markets API responses.
 * Imported by the markets page and used in tests.
 */

/* ── Constants ─────────────────────────────────────────────────────── */

export const XLAYER_CHAIN_ID = 196;
export const XLAYER_CHAIN_HEX = "0xC4";
export const XLAYER_RPC = "https://rpc.xlayer.tech";
export const XLAYER_EXPLORER = "https://www.oklink.com/x-layer";

export const AAVE_V3_POOL = "0xE3F3Caefdd7180F884c01E57f65Df979Af84f116";
export const AAVE_ORACLE = "0x91FC11136d5615575a0fC5981Ab5C0C54418E2C6";

export const UNISWAP_ROUTER = "0x4f0c28f5926afda16bf2506d5d9e57ea190f9bca";
export const UNISWAP_QUOTER = "0xd1b797d92d87b688193a2b976efc8d577d204343";

export const WOKB_ADDRESS = "0xe538905cf8410324e03a5a23c1c177a474d59b2b";

export const XLAYER_NETWORK_PARAMS = {
  chainId: XLAYER_CHAIN_HEX,
  chainName: "X Layer Mainnet",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
  rpcUrls: [XLAYER_RPC],
  blockExplorerUrls: [`${XLAYER_EXPLORER}/`],
};

/** Verified Aave V3 X Layer reserve addresses (8 tokens). */
export const VERIFIED_AAVE_RESERVES: Set<string> = new Set([
  "0x779ded0c9e1022225f8e0630b35a9b54be713736", // USDT0 (6 dec)
  "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8", // USDG  (6 dec)
  "0xe538905cf8410324e03a5a23c1c177a474d59b2b", // WOKB  (18 dec)
  "0xb7c00000bcdeef966b20b3d884b98e64d2b06b4f", // xBTC  (8 dec)
  "0xe7b000003a45145decf8a28fc755ad5ec5ea025a", // xETH  (18 dec)
  "0x505000008de8748dbd4422ff4687a4fc9beba15b", // xSOL  (9 dec)
  "0xafeab3b85b6a56cf5f02317f0f7a23340eb983d7", // xBETH (18 dec)
  "0x14a686103854dab7b8801e31979caa595835b25d", // xOKSOL(9 dec)
]);

/** Token decimals map — canonical, never assumed. */
export const TOKEN_DECIMALS: Record<string, number> = {
  "0x779ded0c9e1022225f8e0630b35a9b54be713736": 6,  // USDT0
  "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8": 6,  // USDG
  "0xe538905cf8410324e03a5a23c1c177a474d59b2b": 18, // WOKB
  "0xb7c00000bcdeef966b20b3d884b98e64d2b06b4f": 8,  // xBTC
  "0xe7b000003a45145decf8a28fc755ad5ec5ea025a": 18, // xETH
  "0x505000008de8748dbd4422ff4687a4fc9beba15b": 9,  // xSOL
  "0xafeab3b85b6a56cf5f02317f0f7a23340eb983d7": 18, // xBETH
  "0x14a686103854dab7b8801e31979caa595835b25d": 9,  // xOKSOL
};

/* ── Runtime Guards ────────────────────────────────────────────────── */

export function isValidAddress(addr: unknown): addr is string {
  return typeof addr === "string" && /^0x[0-9a-fA-F]{40}$/.test(addr);
}

export function isValidISO(iso: unknown): iso is string {
  return typeof iso === "string" && !isNaN(Date.parse(iso));
}

export function guardMarketAsset(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    isValidAddress(r.address) &&
    typeof r.symbol === "string" &&
    typeof r.name === "string" &&
    typeof r.decimals === "number" &&
    typeof r.category === "string" &&
    typeof r.chain_id === "number" &&
    isValidISO(r.observed_at)
  );
}

export function guardEarnOpportunity(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    isValidAddress(r.asset_address) &&
    typeof r.symbol === "string" &&
    typeof r.protocol === "string" &&
    isValidISO(r.observed_at)
  );
}

export function guardBorrowOpportunity(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return (
    isValidAddress(r.asset_address) &&
    typeof r.symbol === "string" &&
    typeof r.protocol === "string" &&
    isValidISO(r.observed_at)
  );
}

export function isVerifiedAaveReserve(addr: string): boolean {
  return VERIFIED_AAVE_RESERVES.has(addr.toLowerCase());
}

/* ── Time Display ──────────────────────────────────────────────────── */

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 0) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

/* ── Opportunity Matching ──────────────────────────────────────────── */

interface EarnOpp {
  asset_address: string;
  symbol: string;
}

interface BorrowOpp {
  asset_address: string;
  symbol: string;
}

interface Asset {
  address: string;
  symbol: string;
}

/** Resolve an earn opportunity by asset address first, then symbol fallback. */
export function resolveEarn(
  asset: Asset,
  earnByAddr: Map<string, EarnOpp>,
  earnBySymbol: Map<string, EarnOpp>
): EarnOpp | undefined {
  return earnByAddr.get(asset.address.toLowerCase()) ?? earnBySymbol.get(asset.symbol.toLowerCase());
}

/** Resolve a borrow opportunity by asset address first, then symbol fallback. */
export function resolveBorrow(
  asset: Asset,
  borrowByAddr: Map<string, BorrowOpp>,
  borrowBySymbol: Map<string, BorrowOpp>
): BorrowOpp | undefined {
  return borrowByAddr.get(asset.address.toLowerCase()) ?? borrowBySymbol.get(asset.symbol.toLowerCase());
}

/* ── Amount Conversion ─────────────────────────────────────────────── */

/** Validate a human-readable amount string. Returns true if parseable as a positive number. */
export function isValidAmount(amount: string): boolean {
  if (!amount || amount.trim() === "") return false;
  const n = Number(amount);
  return !isNaN(n) && n > 0 && isFinite(n);
}

/** Convert human amount string to raw bigint given token decimals. */
export function humanToRaw(amount: string, decimals: number): bigint {
  if (!isValidAmount(amount)) throw new Error(`Invalid amount: ${amount}`);
  const parts = amount.split(".");
  const integerPart = parts[0] || "0";
  const fractionalPart = (parts[1] || "").padEnd(decimals, "0").slice(0, decimals);
  const raw = BigInt(integerPart + fractionalPart);
  return raw;
}

/* ── Health Factor Projection ──────────────────────────────────────── */

/** Calculate projected health factor after a borrow. */
export function projectHealthFactor(
  totalCollateralBase: bigint,
  totalDebtBase: bigint,
  borrowAmountBase: bigint,
  liquidationThreshold: bigint // in basis points
): { projectedHF: number; safe: boolean } {
  const projectedDebt = totalDebtBase + borrowAmountBase;
  if (projectedDebt === BigInt(0)) {
    return { projectedHF: Infinity, safe: true };
  }
  const hfBig = (totalCollateralBase * liquidationThreshold) / (projectedDebt * BigInt(10000));
  const projectedHF = Number(hfBig) / 1e18;
  return { projectedHF, safe: projectedHF >= 1.05 };
}

/* ── Token Validation ──────────────────────────────────────────────── */

/** Check if a token address is in the supported list. */
export function isSupportedToken(address: string): boolean {
  return VERIFIED_AAVE_RESERVES.has(address.toLowerCase()) || address.toLowerCase() === WOKB_ADDRESS.toLowerCase();
}

/** Get decimals for a verified token. Returns null for unknown tokens. */
export function getTokenDecimals(address: string): number | null {
  return TOKEN_DECIMALS[address.toLowerCase()] ?? null;
}
