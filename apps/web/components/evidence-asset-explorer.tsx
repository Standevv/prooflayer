"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { CopyValue } from "@/components/copy-value";
import { EvidenceRecordTable } from "@/components/evidence-record-table";
import { EvidenceSourceBadge } from "@/components/evidence-source-badge";
import { ProvenanceGraph } from "@/components/provenance-graph";
import {
  evidenceResultStyle,
  evidenceValue,
  freshnessStyle,
  type EvidenceApiError,
  type EvidenceAssetDetail,
  type PredicateView,
} from "@/lib/evidence";

function LoadingDetail() {
  return <div className="space-y-3" aria-label="Loading evidence detail"><div className="h-[220px] animate-pulse rounded-[9px] border border-edge bg-overlay-hover" /><div className="h-[560px] animate-pulse rounded-[9px] border border-edge bg-overlay-hover" /></div>;
}

function PredicateRow({ predicate }: { predicate: PredicateView }) {
  const status = predicate.passed === true ? "SATISFIED" : predicate.passed === false ? "FAILED" : "UNRESOLVED";
  const style = predicate.passed === true ? "text-success" : predicate.passed === false ? "text-fail" : "text-warning";
  return (
    <div className="grid gap-2 border-b border-edge py-3 last:border-0 sm:grid-cols-[minmax(0,1.4fr)_minmax(120px,0.55fr)_minmax(0,1fr)] sm:items-start">
      <div><p className="font-mono text-[10px] text-primary">{predicate.predicate}</p>{predicate.reason_code ? <p className="mt-1 font-mono text-[8px] text-warning">{predicate.reason_code}</p> : null}</div>
      <p className={`text-[8px] font-bold tracking-[0.08em] ${style}`}>{status}</p>
      <div className="font-mono text-[8px] leading-4 text-secondary"><p>Expected: {evidenceValue(predicate.expected)}</p><p>Observed: {evidenceValue(predicate.observed)}</p></div>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <div className="rounded-[7px] border border-edge bg-scrim px-3 py-3"><p className="text-[7px] font-semibold uppercase tracking-[0.09em] text-tertiary">{label}</p><p className="mt-1 text-xl font-semibold tracking-[-0.035em] text-primary">{value}</p>{note ? <p className="mt-1 text-[8px] leading-3 text-tertiary">{note}</p> : null}</div>;
}

function EvidenceDetail({ data }: { data: EvidenceAssetDetail }) {
  const certificate = data.certificate_linkage;
  const evidenceTiers = Array.from(new Set(data.evidence_records.map((record) => record.evidence_tier))).sort();
  return (
    <>
      <header className="command-header relative overflow-hidden rounded-[9px] border border-edge px-5 py-6 sm:px-7 sm:py-8">
        <div className="relative z-10">
          <Link href="/evidence" className="text-[8px] font-bold uppercase tracking-[0.11em] text-accent hover:text-accent">← Evidence Explorer</Link>
          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-tertiary">{data.asset_class}</p>
              <h1 className="mt-1 text-[34px] font-semibold leading-none tracking-[-0.052em] text-accent sm:text-[44px]">{data.asset} <span className="text-tertiary">/</span> {data.claim}</h1>
              <p className="mt-3 max-w-2xl text-[11px] leading-5 text-secondary">Why did the deterministic verifier reach this result? Inspect every normalized record, root relationship, predicate, and commitment below.</p>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:max-w-[310px] sm:justify-end">
              <span className={`rounded-[4px] border px-2 py-1 text-[8px] font-bold tracking-[0.08em] ${evidenceResultStyle(data.verification.result)}`}>{data.verification.result}</span>
              <span className={`rounded-[4px] border px-2 py-1 text-[8px] font-bold tracking-[0.08em] ${freshnessStyle(data.freshness_summary)}`}>{data.freshness_summary}</span>
              <EvidenceSourceBadge label="CACHED OFFICIAL EVIDENCE" />
              <EvidenceSourceBadge label="DERIVED" />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Metric label="Evidence records" value={data.provenance.evidence_record_count} />
            <Metric label="Observed sources" value={data.provenance.observed_source_count} />
            <Metric label="Independent roots" value={data.provenance.independent_root_count} note={data.provenance.independent_root_ids.join(" · ")} />
            <Metric label="RVC policy" value={data.verification.policy_version} note={data.verification.policy_id} />
          </div>
          <p className="mt-4 rounded-[5px] border border-warning/15 bg-warning/[0.04] px-3 py-2 text-[9px] leading-4 text-warning">{data.source_mode_note}</p>
        </div>
      </header>

      <section className="mt-4 rounded-[9px] border border-edge bg-surface p-3 sm:p-5" aria-labelledby="provenance-graph-heading">
        <div className="mb-4">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-brand">Generated from provenance analysis</p>
          <h2 id="provenance-graph-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-accent">Evidence provenance graph</h2>
          <p className="mt-1 text-[10px] leading-4 text-tertiary">Select any node to inspect the underlying normalized EvidenceRecord fields. Dashed gold edges denote declared cross-source dependencies.</p>
        </div>
        <ProvenanceGraph nodes={data.provenance.graph.nodes} edges={data.provenance.graph.edges} records={data.evidence_records} />
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(330px,0.8fr)]">
        <section className="rounded-[9px] border border-edge bg-surface p-4 sm:p-5" aria-labelledby="policy-evaluation-heading">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-brand">Existing RVC output</p>
          <div className="mt-1 flex items-center justify-between gap-3"><h2 id="policy-evaluation-heading" className="text-lg font-semibold tracking-[-0.03em] text-accent">Policy evaluation</h2><span className={`rounded-[4px] border px-2 py-1 text-[8px] font-bold ${evidenceResultStyle(data.verification.result)}`}>{data.verification.result}</span></div>
          <div className="mt-4 border-t border-edge">{data.verification.predicates.map((predicate) => <PredicateRow key={predicate.predicate} predicate={predicate} />)}</div>
          {data.missing_requirements.length > 0 ? <div className="mt-4 rounded-[6px] border border-warning/20 bg-warning/[0.045] p-3"><p className="text-[8px] font-bold uppercase tracking-[0.09em] text-warning">Missing requirements preserved</p><ul className="mt-2 space-y-1 font-mono text-[9px] text-warning">{data.missing_requirements.map((requirement) => <li key={requirement}>— {requirement}</li>)}</ul></div> : null}
          {data.warnings.map((warning) => <p key={warning} className="mt-3 text-[9px] leading-4 text-secondary">{warning}</p>)}
        </section>

        <section className="rounded-[9px] border border-edge bg-surface p-4 sm:p-5" aria-labelledby="independence-heading">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-tertiary">No source-count inflation</p>
          <h2 id="independence-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-accent">Dependency groups</h2>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              ["Observed sources", data.provenance.observed_source_count],
              ["Dependent sources", data.provenance.duplicated_or_dependent_source_count],
              ["Independent roots", data.provenance.independent_root_count],
              ["Evidence tiers", evidenceTiers.join(" / ")],
              ["Freshness", data.freshness_summary],
            ].map(([label, value]) => <div key={label} className="rounded-[5px] border border-edge bg-scrim p-2.5"><p className="text-[6px] font-semibold uppercase tracking-[0.08em] text-tertiary">{label}</p><p className="mt-1 font-mono text-[10px] font-semibold text-primary">{value}</p></div>)}
          </div>
          <p className="mt-4 text-[10px] leading-4 text-secondary">ProofLayer counts independent underlying evidence roots rather than the number of URLs or observations.</p>
          <div className="mt-4 space-y-2">
            {data.provenance.dependency_groups.map((group) => <div key={group.root_source_id} className="rounded-[6px] border border-edge bg-scrim p-3"><div className="flex items-center justify-between gap-3"><p className="font-mono text-[10px] font-semibold text-accent">{group.root_source_id}</p><span className="text-[8px] text-tertiary">{group.observation_count} records</span></div><div className="mt-2 space-y-1">{group.source_ids.map((source) => <p key={source} className="break-all font-mono text-[8px] leading-3 text-secondary">↳ {source}</p>)}</div></div>)}
          </div>
          <div className="mt-4 border-t border-edge pt-4">
            <p className="text-[8px] font-bold uppercase tracking-[0.1em] text-brand">Why provenance matters</p>
            <p className="mt-2 text-[9px] leading-4 text-secondary">Issuer disclosure → aggregator → dashboard can look like three sources while resolving to one root. ProofLayer collapses downstream evidence so policies can require genuinely independent support.</p>
          </div>
          <p className="mt-4 text-[8px] leading-4 text-tertiary">Tier labels are preserved exactly from EvidenceRecord. This repository does not define a semantic tier legend, so the explorer does not invent one.</p>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-[9px] border border-edge bg-surface p-4 sm:p-5" aria-labelledby="commitment-heading">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-brand">Derived · deterministic RVC</p>
          <h2 id="commitment-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-accent">Evidence commitment</h2>
          <div className="mt-4 rounded-[6px] border border-edge bg-scrim p-3"><CopyValue value={data.evidence_commitment.value} label="evidence commitment" full /></div>
          <p className="mt-3 text-[10px] leading-5 text-secondary">{data.evidence_commitment.description}</p>
          <p className="mt-2 font-mono text-[9px] text-secondary">{data.evidence_commitment.independent_root_count} independent provenance root{data.evidence_commitment.independent_root_count === 1 ? "" : "s"} committed</p>
        </section>

        <section className="rounded-[9px] border border-edge bg-surface p-4 sm:p-5" aria-labelledby="certificate-linkage-heading">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-tertiary">Exact equality only</p>
          <div className="mt-1 flex items-center justify-between gap-3"><h2 id="certificate-linkage-heading" className="text-lg font-semibold tracking-[-0.03em] text-accent">Related certificate</h2><span className={`rounded-[4px] border px-2 py-1 text-[8px] font-bold ${certificate.match_status === "EXACT MATCH" ? "border-success/25 text-success" : certificate.match_status === "DOES NOT MATCH" ? "border-warning/25 text-warning" : "border-edge text-secondary"}`}>{certificate.match_status}</span></div>
          {certificate.certificate_id ? <div className="mt-4"><CopyValue value={certificate.certificate_id} label="certificate ID" full /></div> : <p className="mt-4 text-[11px] text-secondary">No exported ProofLayer certificate is mapped to this asset.</p>}
          <dl className="mt-4 grid grid-cols-2 gap-3 text-[9px]"><div><dt className="uppercase tracking-[0.08em] text-tertiary">Historical certificate result</dt><dd className="mt-1 text-primary">{certificate.historical_certificate_result ?? certificate.verification_result ?? "Unavailable"}</dd></div><div><dt className="uppercase tracking-[0.08em] text-tertiary">Current certificate usability</dt><dd className="mt-1 text-primary">{certificate.current_certificate_usability ?? certificate.current_usability ?? "Unavailable"}</dd></div><div><dt className="uppercase tracking-[0.08em] text-tertiary">Live registered</dt><dd className="mt-1 text-primary">{certificate.live_registered === null ? "Unavailable" : certificate.live_registered ? "Yes" : "No"}</dd></div><div><dt className="uppercase tracking-[0.08em] text-tertiary">Commitment match</dt><dd className="mt-1 text-primary">{certificate.match_status}</dd></div></dl>
          <p className="mt-4 text-[9px] leading-4 text-secondary">{certificate.note}</p>
          {certificate.href ? <Link href={certificate.href} className="mt-4 inline-flex text-[8px] font-bold uppercase tracking-[0.09em] text-brand-bright hover:text-accent">Open certificate record →</Link> : null}
        </section>
      </div>

      <section className="mt-4 overflow-hidden rounded-[9px] border border-edge bg-surface" aria-labelledby="raw-evidence-heading">
        <div className="px-4 pt-4 sm:px-5 sm:pt-5"><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-brand">Normalized EvidenceRecord view</p><h2 id="raw-evidence-heading" className="mt-1 text-lg font-semibold tracking-[-0.03em] text-accent">Raw evidence</h2><p className="mt-1 text-[10px] text-tertiary">Filter the displayed records without changing or re-evaluating them.</p></div>
        <EvidenceRecordTable records={data.evidence_records} />
      </section>

      <footer className="mt-5 flex flex-col gap-1 border-t border-edge py-4 text-[10px] leading-4 text-tertiary sm:flex-row sm:justify-between"><p>{data.verification.authority} · {data.source_mode}</p><p>No transaction · No evidence mutation · No certificate issuance</p></footer>
    </>
  );
}

export function EvidenceAssetExplorer({ asset }: { asset: string }) {
  const [data, setData] = useState<EvidenceAssetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/evidence/${encodeURIComponent(asset.toLowerCase())}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as EvidenceAssetDetail | EvidenceApiError;
        if (!response.ok || !("asset" in payload)) throw new Error("error" in payload ? payload.error : "Evidence detail unavailable.");
        setData(payload);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Evidence detail unavailable.");
      });
    return () => controller.abort();
  }, [asset]);

  if (error) return <div className="rounded-[9px] border border-warning/20 bg-warning/[0.05] p-5"><Link href="/evidence" className="text-[8px] font-bold uppercase tracking-[0.1em] text-brand-bright">← Evidence Explorer</Link><h1 className="mt-4 text-xl font-semibold text-primary">Evidence detail unavailable</h1><p className="mt-2 text-[11px] leading-5 text-warning">{error}</p></div>;
  return data ? <EvidenceDetail data={data} /> : <LoadingDetail />;
}
