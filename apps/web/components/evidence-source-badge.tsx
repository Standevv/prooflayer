import type { EvidenceAuthenticityLabel } from "@/lib/evidence";

const tones: Record<EvidenceAuthenticityLabel, string> = {
  ISSUER: "border-brand/25 bg-brand/[0.07] text-accent",
  ATTESTATION: "border-success/25 bg-success-soft/[0.07] text-success",
  "ON-CHAIN": "border-brand/25 bg-accent/[0.07] text-accent",
  "DEMO FIXTURE": "border-edge-strong bg-overlay-hover text-primary",
  DERIVED: "border-brand/20 bg-brand-muted/[0.06] text-brand-bright",
  "LIVE READ": "border-success/25 bg-success-soft/[0.08] text-success",
  "CACHED OFFICIAL EVIDENCE": "border-warning/20 bg-warning/[0.06] text-warning",
};

export function EvidenceSourceBadge({ label }: { label: EvidenceAuthenticityLabel }) {
  return (
    <span className={`inline-flex rounded-[3px] border px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] ${tones[label]}`}>
      {label}
    </span>
  );
}
