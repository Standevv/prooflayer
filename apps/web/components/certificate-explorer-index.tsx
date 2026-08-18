"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { CertificateSearch } from "@/components/certificate-search";
import { CertificateSourceBadge } from "@/components/certificate-source-badge";
import {
  formatCertificateTime,
  type CertificateApiError,
  type CertificateExplorerRecord,
  type UsabilityState,
  type VerificationResult,
} from "@/lib/certificates";

function resultStyle(result: VerificationResult | null): string {
  if (result === "PASS") return "border-success/25 bg-success-soft/[0.07] text-success";
  if (result === "FAIL") return "border-fail/25 bg-fail/[0.07] text-fail";
  return "border-warning/25 bg-warning/[0.07] text-warning";
}

function usabilityStyle(state: UsabilityState): string {
  if (state === "USABLE") return "text-success";
  if (state === "REVOKED") return "text-fail";
  return "text-warning";
}

function LoadingRows() {
  return (
    <div className="grid gap-3 lg:grid-cols-2" aria-label="Loading known certificates">
      {[0, 1].map((item) => (
        <div key={item} className="h-[272px] animate-pulse rounded-[8px] border border-edge bg-overlay-hover" />
      ))}
    </div>
  );
}

function CertificateIndexCard({ record }: { record: CertificateExplorerRecord }) {
  const result = record.core.result;
  const displayTime = (value: number | null) => value === null ? "Unavailable" : `${formatCertificateTime(value)} UTC`;
  return (
    <article className="group overflow-hidden rounded-[8px] border border-edge bg-surface transition-colors duration-150 hover:border-brand/30">
      <div className="flex items-start justify-between gap-4 border-b border-edge px-4 py-4 sm:px-5">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-tertiary">Verification certificate</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-accent">
            {record.labels.asset ?? "Unknown asset"}
          </h2>
          <p className="mt-1 text-[11px] text-secondary">{record.labels.claim ?? "Unknown / unmapped identifier"}</p>
        </div>
        <span className={`rounded-[4px] border px-2 py-1 text-[9px] font-bold tracking-[0.08em] ${resultStyle(result)}`}>
          Historical {result ?? "UNKNOWN"}
        </span>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div>
          <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-tertiary">Certificate ID</p>
          <p className="mt-1 break-all font-mono text-[10px] leading-4 text-accent">{record.certificate_id}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[10px]">
          <div>
            <dt className="uppercase tracking-[0.08em] text-tertiary">Observed at</dt>
            <dd className="mt-1 text-primary">{displayTime(record.core.observed_at)}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.08em] text-tertiary">Valid until</dt>
            <dd className="mt-1 text-primary">{displayTime(record.core.valid_until)}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.08em] text-tertiary">Current usability</dt>
            <dd className={`mt-1 font-semibold ${usabilityStyle(record.usability.state)}`}>{record.usability.state}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.08em] text-tertiary">Registration</dt>
            <dd className="mt-1 font-semibold text-primary">
              {record.registry.read_status === "UNAVAILABLE"
                ? "LIVE READ UNAVAILABLE"
                : record.live_certificate_found
                  ? "REGISTERED"
                  : "NOT REGISTERED"}
            </dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-1.5">
          {record.authenticity_sources.map((source) => (
            <CertificateSourceBadge key={source} source={source as "LIVE ON-CHAIN" | "DEMO FIXTURE" | "DERIVED FROM KNOWN PROJECT CONFIG"} />
          ))}
          <span className={`inline-flex rounded-[3px] border px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.09em] ${record.usability.state === "USABLE" ? "border-success/25 bg-success-soft/[0.07] text-success" : "border-warning/20 bg-warning/[0.06] text-warning"}`}>
            {record.usability.state === "USABLE"
              ? "USABLE"
              : record.usability.state === "LIVE READ UNAVAILABLE"
                ? "LIVE READ UNAVAILABLE"
                : "UNUSABLE"}
          </span>
        </div>
      </div>
      <Link
        href={`/certificates/${record.certificate_id}`}
        className="surface-transition flex items-center justify-between border-t border-edge px-4 py-3 text-[9px] font-bold uppercase tracking-[0.1em] text-brand-bright hover:bg-brand/[0.05] hover:text-accent sm:px-5"
      >
        Inspect record
        <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}

export function CertificateExplorerIndex() {
  const [records, setRecords] = useState<CertificateExplorerRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/certificates", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as CertificateExplorerRecord[] | CertificateApiError;
        if (!response.ok || !Array.isArray(payload)) {
          throw new Error(Array.isArray(payload) ? "Certificate service unavailable." : payload.error);
        }
        setRecords(payload);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Certificate service unavailable.");
      });
    return () => controller.abort();
  }, []);

  return (
    <>
      <section className="overflow-hidden rounded-[9px] border border-edge bg-surface">
        <div className="border-b border-edge px-5 py-4 sm:px-6">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-brand">Search / lookup</p>
          <p className="mt-1 text-[11px] text-tertiary">Resolve one deterministic certificate record by its exact identifier.</p>
        </div>
        <div className="px-5 py-5 sm:px-6">
          <CertificateSearch />
        </div>
      </section>

      <section className="mt-4 rounded-[9px] border border-edge bg-accent-soft p-4 sm:p-5" aria-labelledby="known-certificates-heading">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-tertiary">Repository registry</p>
            <h2 id="known-certificates-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-accent">Known certificates</h2>
          </div>
          <p className="text-right font-mono text-[9px] text-tertiary">{records === null ? "--" : records.length.toString().padStart(2, "0")} records</p>
        </div>
        {error !== null ? (
          <div className="rounded-[7px] border border-warning/20 bg-warning/[0.05] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-warning">Certificate service unavailable</p>
            <p className="mt-2 text-[11px] leading-5 text-warning">{error}</p>
          </div>
        ) : records === null ? (
          <LoadingRows />
        ) : records.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-tertiary">No exported certificate fixtures were found.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {records.map((record) => <CertificateIndexCard key={record.certificate_id} record={record} />)}
          </div>
        )}
      </section>
    </>
  );
}
