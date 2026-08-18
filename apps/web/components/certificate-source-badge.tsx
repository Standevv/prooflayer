import { sourceTone, type AuthenticitySource } from "@/lib/certificates";

const toneStyles = {
  live: "border-brand/30 bg-brand/[0.09] text-brand-bright",
  fixture: "border-edge-strong bg-overlay-hover text-primary",
  derived: "border-brand/20 bg-accent/[0.06] text-accent",
  unavailable: "border-warning/20 bg-warning/[0.06] text-warning",
} as const;

export function CertificateSourceBadge({ source }: { source: AuthenticitySource }) {
  return (
    <span
      className={`inline-flex rounded-[3px] border px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.09em] ${toneStyles[sourceTone(source)]}`}
    >
      {source}
    </span>
  );
}
