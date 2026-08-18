"use client";

import { useMemo, useState } from "react";

import { CopyValue } from "@/components/copy-value";
import { EvidenceSourceBadge } from "@/components/evidence-source-badge";
import { evidenceValue, freshnessStyle, type EvidenceRecordView, type GraphEdge, type GraphNode } from "@/lib/evidence";

type Point = { x: number; y: number };

function shortLabel(value: string, maximum = 25): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}

function nodePalette(kind: GraphNode["kind"]): { fill: string; stroke: string; accent: string } {
  if (kind === "ROOT_SOURCE") return { fill: "#17142a", stroke: "#8f7df0", accent: "#c1b8fa" };
  if (kind === "ATTESTATION") return { fill: "#102019", stroke: "#36d17c", accent: "#72dda2" };
  if (kind === "ONCHAIN_SOURCE") return { fill: "#111d29", stroke: "#70b7ff", accent: "#8ac7ff" };
  if (kind === "DEPENDENT_SOURCE") return { fill: "#211b10", stroke: "#e9b949", accent: "#e7c86e" };
  if (kind === "ASSET") return { fill: "#151821", stroke: "#606777", accent: "#f0f1f4" };
  if (kind === "CLAIM") return { fill: "#17142a", stroke: "#7669cf", accent: "#d0c9fa" };
  return { fill: "#141820", stroke: "#555d6c", accent: "#d4d7df" };
}

function graphLayout(nodes: GraphNode[]) {
  const roots = nodes.filter((node) => node.kind === "ROOT_SOURCE");
  const sources = nodes.filter((node) => !["ASSET", "CLAIM", "ROOT_SOURCE"].includes(node.kind));
  const height = Math.max(380, sources.length * 92, roots.length * 128);
  const positions = new Map<string, Point>();
  const distribute = (items: GraphNode[], x: number) => {
    items.forEach((item, index) => positions.set(item.id, { x, y: ((index + 1) * height) / (items.length + 1) }));
  };
  distribute(nodes.filter((node) => node.kind === "ASSET"), 100);
  distribute(nodes.filter((node) => node.kind === "CLAIM"), 320);
  distribute(roots, 565);
  distribute(sources, 830);
  return { height, positions, roots, sources };
}

function edgePath(edge: GraphEdge, source: Point, target: Point): string {
  if (edge.relationship === "DEPENDENCY") {
    const side = 968;
    return `M ${source.x + 94} ${source.y} C ${side} ${source.y}, ${side} ${target.y}, ${target.x + 94} ${target.y}`;
  }
  const middle = (source.x + target.x) / 2;
  return `M ${source.x + 94} ${source.y} C ${middle} ${source.y}, ${middle} ${target.y}, ${target.x - 94} ${target.y}`;
}

function DesktopGraph({
  nodes,
  edges,
  selectedId,
  onSelect,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { height, positions } = useMemo(() => graphLayout(nodes), [nodes]);
  return (
    <div className="hidden overflow-x-auto md:block">
      <svg viewBox={`0 0 1000 ${height}`} className="min-w-[780px]" role="img" aria-label="Evidence provenance directed graph">
        <defs>
          <marker id="provenance-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" fill="#4e5564" />
          </marker>
          <marker id="dependency-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" fill="#a68735" />
          </marker>
        </defs>
        {edges.map((edge, index) => {
          const source = positions.get(edge.source);
          const target = positions.get(edge.target);
          if (!source || !target) return null;
          const dependency = edge.relationship === "DEPENDENCY";
          return (
            <path
              key={`${edge.source}:${edge.target}:${index}`}
              d={edgePath(edge, source, target)}
              fill="none"
              stroke={dependency ? "#8b7335" : "#353b48"}
              strokeWidth={dependency ? 1.5 : 1.2}
              strokeDasharray={dependency ? "5 5" : undefined}
              markerEnd={`url(#${dependency ? "dependency-arrow" : "provenance-arrow"})`}
            />
          );
        })}
        {nodes.map((node) => {
          const point = positions.get(node.id);
          if (!point) return null;
          const palette = nodePalette(node.kind);
          const selected = selectedId === node.id;
          return (
            <g
              key={node.id}
              role="button"
              tabIndex={0}
              aria-label={`Inspect ${node.kind.toLowerCase()} ${node.label}`}
              onClick={() => onSelect(node.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(node.id);
                }
              }}
              className="cursor-pointer outline-none"
            >
              <rect
                x={point.x - 94}
                y={point.y - 31}
                width="188"
                height="62"
                rx="7"
                fill={palette.fill}
                stroke={selected ? "#c8bfff" : palette.stroke}
                strokeOpacity={selected ? 1 : 0.58}
                strokeWidth={selected ? 2 : 1}
              />
              <circle cx={point.x - 78} cy={point.y - 15} r="3" fill={palette.stroke} />
              <text x={point.x - 68} y={point.y - 11} fill={palette.accent} fontSize="10" fontWeight="650" fontFamily="ui-monospace, monospace">
                {shortLabel(node.label)}
              </text>
              <text x={point.x - 78} y={point.y + 11} fill="#777e8c" fontSize="8" fontFamily="ui-sans-serif, sans-serif">
                {shortLabel(node.subtitle, 30)}
              </text>
              <text x={point.x + 78} y={point.y + 22} fill="#626978" fontSize="6.5" textAnchor="end" fontFamily="ui-monospace, monospace">
                {node.kind.replaceAll("_", " ")}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function MobileGraph({ nodes, selectedId, onSelect }: { nodes: GraphNode[]; selectedId: string; onSelect: (id: string) => void }) {
  const asset = nodes.find((node) => node.kind === "ASSET");
  const claim = nodes.find((node) => node.kind === "CLAIM");
  const roots = nodes.filter((node) => node.kind === "ROOT_SOURCE");
  const sourceNodes = nodes.filter((node) => !["ASSET", "CLAIM", "ROOT_SOURCE"].includes(node.kind));
  const button = (node: GraphNode, inset: string) => (
    <button
      key={node.id}
      type="button"
      onClick={() => onSelect(node.id)}
      className={`surface-transition w-full rounded-[6px] border px-3 py-2 text-left ${inset} ${selectedId === node.id ? "border-brand/55 bg-brand/[0.09]" : "border-edge bg-scrim"}`}
    >
      <span className="block font-mono text-[9px] font-semibold text-primary">{node.label}</span>
      <span className="mt-0.5 block text-[8px] uppercase tracking-[0.08em] text-tertiary">{node.kind.replaceAll("_", " ")} · {node.subtitle}</span>
    </button>
  );
  return (
    <div className="space-y-2 md:hidden" aria-label="Evidence provenance tree">
      {asset ? button(asset, "") : null}
      {claim ? <div className="ml-3 border-l border-brand/20 pl-3">{button(claim, "")}</div> : null}
      <div className="ml-6 space-y-2 border-l border-edge pl-3">
        {roots.map((root) => (
          <div key={root.id} className="space-y-2">
            {button(root, "")}
            <div className="ml-3 space-y-1.5 border-l border-edge pl-3">
              {sourceNodes.filter((source) => source.root_source_id === root.root_source_id).map((source) => button(source, ""))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecordDetail({ record }: { record: EvidenceRecordView }) {
  const lines: Array<[string, string | null]> = [
    ["Source type", record.source_type],
    ["Evidence tier", record.evidence_tier],
    ["Asset", record.asset],
    ["Field", record.field],
    ["Unit", record.unit],
    ["Observed at", record.observed_at],
    ["Retrieved at", record.retrieved_at],
    ["Simulation", record.simulation ? "true" : "false"],
  ];
  return (
    <div className="rounded-[6px] border border-edge bg-scrim p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] font-semibold text-accent">{record.field}</p>
        <span className={`rounded-[3px] border px-1.5 py-0.5 text-[7px] font-bold tracking-[0.08em] ${freshnessStyle(record.freshness)}`}>{record.freshness}</span>
      </div>
      <div className="mt-3 space-y-2">
        <div><p className="text-[7px] uppercase tracking-[0.09em] text-tertiary">Value</p><div className="mt-1"><CopyValue value={evidenceValue(record.value)} label={`${record.field} value`} full /></div></div>
        <div><p className="text-[7px] uppercase tracking-[0.09em] text-tertiary">Source ID</p><div className="mt-1"><CopyValue value={record.source_id} label="source ID" full /></div></div>
        <div><p className="text-[7px] uppercase tracking-[0.09em] text-tertiary">Root source ID</p><div className="mt-1"><CopyValue value={record.root_source_id} label="root source ID" full /></div></div>
        {record.content_hash ? <div><p className="text-[7px] uppercase tracking-[0.09em] text-tertiary">Content hash</p><div className="mt-1"><CopyValue value={record.content_hash} label="content hash" full /></div></div> : null}
        <dl className="grid grid-cols-2 gap-2 pt-1">
          {lines.map(([label, value]) => <div key={label}><dt className="text-[7px] uppercase tracking-[0.08em] text-tertiary">{label}</dt><dd className="mt-0.5 break-words font-mono text-[9px] text-primary">{value ?? "Not available"}</dd></div>)}
        </dl>
        <div><p className="text-[7px] uppercase tracking-[0.09em] text-tertiary">Dependency parent IDs</p><p className="mt-1 break-words font-mono text-[9px] text-primary">{record.dependency_parent_ids.join(", ") || "None"}</p></div>
        <p className="border-t border-edge pt-2 text-[9px] leading-4 text-secondary">{record.freshness_reason}</p>
        <div className="flex flex-wrap gap-1">{record.authenticity_labels.map((label) => <EvidenceSourceBadge key={label} label={label} />)}</div>
      </div>
    </div>
  );
}

export function ProvenanceGraph({ nodes, edges, records }: { nodes: GraphNode[]; edges: GraphEdge[]; records: EvidenceRecordView[] }) {
  const initialNode = nodes.find((node) => node.kind === "ROOT_SOURCE") ?? nodes[0];
  const [selectedId, setSelectedId] = useState(initialNode?.id ?? "");
  const selected = nodes.find((node) => node.id === selectedId) ?? initialNode;
  const selectedRecords = selected ? records.filter((record) => selected.record_ids.includes(record.record_id)) : [];

  if (!selected) return null;
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(290px,0.75fr)]">
      <div className="overflow-hidden rounded-[7px] border border-edge bg-surface p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[7px] font-semibold uppercase tracking-[0.08em] text-tertiary">
          <span className="text-accent">Independent root</span><span className="text-success">Attestation</span><span className="text-warning">Dependent source</span><span>Direct observation</span>
        </div>
        <DesktopGraph nodes={nodes} edges={edges} selectedId={selected.id} onSelect={setSelectedId} />
        <MobileGraph nodes={nodes} selectedId={selected.id} onSelect={setSelectedId} />
      </div>
      <aside className="max-h-[620px] overflow-y-auto rounded-[7px] border border-brand/[0.15] bg-surface p-3 sm:p-4" aria-live="polite">
        <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-brand">Selected graph node</p>
        <h3 className="mt-1 break-words font-mono text-[12px] font-semibold text-primary">{selected.label}</h3>
        <p className="mt-1 text-[9px] uppercase tracking-[0.08em] text-tertiary">{selected.kind.replaceAll("_", " ")} · {selected.subtitle}</p>
        <div className="mt-3 flex flex-wrap gap-1">{selected.authenticity_labels.map((label) => <EvidenceSourceBadge key={label} label={label} />)}</div>
        <div className="mt-4 space-y-2">
          {selectedRecords.length > 0 ? selectedRecords.map((record) => <RecordDetail key={record.record_id} record={record} />) : (
            <p className="rounded-[6px] border border-edge bg-scrim p-3 text-[9px] leading-4 text-secondary">This structural node is derived from the existing provenance analysis. Select a source node to inspect its normalized EvidenceRecord fields.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
