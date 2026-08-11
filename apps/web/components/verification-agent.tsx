"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

import { DeterministicDemoRunner } from "@/components/deterministic-demo-runner";
import type {
  AgentErrorResponse,
  AgentResponse,
  OrchestrationHealth,
} from "@/lib/agent";

const PRESETS = [
  {
    label: "Investigate USDY backing",
    query:
      "Investigate USDY TreasuryBacking. Explain the deterministic result, evidence provenance, current certificate usability, and PolicyGate state.",
  },
  {
    label: "Compare USDY and PAXG",
    query:
      "Compare the evidence quality, provenance, and deterministic verification results for USDY TreasuryBacking and PAXG GoldBacking.",
  },
  {
    label: "Explain blocked certificate",
    query:
      "Why is the known USDY certificate currently blocked or allowed by PolicyGate? Distinguish verification from certificate usability.",
  },
  {
    label: "Show supported claims",
    query: "What assets and claims can ProofLayer deterministically verify today?",
  },
] as const;

const RESULT_TONES = {
  PASS: "border-[#36d17c]/35 bg-[#36d17c]/[0.07] text-[#75e9a8]",
  FAIL: "border-[#ff6b6b]/35 bg-[#ff6b6b]/[0.07] text-[#ff9898]",
  INDETERMINATE: "border-[#e9b949]/35 bg-[#e9b949]/[0.07] text-[#f0cc72]",
} as const;

function displayValue(value: string | number | null) {
  if (value === null) return "Not inspected";
  return typeof value === "string" ? value.replaceAll("_", " ") : String(value);
}

function Metric({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="border-r border-white/[0.08] px-3 py-3 last:border-r-0 sm:px-4">
      <dt className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#747987]">
        {label}
      </dt>
      <dd className="mt-1.5 min-h-4 text-[11px] font-semibold text-[#d9dce4]">
        {displayValue(value)}
      </dd>
    </div>
  );
}

export function VerificationAgent() {
  const [query, setQuery] = useState<string>(PRESETS[0].query);
  const [response, setResponse] = useState<AgentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">(
    "checking",
  );
  const [agentConfigured, setAgentConfigured] = useState(false);

  const checkConnection = useCallback(async () => {
    try {
      const result = await fetch("/api/agent/health", { cache: "no-store" });
      if (!result.ok) throw new Error("Orchestration API unavailable");
      const payload = (await result.json()) as OrchestrationHealth;
      setAgentConfigured(payload.agent_configured);
      setApiStatus(payload.deterministic_demo_available ? "online" : "offline");
    } catch {
      setApiStatus("offline");
      setAgentConfigured(false);
    }
  }, []);

  useEffect(() => {
    checkConnection();
    // Re-poll so the button enables automatically once the agent API comes up,
    // instead of staying disabled until a full page reload.
    const interval = setInterval(checkConnection, 10_000);
    return () => clearInterval(interval);
  }, [checkConnection]);

  const agentOnline = apiStatus === "online" && agentConfigured;
  const statusHint =
    apiStatus === "checking"
      ? "Checking the local agent API…"
      : apiStatus === "offline"
        ? "Local agent API is not reachable. Start it with: python scripts/run_agent_api.py"
        : agentConfigured
          ? "Connected — investigations run through the configured inference model."
          : "Agent API is up but not configured. Set OPENAI_API_KEY or OPENAI_BASE_URL in .env and restart the API.";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 3 || isRunning || !agentOnline) return;

    setIsRunning(true);
    setError(null);
    setResponse(null);
    try {
      const result = await fetch("/api/agent/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: normalizedQuery }),
      });
      const payload = (await result.json()) as AgentResponse | AgentErrorResponse;
      if (!result.ok || !("answer" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "AI investigation could not complete.",
        );
      }
      setResponse(payload);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "AI investigation could not complete.",
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="border-t border-white/[0.08] bg-[#0d0f14] px-4 py-5 sm:px-6 sm:py-6">
      <div className="mb-5 grid border border-white/[0.08] bg-[#090b0f]/55 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="AI mode" value={agentOnline ? "Online" : apiStatus === "checking" ? "Checking" : "Offline"} />
        <Metric label="Deterministic mode" value={apiStatus === "online" ? "Available" : apiStatus === "checking" ? "Checking" : "Unavailable"} />
        <Metric label="RVC authority" value="Deterministic" />
        <Metric label="X Layer enforcement" value="Read only" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.88fr)_minmax(420px,1.12fr)] xl:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9b8cf4]">
              AI Verification Agent
            </p>
            <span className="rounded-[4px] border border-[#8f7df0]/25 bg-[#8f7df0]/[0.07] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.09em] text-[#bfb5fa]">
              AI-assisted
            </span>
            <span className="rounded-[4px] border border-[#36d17c]/20 bg-[#36d17c]/[0.05] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.09em] text-[#78dca5]">
              Deterministic authority
            </span>
            <span
              className={`rounded-[4px] border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.09em] ${
                agentOnline
                  ? "border-[#36d17c]/20 bg-[#36d17c]/[0.05] text-[#78dca5]"
                  : "border-[#e9b949]/20 bg-[#e9b949]/[0.05] text-[#cfb364]"
              }`}
            >
              {agentOnline ? "Online" : apiStatus === "checking" ? "Checking" : "Offline"}
            </span>
          </div>
          <h3 className="mt-2 text-lg font-semibold tracking-[-0.025em] text-[#f3f2f7]">
            Investigate a verification claim
          </h3>
          <p className="mt-2 max-w-[650px] text-[12px] leading-5 text-[#8e939f]">
            The model chooses read-only ProofLayer tools. Existing evidence adapters and RVC code
            decide the result; the model cannot issue, change, or upgrade a certificate.
          </p>

          <form className="mt-5" onSubmit={submit}>
            <label
              htmlFor="agent-query"
              className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#777c89]"
            >
              Investigation request
            </label>
            <textarea
              id="agent-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              rows={5}
              maxLength={2_000}
              className="mt-2 w-full resize-y rounded-[8px] border border-white/[0.1] bg-[#090b0f] px-3.5 py-3 text-[12px] leading-5 text-[#e4e5eb] outline-none transition-colors placeholder:text-[#555a65] hover:border-white/[0.16] focus:border-[#8f7df0]/55"
              placeholder="Ask about an asset, evidence quality, provenance, certificate usability, or PolicyGate state."
            />
            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Investigation presets">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setQuery(preset.query)}
                  disabled={isRunning || !agentOnline}
                  className="surface-transition rounded-[5px] border border-white/[0.08] bg-white/[0.025] px-2.5 py-1.5 text-[9px] font-semibold text-[#8d929e] hover:border-[#8f7df0]/30 hover:text-[#d3cffa] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[9px] leading-4 text-[#686d78]">
                {statusHint}
                {apiStatus === "offline" ? (
                  <button
                    type="button"
                    onClick={checkConnection}
                    className="ml-2 text-[#8f7df0] underline-offset-2 hover:underline"
                  >
                    Check again
                  </button>
                ) : null}
              </p>
              <button
                type="submit"
                title={agentOnline ? undefined : statusHint}
                disabled={isRunning || query.trim().length < 3 || !agentOnline}
                className="surface-transition min-w-[154px] rounded-[6px] border border-[#8f7df0]/45 bg-[#8f7df0]/[0.12] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[#dcd7ff] hover:border-[#a99af8]/70 hover:bg-[#8f7df0]/[0.18] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isRunning ? "Investigating…" : "Run investigation"}
              </button>
            </div>
          </form>
        </div>

        <div
          className="min-h-[310px] overflow-hidden rounded-[9px] border border-white/[0.09] bg-[#111319]"
          aria-live="polite"
          aria-busy={isRunning}
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#828793]">
              Investigation result
            </p>
            <p className="font-mono text-[8px] uppercase tracking-[0.08em] text-[#5f6470]">
              Read only / no transaction
            </p>
          </div>

          {isRunning ? (
            <div className="flex min-h-[270px] items-center justify-center px-5 text-center">
              <div>
                <span className="mx-auto block size-2 animate-pulse rounded-full bg-[#8f7df0] shadow-[0_0_16px_rgba(143,125,240,0.55)]" />
                <p className="mt-4 text-[11px] font-semibold text-[#c7c3d8]">
                  Agent is selecting and running ProofLayer tools
                </p>
                <p className="mt-1 text-[9px] text-[#6f7480]">Bounded to 8 turns by default</p>
              </div>
            </div>
          ) : error ? (
            <div className="min-h-[270px] px-5 py-7">
              <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#e9b949]">
                Agent unavailable
              </p>
              <p className="mt-3 max-w-[560px] text-[12px] leading-5 text-[#b7bbc4]">{error}</p>
              <p className="mt-4 border-l border-[#e9b949]/30 pl-3 text-[9px] leading-4 text-[#777c87]">
                No fallback result was generated in this mode. Use the separate deterministic
                demo runner below to execute fixed ProofLayer workflows without an OpenAI request.
              </p>
            </div>
          ) : response ? (
            <div>
              <dl className="grid grid-cols-2 border-b border-white/[0.08] sm:grid-cols-4">
                <Metric label="Asset / claim" value={response.asset ? `${response.asset} / ${response.claim ?? "--"}` : null} />
                <Metric label="Certificate" value={response.certificate_status} />
                <Metric label="PolicyGate" value={response.policygate_outcome} />
                <Metric label="Evidence roots" value={response.evidence_root_count} />
              </dl>
              <div className="px-4 py-4 sm:px-5">
                {response.verification_result ? (
                  <span
                    className={`inline-flex rounded-[5px] border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] ${RESULT_TONES[response.verification_result]}`}
                  >
                    RVC {response.verification_result}
                  </span>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {response.certificate_status ? (
                    <span className="rounded-[4px] border border-[#8f7df0]/20 bg-[#8f7df0]/[0.05] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.09em] text-[#aaa0e7]">
                      Live on-chain
                    </span>
                  ) : null}
                  {response.policygate_outcome ? (
                    <span className="rounded-[4px] border border-white/[0.1] bg-white/[0.025] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.09em] text-[#969ba7]">
                      Policy result
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-[12px] leading-5 text-[#d0d2da]">{response.answer}</p>
                {response.reason_codes.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {response.reason_codes.map((reason) => (
                      <span
                        key={reason}
                        className="rounded-[4px] border border-[#e9b949]/20 bg-[#e9b949]/[0.045] px-2 py-1 font-mono text-[8px] text-[#d1b566]"
                      >
                        {reason}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <details className="border-t border-white/[0.08] px-4 py-3 sm:px-5">
                <summary className="cursor-pointer text-[9px] font-semibold uppercase tracking-[0.1em] text-[#858a96]">
                  Tool execution trace / {response.tools_used.length} tools
                </summary>
                <ol className="mt-3 space-y-2 border-l border-white/[0.09] pl-3">
                  {response.trace.map((step, index) => (
                    <li key={`${step.tool}-${index}`} className="text-[9px] leading-4 text-[#7e838f]">
                      <span className="mr-2 rounded-[3px] border border-white/[0.08] px-1 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-[#656a75]">
                        Tool call
                      </span>
                      <span className="font-mono font-semibold text-[#aba2df]">{step.tool}</span>
                      <span className={step.status === "error" ? "ml-2 text-[#ff8585]" : "ml-2 text-[#5dbf88]"}>
                        {step.status}
                      </span>
                      {Object.entries(step.arguments).some(([, value]) => value !== null) ? (
                        <span className="mt-0.5 block font-mono text-[8px] text-[#606672]">
                          {Object.entries(step.arguments)
                            .filter(([, value]) => value !== null)
                            .map(([name, value]) => `${name}=${value}`)
                            .join(" / ")}
                        </span>
                      ) : null}
                      <span className="mt-0.5 block">{step.summary}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-[8px] leading-4 text-[#555b66]">
                  Trace contains tool names and factual outputs only; hidden model reasoning is not exposed.
                </p>
              </details>
            </div>
          ) : (
            <div className="flex min-h-[270px] items-center justify-center px-6 text-center">
              <div className="max-w-[360px]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#777c88]">
                  Ready for investigation
                </p>
                <p className="mt-2 text-[11px] leading-5 text-[#676c77]">
                  Results will separate AI explanation, deterministic verification, and live on-chain enforcement state.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="-mx-4 -mb-5 mt-6 sm:-mx-6 sm:-mb-6">
        <DeterministicDemoRunner availability={apiStatus} />
      </div>
    </div>
  );
}
