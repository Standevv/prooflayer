"use client";

import { useCallback } from "react";
import { type MarketTrustData } from "@/components/market-trust-badge";

type MarketTrustDrawerProps = {
  trust: MarketTrustData | null;
  loading: boolean;
  onClose: () => void;
  onCompare?: (assetAddress: string) => void;
};

const STATUS_LABELS: Record<string, { color: string; label: string }> = {
  VERIFIED: { color: "text-emerald-400", label: "VERIFIED" },
  PARTIAL_COVERAGE: { color: "text-yellow-400", label: "PARTIAL COVERAGE" },
  STALE: { color: "text-orange-400", label: "STALE" },
  UNVERIFIED: { color: "text-zinc-400", label: "UNVERIFIED" },
  INDETERMINATE: { color: "text-amber-400", label: "INDETERMINATE" },
  BLOCKED: { color: "text-red-400", label: "BLOCKED" },
};

function FieldRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | number | boolean | null | undefined;
  mono?: boolean;
}) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-zinc-500 text-xs shrink-0">{label}</span>
      <span
        className={`text-zinc-200 text-xs text-right ${mono ? "font-mono" : ""}`}
      >
        {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
      </span>
    </div>
  );
}

function Section({
  title,
  authority,
  children,
}: {
  title: string;
  authority: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-zinc-800 rounded-lg p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          {title}
        </h4>
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 font-medium">
          {authority}
        </span>
      </div>
      {children}
    </div>
  );
}

export function MarketTrustDrawer({
  trust,
  loading,
  onClose,
  onCompare,
}: MarketTrustDrawerProps) {
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!trust && !loading) return null;

  const coverage = trust?.verification_coverage;
  const status = coverage?.verification_status || "UNVERIFIED";
  const statusInfo = STATUS_LABELS[status] || STATUS_LABELS.UNVERIFIED;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">
                {trust?.symbol || "..."} Trust Layer
              </h3>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                {trust?.name || "Loading..."}
              </p>
            </div>
            {coverage && (
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded ${statusInfo.color}`}
              >
                {statusInfo.label}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {loading && !trust ? (
          <div className="p-8 text-center text-zinc-500 text-sm">
            Loading trust data...
          </div>
        ) : trust ? (
          <div className="p-4">
            {/* Authoritative labels */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-medium">
                ONCHAIN FACT
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-medium">
                PROOFLAYER VERIFICATION
              </span>
              {coverage?.limitations && coverage.limitations.length > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-medium">
                  AI INTERPRETATION
                </span>
              )}
            </div>

            {/* Market State */}
            <Section title="Market State" authority="ONCHAIN FACT">
              <FieldRow label="Asset" value={trust.symbol} />
              <FieldRow label="Category" value={trust.category} />
              <FieldRow
                label="Aave V3"
                value={trust.aave_available ? "Available" : "Not available"}
              />
              {trust.supply_apy_display && (
                <FieldRow label="Supply APY" value={trust.supply_apy_display} />
              )}
              {trust.borrow_apy_display && (
                <FieldRow label="Borrow APY" value={trust.borrow_apy_display} />
              )}
              {trust.available_liquidity && (
                <FieldRow
                  label="Liquidity"
                  value={trust.available_liquidity}
                />
              )}
              {trust.collateral_enabled !== null && (
                <FieldRow
                  label="Collateral"
                  value={trust.collateral_enabled ? "Enabled" : "Disabled"}
                />
              )}
              {trust.ltv !== null && trust.ltv !== undefined && (
                <FieldRow
                  label="LTV"
                  value={`${(trust.ltv * 100).toFixed(0)}%`}
                />
              )}
            </Section>

            {/* Verification State */}
            <Section title="Verification State" authority="PROOFLAYER VERIFICATION">
              <FieldRow
                label="RVC Result"
                value={coverage?.rvc_result || "—"}
                mono
              />
              {coverage?.reason_codes && coverage.reason_codes.length > 0 && (
                <FieldRow
                  label="Reason Codes"
                  value={coverage.reason_codes.join(", ")}
                  mono
                />
              )}
              <FieldRow
                label="Evidence"
                value={
                  coverage?.evidence_roots !== null &&
                  coverage?.evidence_roots !== undefined
                    ? `${coverage.evidence_roots} roots`
                    : "—"
                }
              />
              <FieldRow
                label="Freshness"
                value={coverage?.freshness_state || "UNKNOWN"}
              />
              {coverage?.limitations && coverage.limitations.length > 0 && (
                <div className="mt-2">
                  {coverage.limitations.map((lim, i) => (
                    <div
                      key={i}
                      className="text-[11px] text-yellow-400/80 flex items-start gap-1.5 mt-1"
                    >
                      <span className="shrink-0 mt-px">!</span>
                      <span>{lim}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Certificate State */}
            <Section title="Certificate State" authority="LIVE ON-CHAIN">
              <FieldRow
                label="Certificate"
                value={coverage?.certificate_state || "—"}
                mono
              />
              {coverage?.certificate_usable !== null && coverage?.certificate_usable !== undefined && (
                <FieldRow
                  label="Usable"
                  value={coverage.certificate_usable ? "Yes" : "No"}
                />
              )}
            </Section>

            {/* PolicyGate State */}
            <Section title="PolicyGate State" authority="LIVE ON-CHAIN">
              <FieldRow
                label="Outcome"
                value={coverage?.policygate_state || "—"}
                mono
              />
            </Section>

            {/* Raw Authoritative Values */}
            <Section
              title="Raw Authoritative Values"
              authority="NEVER FABRICATED"
            >
              <FieldRow
                label="RVC"
                value={trust.raw_rvc_result || "—"}
                mono
              />
              <FieldRow
                label="Certificate"
                value={trust.raw_certificate_state || "—"}
                mono
              />
              <FieldRow
                label="PolicyGate"
                value={trust.raw_policygate_outcome || "—"}
                mono
              />
              {trust.raw_reason_codes.length > 0 && (
                <FieldRow
                  label="Reasons"
                  value={trust.raw_reason_codes.join(", ")}
                  mono
                />
              )}
              {trust.raw_evidence_root_count !== null &&
                trust.raw_evidence_root_count !== undefined && (
                  <FieldRow
                    label="Roots"
                    value={trust.raw_evidence_root_count}
                    mono
                  />
                )}
            </Section>

            {/* Compare with AI */}
            {onCompare && (
              <button
                type="button"
                onClick={() => onCompare(trust.asset_address)}
                className="w-full rounded-[4px] border border-brand/30 bg-brand/[0.08] px-3 py-2 text-[9px] font-semibold uppercase tracking-wider text-brand hover:bg-brand/[0.14] mt-3"
              >
                [COMPARE WITH AI]
              </button>
            )}

            {/* Footer */}
            <div className="text-[10px] text-zinc-600 mt-4 pt-3 border-t border-zinc-800">
              <p>
                Observed:{" "}
                {new Date(trust.observed_at).toLocaleString()}
              </p>
              <p className="mt-1">
                Market listing does not imply verification approval.
                Verification states are display-only and never overwrite raw
                PASS/FAIL/INDETERMINATE results.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
