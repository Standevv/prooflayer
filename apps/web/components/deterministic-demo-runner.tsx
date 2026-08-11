"use client";

import { useState } from "react";

import type {
  AgentErrorResponse,
  DemoRunnerResponse,
  DemoScenario,
} from "@/lib/agent";

type Availability = "checking" | "online" | "offline";

const SCENARIOS: ReadonlyArray<{
  id: DemoScenario;
  label: string;
  detail: string;
}> = [
  {
    id: "usdy_treasury_verification",
    label: "USDY Treasury",
    detail: "Evidence → RVC → X Layer reads",
  },
  {
    id: "paxg_gold_verification",
    label: "PAXG Gold",
    detail: "Evidence → RVC; no certificate fixture",
  },
  {
    id: "usdy_certificate_eligibility",
    label: "USDY Eligibility",
    detail: "Historical certificate → PolicyGate",
  },
  {
    id: "provenance_inspection",
    label: "Provenance",
    detail: "Evidence → independent source roots",
  },
];

const RESULT_TONES = {
  PASS: "border-[#36d17c]/35 bg-[#36d17c]/[0.07] text-[#75e9a8]",
  FAIL: "border-[#ff6b6b]/35 bg-[#ff6b6b]/[0.07] text-[#ff9898]",
  INDETERMINATE: "border-[#e9b949]/35 bg-[#e9b949]/[0.07] text-[#f0cc72]",
} as const;

const LABEL_TONES = {
  "REAL TOOL CALL": "border-white/[0.1] bg-white/[0.025] text-[#9ca1ad]",
  "DETERMINISTIC RVC": "border-[#8f7df0]/25 bg-[#8f7df0]/[0.06] text-[#b8aefa]",
  "LIVE ON-CHAIN": "border-[#36d17c]/20 bg-[#36d17c]/[0.045] text-[#77d9a0]",
  "DEMO FIXTURE": "border-[#e9b949]/20 bg-[#e9b949]/[0.04] text-[#c7ab62]",
} as const;

function readable(value: string | number | null) {
  if (value === null) return "Not checked";
  return typeof value === "string" ? value.replaceAll("_", " ") : String(value);
}

function ResultMetric({
  label,
  value,
  context,
}: {
  label: string;
  value: string | number | null;
  context?: string;
}) {
  return (
    <div className="border-b border-r border-white/[0.08] p-3 last:border-r-0 sm:p-3.5">
      <dt className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#717784]">
        {label}
      </dt>
      <dd className="mt-1.5 text-[10px] font-semibold text-[#d8dae2]">{readable(value)}</dd>
      {context ? <p className="mt-1 text-[8px] leading-3 text-[#626873]">{context}</p> : null}
    </div>
  );
}

export function DeterministicDemoRunner({
  availability,
}: {
  availability: Availability;
}) {
  const [scenario, setScenario] = useState<DemoScenario>("usdy_treasury_verification");
  const [provenanceAsset, setProvenanceAsset] = useState<"USDY" | "PAXG">("USDY");
  const [response, setResponse] = useState<DemoRunnerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const isAvailable = availability === "online";

  async function execute(nextScenario: DemoScenario) {
    if (isRunning || !isAvailable) return;
    setScenario(nextScenario);
    setIsRunning(true);
    setResponse(null);
    setError(null);

    const body: Record<string, string> = { scenario: nextScenario };
    if (nextScenario === "provenance_inspection") {
      body.asset = provenanceAsset;
      body.claim = provenanceAsset === "USDY" ? "TreasuryBacking" : "GoldBacking";
    }

    try {
      const result = await fetch("/api/demo/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await result.json()) as DemoRunnerResponse | AgentErrorResponse;
      if (!result.ok || !("mode" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Deterministic workflow could not complete.",
        );
      }
      setResponse(payload);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Deterministic workflow could not complete.",
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section
      className="border-t border-[#8f7df0]/20 bg-[linear-gradient(180deg,rgba(143,125,240,0.035),rgba(13,15,20,0)_140px)] px-4 py-6 sm:px-6"
      aria-labelledby="deterministic-demo-heading"
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.88fr)_minmax(420px,1.12fr)] xl:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a99af8]">
              Deterministic Demo Runner
            </p>
            <span className="rounded-[4px] border border-[#8f7df0]/30 bg-[#8f7df0]/[0.08] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.09em] text-[#c8c0ff]">
              Zero-cost local demo
            </span>
            <span
              className={`rounded-[4px] border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.09em] ${
                isAvailable
                  ? "border-[#36d17c]/25 bg-[#36d17c]/[0.055] text-[#76daa0]"
                  : availability === "checking"
                    ? "border-white/[0.1] bg-white/[0.025] text-[#858b97]"
                    : "border-[#e9b949]/25 bg-[#e9b949]/[0.05] text-[#d2b668]"
              }`}
            >
              {isAvailable ? "Available" : availability === "checking" ? "Checking" : "Unavailable"}
            </span>
          </div>
          <h3
            id="deterministic-demo-heading"
            className="mt-2 text-lg font-semibold tracking-[-0.025em] text-[#f3f2f7]"
          >
            Run a predefined verification workflow
          </h3>
          <p className="mt-2 max-w-[660px] text-[12px] leading-5 text-[#8e939f]">
            Execute the same ProofLayer verification tools without LLM orchestration. The workflow
            is fixed, read-only, and requires no browser wallet or OpenAI request.
          </p>

          <fieldset className="mt-5" disabled={isRunning}>
            <legend className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#777c89]">
              Predefined scenario
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {SCENARIOS.map((item) => {
                const selected = item.id === scenario;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setScenario(item.id)}
                    className={`surface-transition min-h-[58px] rounded-[7px] border px-3 py-2.5 text-left ${
                      selected
                        ? "border-[#8f7df0]/45 bg-[#8f7df0]/[0.09]"
                        : "border-white/[0.08] bg-[#090b0f]/60 hover:border-white/[0.14]"
                    }`}
                    aria-pressed={selected}
                  >
                    <span
                      className={`block text-[10px] font-semibold ${selected ? "text-[#d6d0ff]" : "text-[#b1b5c0]"}`}
                    >
                      {item.label}
                    </span>
                    <span className="mt-1 block text-[8px] leading-3 text-[#656b77]">
                      {item.detail}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {scenario === "provenance_inspection" ? (
            <div className="mt-3 flex items-center gap-2" aria-label="Provenance asset">
              <span className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#696f7b]">
                Asset
              </span>
              {(["USDY", "PAXG"] as const).map((asset) => (
                <button
                  key={asset}
                  type="button"
                  onClick={() => setProvenanceAsset(asset)}
                  disabled={isRunning}
                  className={`rounded-[4px] border px-2 py-1 text-[8px] font-bold ${
                    provenanceAsset === asset
                      ? "border-[#8f7df0]/35 bg-[#8f7df0]/[0.08] text-[#c7befa]"
                      : "border-white/[0.08] text-[#737985]"
                  }`}
                  aria-pressed={provenanceAsset === asset}
                >
                  {asset}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => execute(scenario)}
              disabled={isRunning || !isAvailable}
              className="surface-transition flex-1 rounded-[6px] border border-[#8f7df0]/40 bg-[#8f7df0]/[0.1] px-4 py-2.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[#d7d1ff] hover:border-[#a99af8]/70 hover:bg-[#8f7df0]/[0.16] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isRunning ? "Running verification pipeline" : "Run verification pipeline →"}
            </button>
            <button
              type="button"
              onClick={() => execute("usdy_treasury_verification")}
              disabled={isRunning || !isAvailable}
              className="surface-transition flex-1 rounded-[6px] border border-[#b1a2ff]/60 bg-[#8f7df0]/[0.19] px-4 py-2.5 text-[9px] font-bold uppercase tracking-[0.1em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:border-[#c5baff]/80 hover:bg-[#8f7df0]/[0.25] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Run hackathon demo
            </button>
          </div>
          <p className="mt-2 text-[8px] leading-4 text-[#5f6570]">
            No transaction / no wallet signature / no OpenAI request
          </p>
        </div>

        <div
          className="min-h-[350px] overflow-hidden rounded-[9px] border border-[#8f7df0]/15 bg-[#0e1015]"
          aria-live="polite"
          aria-busy={isRunning}
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#8e849f]">
              Deterministic execution
            </p>
            <p className="font-mono text-[8px] uppercase tracking-[0.08em] text-[#5f6470]">
              Read only / zero cost
            </p>
          </div>

          {isRunning ? (
            <div className="flex min-h-[306px] items-center justify-center px-5 text-center">
              <div>
                <span className="mx-auto block size-2 animate-pulse rounded-full bg-[#8f7df0] shadow-[0_0_16px_rgba(143,125,240,0.55)]" />
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#cbc6e0]">
                  Running verification pipeline
                </p>
                <p className="mt-1 text-[9px] uppercase tracking-[0.07em] text-[#716b7f]">
                  Executing ProofLayer tools
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="min-h-[306px] px-5 py-7">
              <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#e9b949]">
                Demo service unavailable
              </p>
              <p className="mt-3 text-[12px] leading-5 text-[#b7bbc4]">{error}</p>
              <p className="mt-4 border-l border-[#e9b949]/30 pl-3 text-[9px] leading-4 text-[#777c87]">
                No fallback result was fabricated. Start the local Python API and rerun the same
                scenario.
              </p>
            </div>
          ) : response ? (
            <div>
              <dl className="grid grid-cols-2 border-white/[0.08] sm:grid-cols-4">
                <ResultMetric label="Fresh RVC result" value={response.verification_result} context="Current fixture evaluation" />
                <ResultMetric label="Certificate" value={response.certificate_status} context="Historical demo certificate" />
                <ResultMetric label="PolicyGate" value={response.policygate_outcome} context="Live read-only state" />
                <ResultMetric label="Evidence roots" value={response.evidence_root_count} context="Independent provenance" />
              </dl>
              <div className="border-t border-white/[0.08] px-4 py-4">
                <div className="flex flex-wrap gap-1.5">
                  {response.verification_result ? (
                    <span
                      className={`rounded-[4px] border px-2 py-1 text-[8px] font-bold uppercase tracking-[0.09em] ${RESULT_TONES[response.verification_result]}`}
                    >
                      RVC {response.verification_result}
                    </span>
                  ) : null}
                  {response.certificate_status ? (
                    <span className="rounded-[4px] border border-[#e9b949]/20 bg-[#e9b949]/[0.04] px-2 py-1 text-[8px] font-bold uppercase tracking-[0.09em] text-[#c8ae67]">
                      Historical demo certificate
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-[11px] leading-5 text-[#ced0d8]">{response.summary}</p>
                {response.reason_codes.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {response.reason_codes.map((reason) => (
                      <span
                        key={reason}
                        className="rounded-[4px] border border-[#e9b949]/20 bg-[#e9b949]/[0.04] px-2 py-1 font-mono text-[8px] text-[#cfb466]"
                      >
                        {reason}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <ol className="border-t border-white/[0.08]">
                {response.trace.map((step) => (
                  <li
                    key={`${step.step}-${step.tool}`}
                    className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 border-b border-white/[0.06] px-4 py-3 last:border-b-0"
                  >
                    <span className="pt-0.5 font-mono text-[8px] text-[#585e69]">
                      {String(step.step).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[9px] font-semibold text-[#b6acef]">
                          {step.tool}
                        </span>
                        <span
                          className={`text-[8px] font-semibold uppercase ${step.status === "completed" ? "text-[#65cb91]" : "text-[#d8b760]"}`}
                        >
                          {step.status}
                        </span>
                        <span className="font-mono text-[7px] text-[#565c67]">
                          {step.duration_ms.toFixed(2)}ms
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {step.authenticity_labels.map((label) => (
                          <span
                            key={label}
                            className={`rounded-[3px] border px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.07em] ${LABEL_TONES[label]}`}
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                      <p className="mt-1.5 text-[8px] leading-4 text-[#777d89]">
                        {step.result_summary}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="flex min-h-[306px] items-center justify-center px-6 text-center">
              <div className="max-w-[360px]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#81788e]">
                  Workflow ready
                </p>
                <p className="mt-2 text-[11px] leading-5 text-[#676c77]">
                  Select a predefined scenario. Tool order and summary templates remain stable
                  across reruns; live X Layer reads are clearly marked when available.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
