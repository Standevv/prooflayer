import type { AssetAuthenticityLabel } from "@/lib/assets";

const toneStyles: Record<AssetAuthenticityLabel["tone"], string> = {
  live: "border-brand/30 bg-brand/[0.09] text-accent",
  fixture: "border-edge-strong bg-overlay-hover text-primary",
  success: "border-success/25 bg-success-soft/[0.08] text-success",
  warning: "border-warning/25 bg-warning/[0.08] text-warning",
  neutral: "border-edge-strong bg-scrim text-secondary",
};

export function AssetAuthenticityLabel({
  label,
  tone,
}: AssetAuthenticityLabel) {
  return (
    <span
      className={`inline-flex rounded-[4px] border px-2 py-1 text-[8px] font-bold uppercase tracking-[0.1em] ${toneStyles[tone]}`}
    >
      {label}
    </span>
  );
}
