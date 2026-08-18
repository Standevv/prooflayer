import Image from "next/image";

import { Icon, type IconName } from "@/components/icons";
import type { DemoCertificate } from "@/lib/demo-data";

const evidenceSources = [
  {
    source: "Ondo",
    type: "Issuer evidence",
    role: "Product documentation",
    icon: "certificate" as const,
  },
  {
    source: "Ethereum",
    type: "On-chain evidence",
    role: "Independent root",
    icon: "network" as const,
  },
] as const;

const provenanceSteps: Array<{ label: string; value: string; icon: IconName }> = [
  { label: "Source", value: "Institutional records", icon: "certificate" },
  { label: "Normalize", value: "Structured evidence", icon: "database" },
  { label: "Verify", value: "Policy evaluation", icon: "shield" },
  { label: "Commit", value: "Evidence root", icon: "network" },
];

export function EvidencePanel({ certificate }: { certificate: DemoCertificate }) {
  return (
    <section
      className="overflow-hidden rounded-[10px] border border-edge bg-surface"
      aria-labelledby="evidence-heading"
    >
      <div className="border-b border-edge px-5 py-5 sm:px-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-tertiary">Evidence &amp; provenance</p>
        <h2 id="evidence-heading" className="mt-2 max-w-3xl text-[24px] font-semibold leading-[1.08] tracking-[-0.04em] text-brand-bright sm:text-[28px]">
          Evidence you can trace.<br className="hidden sm:block" /> Not screenshots you have to trust.
        </h2>
        <p className="mt-3 max-w-3xl text-[12px] leading-5 text-secondary sm:text-[13px]">
          ProofLayer normalizes real-world evidence, preserves its provenance, and commits evidence for deterministic policy evaluation.
        </p>
      </div>

      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <figure className="relative min-h-[300px] overflow-hidden rounded-[10px] border border-edge bg-surface sm:min-h-[320px] lg:min-h-[360px]">
          <Image
            src="/assets/institutional-custody-vault.jpeg"
            alt="Open institutional vault surrounded by secure custody compartments"
            fill
            sizes="(max-width: 1023px) 100vw, 60vw"
            className="custody-evidence-photo object-cover"
          />
          <div className="custody-evidence-shade absolute inset-0" aria-hidden="true" />
          <div className="custody-evidence-grid absolute inset-0" aria-hidden="true" />

          <span className="absolute right-4 top-4 rounded-[4px] border border-edge bg-success-soft/70 px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-secondary backdrop-blur-sm">
            Contextual custody layer
          </span>

          <figcaption className="absolute inset-x-0 bottom-0 z-10 p-4 sm:p-5">
            <p className="text-[8px] font-semibold uppercase tracking-[0.13em] text-primary">Evidence layer</p>
            <p className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-brand-bright">Institutional-grade provenance</p>
            <p className="mt-2 max-w-xl text-[10px] leading-4 text-primary sm:text-[11px]">
              Source records are normalized, traced, and committed before an asset claim can be trusted.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-edge pt-3">
              {[
                { label: "Source", value: "Custody records" },
                { label: "Integrity", value: "Evidence commitment" },
                { label: "Verification", value: "Policy evaluated" },
              ].map((item) => (
                <div key={item.label} className="min-w-0">
                  <p className="text-[7px] font-semibold uppercase tracking-[0.11em] text-success sm:text-[8px]">{item.label}</p>
                  <p className="mt-1 text-[9px] font-medium leading-3 text-primary sm:text-[10px]">{item.value}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[8px] leading-3 text-secondary">
              Product context only — not a source in the historical certificate evidence below or the current USDY verification.
            </p>
          </figcaption>
        </figure>

        <div className="rounded-[10px] border border-edge bg-elevated p-4 sm:p-5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-tertiary">Evidence transformation</p>
          <h3 className="mt-1.5 text-[15px] font-semibold tracking-[-0.02em] text-accent">From records to enforceable proof</h3>

          <div className="mt-5">
            {provenanceSteps.map((step, index) => (
              <div key={step.label}>
                <div className="surface-transition grid grid-cols-[38px_minmax(0,1fr)] items-center gap-3 rounded-[8px] border border-edge bg-overlay-active p-3 hover:border-edge hover:bg-overlay-hover">
                  <span className="grid size-[38px] place-items-center rounded-[8px] border border-success/18 bg-success-soft/[0.045] text-success">
                    <Icon name={step.icon} className="size-4" />
                  </span>
                  <div>
                    <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-secondary">{step.label}</p>
                    <p className="mt-1 text-[11px] font-medium text-primary">{step.value}</p>
                  </div>
                </div>
                {index < provenanceSteps.length - 1 ? (
                  <div className="flex h-4 items-center pl-[18px] text-[10px] text-success" aria-hidden="true">&darr;</div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-edge px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-tertiary">Historical reference certificate evidence</p>
            <h3 className="mt-1 text-lg font-semibold tracking-[-0.025em] text-accent">Historical Evidence Graph</h3>
          </div>
          <p className="max-w-xl text-[10px] leading-4 text-secondary">This records the historical fixture composition and does not establish a current RVC PASS.</p>
        </div>
      </div>

      <div className="grid gap-6 px-5 pb-5 lg:grid-cols-[1fr_250px] lg:items-center sm:px-6">
        <div className="relative space-y-3 before:absolute before:bottom-10 before:left-[19px] before:top-10 before:w-px before:bg-gradient-to-b before:from-success-soft/70 before:to-success-soft/15">
          {evidenceSources.map((item) => (
            <div
              key={item.source}
              className="surface-transition relative grid grid-cols-[40px_minmax(0,1fr)] gap-3 rounded-[9px] border border-edge bg-elevated p-3 hover:border-edge hover:bg-success-soft sm:grid-cols-[40px_0.65fr_0.9fr_auto] sm:items-center"
            >
              <span className="relative z-10 grid size-10 place-items-center rounded-full border border-success/25 bg-success-soft text-success">
                <Icon name={item.icon} className="size-4" />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-accent">{item.source}</p>
                <p className="mt-0.5 text-[10px] text-secondary">{item.type}</p>
              </div>
              <p className="col-start-2 text-[11px] text-primary sm:col-start-auto">{item.role}</p>
              <span className="col-start-2 inline-flex w-fit items-center gap-1.5 rounded-full border border-success/20 bg-success-soft/[0.06] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.07em] text-success sm:col-start-auto">
                <span className="size-1 rounded-full bg-success-soft" aria-hidden="true" />
                Historical input
              </span>
            </div>
          ))}
        </div>

        <div className="relative rounded-[10px] border border-success/20 bg-success-soft/[0.045] p-5 text-center shadow-[0_0_36px_rgba(54,209,124,0.05)]">
          <span className="mx-auto grid size-11 place-items-center rounded-[9px] border border-success/25 bg-success-soft/[0.08] text-success">
            <Icon name="database" className="size-5" />
          </span>
          <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.11em] text-secondary">Historical evidence commitment</p>
          <p className="mt-1 text-sm font-semibold text-accent">USDY Treasury Backing</p>
          <p className="mt-2 font-mono text-[11px] text-success">
            {certificate.human.independent_root_count} independent roots
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-edge bg-overlay-active px-5 py-3 text-[10px] text-secondary sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="font-semibold text-secondary">Historical independent evidence roots: {certificate.human.independent_root_count}</p>
        <p>Historical certificate input only; inspect current evidence for present verification truth.</p>
      </div>
    </section>
  );
}
