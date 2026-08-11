"use client";

import { useEffect, useMemo, useState } from "react";

import { CopyCodeButton } from "@/components/copy-code-button";
import type { OrchestrationHealth } from "@/lib/agent";
import { ASSET_CLAIMS, PROTOCOL_PRESETS, type ProtocolType, type SupportedProtocolAsset } from "@/lib/protocol";
import { isCertificateId } from "@/lib/certificates";
import { KNOWN_USDY_CERTIFICATE_ID } from "@/lib/developers";

type Operation = "protocol" | "evidence" | "certificate" | "demo" | "agent";
type DemoScenario =
  | "usdy_treasury_verification"
  | "paxg_gold_verification"
  | "usdy_certificate_eligibility"
  | "provenance_inspection";

type ExecutionResult = {
  status: number;
  duration: number;
  payload: unknown;
};

const operations: Array<{ id: Operation; label: string; note: string }> = [
  { id: "protocol", label: "Protocol Check", note: "RVC + certificate + PolicyGate" },
  { id: "evidence", label: "Evidence Lookup", note: "Normalized provenance" },
  { id: "certificate", label: "Certificate Lookup", note: "Fixture + live registry state" },
  { id: "demo", label: "Deterministic Demo", note: "Predefined read-only workflow" },
  { id: "agent", label: "AI Investigation", note: "Optional; configuration required" },
];

function authenticityLabels(operation: Operation, payload: unknown): string[] {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "available" in payload &&
    (payload as { available?: unknown }).available === false
  ) {
    return ["UNAVAILABLE"];
  }
  if (typeof payload === "object" && payload !== null && "authenticity_sources" in payload) {
    const labels = (payload as { authenticity_sources?: unknown }).authenticity_sources;
    if (Array.isArray(labels)) return labels.map(String);
  }
  if (operation === "protocol") return ["DETERMINISTIC RVC", "LIVE ON-CHAIN", "POLICY CHECK"];
  if (operation === "evidence") return ["CACHED OFFICIAL EVIDENCE", "DERIVED"];
  if (operation === "certificate") return ["DEMO FIXTURE", "LIVE ON-CHAIN", "DERIVED"];
  if (operation === "demo") return ["REAL TOOL CALL", "DETERMINISTIC RVC", "DEMO FIXTURE"];
  return ["OPTIONAL AI", "READ-ONLY TOOLS"];
}

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function DeveloperPlayground() {
  const [operation, setOperation] = useState<Operation>("protocol");
  const [asset, setAsset] = useState<SupportedProtocolAsset>("USDY");
  const [protocol, setProtocol] = useState<ProtocolType>("lending");
  const [certificateId, setCertificateId] = useState(KNOWN_USDY_CERTIFICATE_ID);
  const [scenario, setScenario] = useState<DemoScenario>("usdy_treasury_verification");
  const [query, setQuery] = useState("Can USDY be accepted as lending collateral right now?");
  const [agentConfigured, setAgentConfigured] = useState(false);
  const [healthKnown, setHealthKnown] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/agent/health", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as OrchestrationHealth;
        setAgentConfigured(response.ok && payload.agent_configured === true);
      })
      .catch(() => setAgentConfigured(false))
      .finally(() => setHealthKnown(true));
    return () => controller.abort();
  }, []);

  const request = useMemo(() => {
    if (operation === "protocol") {
      return {
        method: "POST" as const,
        endpoint: "/api/protocol/check",
        body: {
          protocol_type: protocol,
          asset,
          claim: ASSET_CLAIMS[asset],
          action: PROTOCOL_PRESETS[protocol].action,
        },
      };
    }
    if (operation === "evidence") {
      return { method: "GET" as const, endpoint: `/api/evidence/${asset.toLowerCase()}`, body: null };
    }
    if (operation === "certificate") {
      return { method: "GET" as const, endpoint: `/api/certificates/${certificateId.trim()}`, body: null };
    }
    if (operation === "demo") {
      const body: { scenario: DemoScenario; asset?: string; claim?: string } = { scenario };
      if (scenario === "provenance_inspection") {
        body.asset = asset;
        body.claim = ASSET_CLAIMS[asset];
      }
      return { method: "POST" as const, endpoint: "/api/demo/run", body };
    }
    return { method: "POST" as const, endpoint: "/api/agent/verify", body: { query } };
  }, [asset, certificateId, operation, protocol, query, scenario]);

  const validationError =
    operation === "certificate" && !isCertificateId(certificateId)
      ? "Certificate ID must be a bytes32 value (0x plus 64 hex characters)."
      : operation === "agent" && query.trim().length < 3
        ? "Investigation query must contain at least three characters."
        : null;
  const agentDisabled = operation === "agent" && (!healthKnown || !agentConfigured);

  async function execute() {
    if (validationError || agentDisabled) return;
    setPending(true);
    setResult(null);
    const started = performance.now();
    try {
      const response = await fetch(request.endpoint, {
        method: request.method,
        headers: request.body ? { "Content-Type": "application/json" } : undefined,
        body: request.body ? JSON.stringify(request.body) : undefined,
        cache: "no-store",
      });
      const text = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { available: false, error: text || "The service returned an empty response." };
      }
      setResult({ status: response.status, duration: performance.now() - started, payload });
    } catch (error) {
      setResult({
        status: 0,
        duration: performance.now() - started,
        payload: {
          available: false,
          error: error instanceof Error ? error.message : "Request failed before an HTTP response was received.",
        },
      });
    } finally {
      setPending(false);
    }
  }

  const requestText = request.body ? stringify(request.body) : "No request body";
  const resultText = result ? stringify(result.payload) : "Run the request to inspect the real response.";

  return (
    <section id="playground" className="scroll-mt-5 overflow-hidden rounded-[9px] border border-white/[0.09] bg-[#101219]">
      <div className="border-b border-white/[0.08] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#8f84dd]">Read-only API playground</p>
            <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.035em] text-white">Inspect a real ProofLayer response</h2>
          </div>
          <p className="max-w-sm text-[10px] leading-5 text-[#858b97]">Every operation uses an existing local gateway. No transaction, wallet prompt, or chain write is available here.</p>
        </div>
      </div>

      <div className="grid min-w-0 lg:grid-cols-[230px_minmax(0,1fr)]">
        <div className="border-b border-white/[0.08] p-3 lg:border-b-0 lg:border-r">
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
            {operations.map((item) => {
              const disabled = item.id === "agent" && healthKnown && !agentConfigured;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setOperation(item.id);
                    setResult(null);
                  }}
                  className={`surface-transition rounded-[7px] border px-3 py-3 text-left ${
                    operation === item.id
                      ? "border-[#8f7df0]/30 bg-[#8f7df0]/[0.08]"
                      : "border-transparent hover:border-white/[0.08] hover:bg-white/[0.025]"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[#e8e8ed]">
                    {item.label}
                    {disabled ? <span className="text-[8px] uppercase tracking-[0.08em] text-[#969ca7]">Off</span> : null}
                  </span>
                  <span className="mt-1 block text-[9px] leading-4 text-[#969ca7]">{item.note}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(operation === "protocol" || operation === "demo" || operation === "evidence") ? (
              <label className="block text-[9px] font-semibold uppercase tracking-[0.1em] text-[#969ca7]">
                Asset
                <select value={asset} onChange={(event) => setAsset(event.target.value as SupportedProtocolAsset)} className="mt-2 w-full rounded-[6px] border border-white/[0.1] bg-[#0b0d12] px-3 py-2.5 text-[11px] normal-case tracking-normal text-white">
                  <option value="USDY">USDY · TreasuryBacking</option>
                  <option value="PAXG">PAXG · GoldBacking</option>
                </select>
              </label>
            ) : null}
            {operation === "protocol" ? (
              <label className="block text-[9px] font-semibold uppercase tracking-[0.1em] text-[#969ca7]">
                Protocol preset
                <select value={protocol} onChange={(event) => setProtocol(event.target.value as ProtocolType)} className="mt-2 w-full rounded-[6px] border border-white/[0.1] bg-[#0b0d12] px-3 py-2.5 text-[11px] normal-case tracking-normal text-white">
                  <option value="lending">Lending protocol</option>
                  <option value="rwa_vault">RWA vault</option>
                  <option value="treasury_management">Treasury management</option>
                </select>
              </label>
            ) : null}
            {operation === "demo" ? (
              <label className="block text-[9px] font-semibold uppercase tracking-[0.1em] text-[#969ca7] sm:col-span-1">
                Scenario
                <select value={scenario} onChange={(event) => setScenario(event.target.value as DemoScenario)} className="mt-2 w-full rounded-[6px] border border-white/[0.1] bg-[#0b0d12] px-3 py-2.5 text-[11px] normal-case tracking-normal text-white">
                  <option value="usdy_treasury_verification">USDY verification</option>
                  <option value="paxg_gold_verification">PAXG verification</option>
                  <option value="usdy_certificate_eligibility">USDY certificate eligibility</option>
                  <option value="provenance_inspection">Provenance inspection</option>
                </select>
              </label>
            ) : null}
          </div>

          {operation === "certificate" ? (
            <label className="mt-3 block text-[9px] font-semibold uppercase tracking-[0.1em] text-[#969ca7]">
              Certificate ID
              <input value={certificateId} onChange={(event) => setCertificateId(event.target.value)} spellCheck={false} className="mt-2 w-full rounded-[6px] border border-white/[0.1] bg-[#0b0d12] px-3 py-2.5 font-mono text-[10px] normal-case tracking-normal text-white" />
            </label>
          ) : null}
          {operation === "agent" ? (
            <label className="mt-3 block text-[9px] font-semibold uppercase tracking-[0.1em] text-[#969ca7]">
              Investigation query
              <input value={query} onChange={(event) => setQuery(event.target.value)} disabled={agentDisabled} className="mt-2 w-full rounded-[6px] border border-white/[0.1] bg-[#0b0d12] px-3 py-2.5 text-[11px] normal-case tracking-normal text-white disabled:cursor-not-allowed disabled:opacity-50" />
            </label>
          ) : null}

          {agentDisabled ? <p className="mt-3 rounded-[6px] border border-[#e9b949]/20 bg-[#e9b949]/[0.05] px-3 py-2 text-[10px] text-[#cdb36d]">{healthKnown ? "AI Agent is not configured. Deterministic operations remain fully available and do not use OpenAI." : "Checking optional AI Agent configuration…"}</p> : null}
          {validationError ? <p className="mt-3 text-[10px] text-[#ff8585]">{validationError}</p> : null}

          <div className="mt-4 overflow-hidden rounded-[7px] border border-white/[0.09] bg-[#090b10]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] px-3 py-2">
              <div className="flex items-center gap-2 font-mono text-[10px]">
                <span className={request.method === "GET" ? "text-[#7dd8a5]" : "text-[#b7aaff]"}>{request.method}</span>
                <span className="break-all text-[#d4d6dc]">{request.endpoint}</span>
              </div>
              <CopyCodeButton value={requestText} label="Copy request" />
            </div>
            <pre tabIndex={0} className="max-h-48 overflow-auto p-3 text-[10px] leading-5 text-[#a9aeba]"><code>{requestText}</code></pre>
          </div>

          <button type="button" onClick={execute} disabled={pending || Boolean(validationError) || agentDisabled} className="surface-transition mt-4 rounded-[7px] border border-[#8f7df0]/35 bg-[#8f7df0]/[0.11] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#ddd8ff] hover:border-[#8f7df0]/60 hover:bg-[#8f7df0]/[0.16] disabled:cursor-not-allowed disabled:opacity-45">
            {pending ? "Executing read-only request…" : "Run request"}
          </button>

          <div className="mt-4 overflow-hidden rounded-[7px] border border-white/[0.09] bg-[#090b10]" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] px-3 py-2">
              <div className="flex items-center gap-3 text-[9px] font-semibold uppercase tracking-[0.09em] text-[#969ca7]">
                <span>Response</span>
                {result ? <span className={result.status >= 200 && result.status < 300 ? "text-[#36d17c]" : "text-[#ff8181]"}>HTTP {result.status || "NETWORK"}</span> : null}
                {result ? <span>{result.duration.toFixed(0)} ms</span> : null}
              </div>
              <CopyCodeButton value={resultText} label="Copy response" />
            </div>
            {result ? (
              <div className="flex flex-wrap gap-1.5 border-b border-white/[0.06] px-3 py-2">
                {authenticityLabels(operation, result.payload).map((label) => <span key={label} className="rounded-[4px] border border-white/[0.09] bg-white/[0.025] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-[#8e94a0]">{label}</span>)}
              </div>
            ) : null}
            <pre tabIndex={0} className="max-h-[430px] min-h-28 overflow-auto p-3 text-[10px] leading-5 text-[#b7bbc5]"><code>{resultText}</code></pre>
          </div>
        </div>
      </div>
    </section>
  );
}
