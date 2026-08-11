import { sourceTone, type AuthenticitySource } from "@/lib/certificates";

const toneStyles = {
  live: "border-[#8f7df0]/30 bg-[#8f7df0]/[0.09] text-[#c4bbff]",
  fixture: "border-white/[0.14] bg-white/[0.045] text-[#c9ccd4]",
  derived: "border-[#58a6ff]/20 bg-[#58a6ff]/[0.06] text-[#8fc5ff]",
  unavailable: "border-[#e9b949]/20 bg-[#e9b949]/[0.06] text-[#e9b949]",
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
