import type { EvidenceAuthenticityLabel } from "@/lib/evidence";

const tones: Record<EvidenceAuthenticityLabel, string> = {
  ISSUER: "border-[#8f7df0]/25 bg-[#8f7df0]/[0.07] text-[#b8adfa]",
  ATTESTATION: "border-[#36d17c]/25 bg-[#36d17c]/[0.07] text-[#63d997]",
  "ON-CHAIN": "border-[#70b7ff]/25 bg-[#70b7ff]/[0.07] text-[#87c3ff]",
  "DEMO FIXTURE": "border-white/[0.12] bg-white/[0.04] text-[#b6bac4]",
  DERIVED: "border-[#c69cff]/20 bg-[#c69cff]/[0.06] text-[#c9adf0]",
  "LIVE READ": "border-[#36d17c]/25 bg-[#36d17c]/[0.08] text-[#36d17c]",
  "CACHED OFFICIAL EVIDENCE": "border-[#e9b949]/20 bg-[#e9b949]/[0.06] text-[#d5b762]",
};

export function EvidenceSourceBadge({ label }: { label: EvidenceAuthenticityLabel }) {
  return (
    <span className={`inline-flex rounded-[3px] border px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] ${tones[label]}`}>
      {label}
    </span>
  );
}
