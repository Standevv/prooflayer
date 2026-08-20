"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TrustStatus =
  | "VERIFIED"
  | "PARTIAL_COVERAGE"
  | "STALE"
  | "UNVERIFIED"
  | "INDETERMINATE"
  | "BLOCKED"
  | "LOADING"
  | "ERROR";

export type VerificationCoverage = {
  asset_address: string;
  symbol: string;
  verification_available: boolean;
  verification_status: TrustStatus;
  verification_result: string | null;
  rvc_result: string | null;
  reason_codes: string[];
  certificate_state: string | null;
  certificate_usable: boolean | null;
  policygate_state: string | null;
  evidence_roots: number | null;
  evidence_count: number | null;
  freshness_state: string;
  limitations: string[];
  observed_at: string;
};

export type MarketTrustData = {
  asset_address: string;
  symbol: string;
  name: string;
  category: string;
  market_active: boolean;
  aave_available: boolean;
  supply_apy: number | null;
  supply_apy_display: string | null;
  borrow_apy: number | null;
  borrow_apy_display: string | null;
  available_liquidity: string | null;
  collateral_enabled: boolean | null;
  ltv: number | null;
  liquidation_threshold: number | null;
  verification_coverage: VerificationCoverage;
  raw_rvc_result: string | null;
  raw_certificate_state: string | null;
  raw_certificate_usable: boolean | null;
  raw_policygate_outcome: string | null;
  raw_reason_codes: string[];
  raw_evidence_root_count: number | null;
  observed_at: string;
};

const STATUS_CONFIG: Record<
  string,
  { bg: string; text: string; label: string; icon: string }
> = {
  VERIFIED: {
    bg: "bg-emerald-500/20",
    text: "text-emerald-400",
    label: "VERIFIED",
    icon: "✓",
  },
  PARTIAL_COVERAGE: {
    bg: "bg-yellow-500/20",
    text: "text-yellow-400",
    label: "PARTIAL",
    icon: "~",
  },
  STALE: {
    bg: "bg-orange-500/20",
    text: "text-orange-400",
    label: "STALE",
    icon: "!",
  },
  UNVERIFIED: {
    bg: "bg-zinc-500/20",
    text: "text-zinc-400",
    label: "UNVERIFIED",
    icon: "?",
  },
  INDETERMINATE: {
    bg: "bg-amber-500/20",
    text: "text-amber-400",
    label: "INDETERMINATE",
    icon: "?",
  },
  BLOCKED: {
    bg: "bg-red-500/20",
    text: "text-red-400",
    label: "BLOCKED",
    icon: "✗",
  },
  LOADING: {
    bg: "bg-zinc-500/20",
    text: "text-zinc-500",
    label: "...",
    icon: "…",
  },
  ERROR: {
    bg: "bg-zinc-500/20",
    text: "text-zinc-500",
    label: "UNAVAILABLE",
    icon: "—",
  },
};

export function useMarketTrust(address: string | null) {
  const [trust, setTrust] = useState<MarketTrustData | null>(null);
  const [status, setStatus] = useState<TrustStatus>("LOADING");
  const fetchIdRef = useRef(0);

  useEffect(() => {
    if (!address) {
      return;
    }

    const id = ++fetchIdRef.current;

    fetch(`/api/markets/trust/${address}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((data: MarketTrustData) => {
        if (id === fetchIdRef.current) {
          setTrust(data);
          setStatus(data.verification_coverage?.verification_status || "UNVERIFIED");
        }
      })
      .catch(() => {
        if (id === fetchIdRef.current) {
          setTrust(null);
          setStatus("ERROR");
        }
      });
  }, [address]);

  return { trust, status };
}

type MarketTrustBadgeProps = {
  address: string;
  onClick?: () => void;
};

export function MarketTrustBadge({ address, onClick }: MarketTrustBadgeProps) {
  const { trust, status: rawStatus } = useMarketTrust(address);
  const status = address ? rawStatus : "ERROR";
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.UNVERIFIED;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick?.();
    },
    [onClick],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none tracking-wide ${config.bg} ${config.text} transition-colors hover:opacity-80 cursor-pointer`}
      title={
        status === "VERIFIED"
          ? `ProofLayer verified — ${trust?.symbol || "asset"}`
          : status === "BLOCKED"
            ? `ProofLayer blocked — ${trust?.verification_coverage?.limitations?.[0] || "see details"}`
            : `ProofLayer: ${config.label} — click for details`
      }
    >
      <span className="text-[9px]">{config.icon}</span>
      <span>PL</span>
      <span className="opacity-60">{config.label}</span>
    </button>
  );
}
