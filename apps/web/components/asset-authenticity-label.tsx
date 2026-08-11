import type { AssetAuthenticityLabel } from "@/lib/assets";

const toneStyles: Record<AssetAuthenticityLabel["tone"], string> = {
  live: "border-[#8b7ce7]/30 bg-[#8b7ce7]/[0.09] text-[#c0b8f5]",
  fixture: "border-white/[0.14] bg-white/[0.045] text-[#c2c5cd]",
  success: "border-[#36d17c]/25 bg-[#36d17c]/[0.08] text-[#36d17c]",
  warning: "border-[#e9b949]/25 bg-[#e9b949]/[0.08] text-[#e9b949]",
  neutral: "border-white/[0.1] bg-black/25 text-[#969ba8]",
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
