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
  if (result === "PASS") return "border-[#36d17c]/25 bg-[#36d17c]/[0.07] text-[#36d17c]";
  if (result === "FAIL") return "border-[#ff6b6b]/25 bg-[#ff6b6b]/[0.07] text-[#ff8181]";
  return "border-[#e9b949]/25 bg-[#e9b949]/[0.07] text-[#e9b949]";
}

function usabilityStyle(state: UsabilityState): string {
  if (state === "USABLE") return "text-[#36d17c]";
  if (state === "REVOKED") return "text-[#ff8181]";
  return "text-[#e9b949]";
}

function LoadingRows() {
  return (
    <div className="grid gap-3 lg:grid-cols-2" aria-label="Loading known certificates">
      {[0, 1].map((item) => (
        <div key={item} className="h-[272px] animate-pulse rounded-[8px] border border-white/[0.07] bg-white/[0.025]" />
      ))}
    </div>
  );
}

function CertificateIndexCard({ record }: { record: CertificateExplorerRecord }) {
  const result = record.core.result;
  const displayTime = (value: number | null) => value === null ? "Unavailable" : `${formatCertificateTime(value)} UTC`;
  return (
    <article className="group overflow-hidden rounded-[8px] border border-white/[0.09] bg-[#111319] transition-colors duration-150 hover:border-[#8f7df0]/30">
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-4 py-4 sm:px-5">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#767c89]">Verification certificate</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-[#f3f3f6]">
            {record.labels.asset ?? "Unknown asset"}
          </h2>
          <p className="mt-1 text-[11px] text-[#999eaa]">{record.labels.claim ?? "Unknown / unmapped identifier"}</p>
        </div>
        <span className={`rounded-[4px] border px-2 py-1 text-[9px] font-bold tracking-[0.08em] ${resultStyle(result)}`}>
          {result ?? "UNKNOWN"}
        </span>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div>
          <p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#686e7b]">Certificate ID</p>
          <p className="mt-1 break-all font-mono text-[10px] leading-4 text-[#cdd0d8]">{record.certificate_id}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[10px]">
          <div>
            <dt className="uppercase tracking-[0.08em] text-[#686e7b]">Observed at</dt>
            <dd className="mt-1 text-[#b9bdc6]">{displayTime(record.core.observed_at)}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.08em] text-[#686e7b]">Valid until</dt>
            <dd className="mt-1 text-[#b9bdc6]">{displayTime(record.core.valid_until)}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.08em] text-[#686e7b]">Current usability</dt>
            <dd className={`mt-1 font-semibold ${usabilityStyle(record.usability.state)}`}>{record.usability.state}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.08em] text-[#686e7b]">Registration</dt>
            <dd className="mt-1 font-semibold text-[#c8cbd3]">
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
          <span className={`inline-flex rounded-[3px] border px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.09em] ${record.usability.state === "USABLE" ? "border-[#36d17c]/25 bg-[#36d17c]/[0.07] text-[#36d17c]" : "border-[#e9b949]/20 bg-[#e9b949]/[0.06] text-[#e9b949]"}`}>
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
        className="surface-transition flex items-center justify-between border-t border-white/[0.07] px-4 py-3 text-[9px] font-bold uppercase tracking-[0.1em] text-[#a89bf6] hover:bg-[#8f7df0]/[0.05] hover:text-[#d5cfff] sm:px-5"
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
      <section className="overflow-hidden rounded-[9px] border border-white/[0.09] bg-[#111319]">
        <div className="border-b border-white/[0.07] px-5 py-4 sm:px-6">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#8f84dd]">Search / lookup</p>
          <p className="mt-1 text-[11px] text-[#797f8c]">Resolve one deterministic certificate record by its exact identifier.</p>
        </div>
        <div className="px-5 py-5 sm:px-6">
          <CertificateSearch />
        </div>
      </section>

      <section className="mt-4 rounded-[9px] border border-white/[0.08] bg-[#0e1015] p-4 sm:p-5" aria-labelledby="known-certificates-heading">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#777d89]">Repository registry</p>
            <h2 id="known-certificates-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#eeeeF2]">Known certificates</h2>
          </div>
          <p className="text-right font-mono text-[9px] text-[#656b77]">{records === null ? "--" : records.length.toString().padStart(2, "0")} records</p>
        </div>
        {error !== null ? (
          <div className="rounded-[7px] border border-[#e9b949]/20 bg-[#e9b949]/[0.05] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#e9b949]">Certificate service unavailable</p>
            <p className="mt-2 text-[11px] leading-5 text-[#b5a97f]">{error}</p>
          </div>
        ) : records === null ? (
          <LoadingRows />
        ) : records.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-[#777d89]">No exported certificate fixtures were found.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {records.map((record) => <CertificateIndexCard key={record.certificate_id} record={record} />)}
          </div>
        )}
      </section>
    </>
  );
}
