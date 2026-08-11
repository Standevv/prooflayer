"use client";

import { useMemo, useState } from "react";

import { CopyValue } from "@/components/copy-value";
import { EvidenceSourceBadge } from "@/components/evidence-source-badge";
import { evidenceValue, freshnessStyle, type EvidenceRecordView } from "@/lib/evidence";

function unique(records: EvidenceRecordView[], read: (record: EvidenceRecordView) => string): string[] {
  return Array.from(new Set(records.map(read))).sort();
}

export function EvidenceRecordTable({ records }: { records: EvidenceRecordView[] }) {
  const [sourceType, setSourceType] = useState("ALL");
  const [root, setRoot] = useState("ALL");
  const [tier, setTier] = useState("ALL");
  const [freshness, setFreshness] = useState("ALL");
  const [field, setField] = useState("");
  const options = useMemo(() => ({
    sourceTypes: unique(records, (record) => record.source_type),
    roots: unique(records, (record) => record.root_source_id),
    tiers: unique(records, (record) => record.evidence_tier),
    freshness: unique(records, (record) => record.freshness),
  }), [records]);
  const filtered = useMemo(() => records.filter((record) => (
    (sourceType === "ALL" || record.source_type === sourceType) &&
    (root === "ALL" || record.root_source_id === root) &&
    (tier === "ALL" || record.evidence_tier === tier) &&
    (freshness === "ALL" || record.freshness === freshness) &&
    record.field.toLowerCase().includes(field.trim().toLowerCase())
  )), [field, freshness, records, root, sourceType, tier]);

  const selectors: Array<[string, string, (value: string) => void, string[]]> = [
    ["Source type", sourceType, setSourceType, options.sourceTypes],
    ["Root", root, setRoot, options.roots],
    ["Tier", tier, setTier, options.tiers],
    ["Freshness", freshness, setFreshness, options.freshness],
  ];
  return (
    <>
      <div className="grid gap-2 border-b border-white/[0.07] p-3 sm:grid-cols-2 lg:grid-cols-5 sm:p-4">
        {selectors.map(([label, value, setter, values]) => (
          <label key={label} className="text-[7px] font-semibold uppercase tracking-[0.09em] text-[#686f7c]">
            {label}
            <select value={value} onChange={(event) => setter(event.target.value)} className="mt-1.5 block w-full rounded-[5px] border border-white/[0.09] bg-[#0c0e13] px-2.5 py-2 text-[10px] normal-case tracking-normal text-[#c8cbd2]">
              <option value="ALL">All</option>
              {values.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        ))}
        <label className="text-[7px] font-semibold uppercase tracking-[0.09em] text-[#686f7c]">
          Field
          <input value={field} onChange={(event) => setField(event.target.value)} placeholder="Filter field" className="mt-1.5 block w-full rounded-[5px] border border-white/[0.09] bg-[#0c0e13] px-2.5 py-2 text-[10px] normal-case tracking-normal text-[#c8cbd2] placeholder:text-[#585e6a]" />
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left">
          <thead><tr className="border-b border-white/[0.07] text-[7px] font-semibold uppercase tracking-[0.09em] text-[#686f7c]"><th className="px-4 py-3">Field / value</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Root / dependency</th><th className="px-4 py-3">Tier</th><th className="px-4 py-3">Freshness</th><th className="px-4 py-3">Observed / retrieved</th><th className="px-4 py-3">Integrity</th></tr></thead>
          <tbody>
            {filtered.map((record) => (
              <tr key={record.record_id} className="border-b border-white/[0.055] align-top last:border-0 hover:bg-white/[0.012]">
                <td className="max-w-[250px] px-4 py-3"><p className="font-mono text-[9px] font-semibold text-[#d7d9df]">{record.field}</p><p className="mt-1 break-all font-mono text-[9px] leading-4 text-[#969ca8]">{evidenceValue(record.value)}{record.unit ? ` ${record.unit}` : ""}</p></td>
                <td className="max-w-[210px] px-4 py-3"><CopyValue value={record.source_id} label="source ID" /><p className="mt-1 text-[8px] text-[#777e8b]">{record.source_type}</p><div className="mt-1 flex flex-wrap gap-1">{record.authenticity_labels.map((label) => <EvidenceSourceBadge key={label} label={label} />)}</div></td>
                <td className="max-w-[200px] px-4 py-3"><p className="font-mono text-[9px] text-[#b8bbc4]">{record.root_source_id}</p><p className="mt-1 break-words font-mono text-[8px] leading-3 text-[#777e8b]">{record.dependency_parent_ids.length ? `Depends on ${record.dependency_parent_ids.join(", ")}` : "Direct observation"}</p></td>
                <td className="px-4 py-3 font-mono text-[10px] text-[#c9ccd3]">{record.evidence_tier}</td>
                <td className="px-4 py-3"><span className={`rounded-[3px] border px-1.5 py-0.5 text-[7px] font-bold ${freshnessStyle(record.freshness)}`}>{record.freshness}</span></td>
                <td className="max-w-[170px] px-4 py-3 font-mono text-[8px] leading-4 text-[#9297a2]"><p>{record.observed_at ?? "Not available"}</p><p className="text-[#666d79]">{record.retrieved_at ?? "Not available"}</p></td>
                <td className="max-w-[180px] px-4 py-3">{record.content_hash ? <CopyValue value={record.content_hash} label="content hash" /> : <span className="text-[8px] text-[#676d79]">Not available</span>}<p className="mt-1 text-[8px] text-[#777e8b]">Simulation: {record.simulation ? "true" : "false"}</p></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? <p className="px-4 py-8 text-center text-[10px] text-[#747a87]">No evidence records match these filters.</p> : null}
      </div>
      <p className="border-t border-white/[0.06] px-4 py-3 font-mono text-[8px] text-[#666d79]">Showing {filtered.length} of {records.length} normalized records</p>
    </>
  );
}
