"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";

import { DeterministicDemoRunner } from "@/components/deterministic-demo-runner";
import { SafeMarkdown } from "@/components/safe-markdown";
import type {
  AgentErrorResponse,
  AgentResponse,
  OrchestrationHealth,
  ProviderHealth,
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
  {
    label: "Explain architecture",
    query:
      "Explain ProofLayer's current architecture to a Web3 developer. Distinguish current implementation, disclosed limitations, and target architecture.",
  },
  {
    label: "What is ProofLayer?",
    query:
      "What is ProofLayer and what problem does it solve for tokenized real-world assets?",
  },
  {
    label: "How does ProofLayer get data?",
    query:
      "How does ProofLayer get its data, and which sources are live, cached, snapshot, or fixture?",
  },
  {
    label: "Why does ProofLayer matter to X Layer?",
    query:
      "Why does ProofLayer matter to X Layer, and what shared verification and enforcement state does it provide?",
  },
  {
    label: "How does PolicyGate work?",
    query:
      "How does PolicyGate work, and how does it use certificates to enforce read-only eligibility?",
  },
  {
    label: "How would a protocol integrate?",
    query:
      "How would a protocol integrate ProofLayer, and what remains target work for a protected downstream action?",
  },
] as const;

const RESULT_TONES = {
  PASS: "border-success/35 bg-success-soft/[0.07] text-success",
  FAIL: "border-fail/35 bg-fail/[0.07] text-fail",
  INDETERMINATE: "border-warning/35 bg-warning/[0.07] text-warning",
} as const;

function displayValue(value: string | number | null) {
  if (value === null) return "Not inspected";
  return typeof value === "string" ? value.replaceAll("_", " ") : String(value);
}

function Metric({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="border-r border-edge px-3 py-3 last:border-r-0 sm:px-4">
      <dt className="text-[9px] font-semibold uppercase tracking-[0.1em] text-tertiary">
        {label}
      </dt>
      <dd className="mt-1.5 min-h-4 text-[11px] font-semibold text-accent">
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
  const [providerStatus, setProviderStatus] = useState<"checking" | "online" | "offline" | "unknown">("checking");
  const [providerError, setProviderError] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<string | null>(null);

  const checkConnection = useCallback(async () => {
    try {
      const result = await fetch("/api/agent/health", { cache: "no-store" });
      if (!result.ok) throw new Error("Orchestration API unavailable");
      const payload = (await result.json()) as OrchestrationHealth;
      setAgentConfigured(payload.agent_configured);
      setAiProvider(payload.ai_provider ?? null);
      setApiStatus(payload.backend_status === "ONLINE" ? "online" : "offline");
    } catch {
      setApiStatus("offline");
      setAgentConfigured(false);
      setProviderStatus("unknown");
      setProviderError(null);
      setAiProvider(null);
      return;
    }

    // Non-blocking provider probe — fires after backend is confirmed online.
    setProviderStatus("checking");
    try {
      const probe = await fetch("/api/agent/health/provider", {
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      const probePayload = (await probe.json()) as ProviderHealth;
      setProviderStatus(probePayload.provider_status === "ONLINE" ? "online" : "offline");
      setProviderError(probePayload.provider_error ?? null);
    } catch {
      setProviderStatus("unknown");
      setProviderError("PROVIDER_PROBE_TIMEOUT");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await checkConnection();
    })();
    // Re-poll so the button enables automatically once the agent API comes up,
    // instead of staying disabled until a full page reload.
    const interval = setInterval(() => {
      void checkConnection();
    }, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [checkConnection]);

  const agentOnline = apiStatus === "online" && agentConfigured;
  const providerOnline = providerStatus === "online";
  const isArchitectureResponse = response?.mode === "ARCHITECTURE_EXPLANATION";
  const providerLabel = aiProvider?.trim() || "Configured provider";
  const statusHint =
    apiStatus === "checking"
      ? "Checking the local agent API…"
      : apiStatus === "offline"
        ? "Local agent API is not reachable. Start it with: python scripts/run_agent_api.py"
        : !agentConfigured
          ? "Agent API is up but no AI provider key is configured. Set AI_API_KEY in .env and restart the API."
          : providerStatus === "checking"
            ? "Backend online — checking provider connectivity…"
            : providerStatus === "unknown"
              ? "Backend online but provider probe timed out. Try running an investigation — it may still work."
              : !providerOnline
                ? `Backend online but the provider is not usable${providerError ? ` (${providerError})` : ""}. Check AI_API_KEY and network access.`
                : `Connected — investigations run through ${aiProvider ?? "the configured"} inference model.`;

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
      // Refresh provider status after a successful investigation.
      void checkConnection();
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
    <div className="border-t border-edge bg-surface px-4 py-5 sm:px-6 sm:py-6">
      <div className="mb-5 grid border border-edge bg-surface/55 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="AI mode" value={agentOnline ? (providerOnline ? "Online" : "Degraded") : apiStatus === "checking" ? "Checking" : "Offline"} />
        <Metric label="Deterministic mode" value={apiStatus === "online" ? "Available" : apiStatus === "checking" ? "Checking" : "Unavailable"} />
        <Metric label="RVC authority" value="Deterministic" />
        <Metric label="X Layer enforcement" value="Read only" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.88fr)_minmax(420px,1.12fr)] xl:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
              AI Verification Agent
            </p>
            <span className="rounded-[4px] border border-brand/25 bg-brand/[0.07] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.09em] text-accent">
              AI-assisted
            </span>
            <span className="rounded-[4px] border border-success/20 bg-success-soft/[0.05] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.09em] text-success">
              Deterministic authority
            </span>
            <span
              className={`rounded-[4px] border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.09em] ${
                agentOnline && providerOnline
                  ? "border-success/20 bg-success-soft/[0.05] text-success"
                  : agentOnline && providerStatus !== "checking"
                    ? "border-warning/20 bg-warning/[0.05] text-warning"
                    : "border-warning/20 bg-warning/[0.05] text-warning"
              }`}
            >
              {agentOnline && providerOnline ? "Online" : agentOnline ? "Degraded" : apiStatus === "checking" ? "Checking" : "Offline"}
            </span>
          </div>
          <h3 className="mt-2 text-lg font-semibold tracking-[-0.025em] text-primary">
            Investigate ProofLayer
          </h3>
          <p className="mt-2 max-w-[650px] text-[12px] leading-5 text-secondary">
            The model chooses read-only ProofLayer tools. Existing evidence adapters and RVC code
            decide the result; the model cannot issue, change, or upgrade a certificate.
          </p>

          <form className="mt-5" onSubmit={submit}>
            <label
              htmlFor="agent-query"
              className="text-[9px] font-semibold uppercase tracking-[0.1em] text-tertiary"
            >
              Investigation request
            </label>
            <textarea
              id="agent-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              rows={5}
              maxLength={2_000}
              className="mt-2 w-full resize-y rounded-[8px] border border-edge bg-surface px-3.5 py-3 text-[12px] leading-5 text-accent outline-none transition-colors placeholder:text-tertiary hover:border-edge focus:border-brand/55"
              placeholder="Ask about architecture, an asset, evidence quality, provenance, certificate usability, or PolicyGate state."
            />
            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Investigation presets">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setQuery(preset.query)}
                  disabled={isRunning || !agentOnline}
                  className="surface-transition rounded-[5px] border border-edge bg-overlay-hover px-2.5 py-1.5 text-[9px] font-semibold text-secondary hover:border-brand/30 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[9px] leading-4 text-tertiary">
                {statusHint}
                {apiStatus === "offline" ? (
                  <button
                    type="button"
                    onClick={checkConnection}
                    className="ml-2 text-brand underline-offset-2 hover:underline"
                  >
                    Check again
                  </button>
                ) : null}
              </p>
              <button
                type="submit"
                title={agentOnline ? undefined : statusHint}
                disabled={isRunning || query.trim().length < 3 || !agentOnline}
                className="surface-transition min-w-[154px] rounded-[6px] border border-brand/45 bg-brand/[0.12] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-accent hover:border-brand/70 hover:bg-brand/[0.18] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isRunning ? "Investigating…" : "Run investigation"}
              </button>
            </div>
          </form>
        </div>

        <div
          className="min-h-[310px] overflow-hidden rounded-[9px] border border-edge bg-surface"
          aria-live="polite"
          aria-busy={isRunning}
        >
          <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-secondary">
              Investigation result
            </p>
            <p className="font-mono text-[8px] uppercase tracking-[0.08em] text-tertiary">
              Read only / no transaction
            </p>
          </div>

          {isRunning ? (
            <div className="flex min-h-[270px] items-center justify-center px-5 text-center">
              <div>
                <span className="mx-auto block size-2 animate-pulse rounded-full bg-brand shadow-[0_0_16px_rgba(143,125,240,0.55)]" />
                <p className="mt-4 text-[11px] font-semibold text-primary">
                  Agent is selecting and running ProofLayer tools
                </p>
                <p className="mt-1 text-[9px] text-tertiary">Bounded to 4 turns by default</p>
              </div>
            </div>
          ) : error ? (
            <div className="min-h-[270px] px-5 py-7">
              <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-warning">
                Agent unavailable
              </p>
              <p className="mt-3 max-w-[560px] text-[12px] leading-5 text-primary">{error}</p>
              <p className="mt-4 border-l border-warning/30 pl-3 text-[9px] leading-4 text-tertiary">
                No fallback result was generated in this mode. Use the separate deterministic
                verification pipeline below to execute fixed ProofLayer workflows without an external provider request.
              </p>
            </div>
          ) : response ? (
            <div>
              {isArchitectureResponse ? (
                <div className="border-b border-edge px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[9px] font-semibold uppercase tracking-[0.11em] text-secondary">
                      Repository Architecture Context
                    </span>
                    <span className="rounded-[3px] border border-brand/20 bg-brand/[0.05] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-accent">
                      Current / target separated
                    </span>
                    <span className="rounded-[3px] border border-edge bg-overlay-hover px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-tertiary">
                      No RVC verdict
                    </span>
                  </div>
                  <p className="mt-3 max-w-[680px] text-[10px] leading-4 text-tertiary">
                    This explanation uses bounded, read-only repository context. It does not imply
                    an asset verification result, current certificate usability, or an executed
                    PolicyGate action.
                  </p>
                </div>
              ) : (
              /* Authoritative system results */
              <div className="border-b border-edge px-4 py-4 sm:px-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.11em] text-secondary">
                    Authoritative Results
                  </span>
                  <span className="rounded-[3px] border border-success/20 bg-success-soft/[0.05] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-success">
                    Deterministic RVC
                  </span>
                  {response.mode === "COMPARISON" && (
                    <span className="rounded-[3px] border border-brand/20 bg-brand/[0.05] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-accent">
                      {response.authoritative_results.length} ASSETS
                    </span>
                  )}
                </div>

                {response.authoritative_results.length > 1 ? (
                  <div className="space-y-3">
                    {response.authoritative_results.map((ar) => (
                      <div key={`${ar.asset}-${ar.claim}`} className="rounded-[6px] border border-edge bg-overlay-hover/30 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="text-[11px] font-bold text-accent">
                            {ar.asset} {ar.claim}
                          </span>
                          {ar.verification_result ? (
                            <span
                              className={`inline-flex rounded-[5px] border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] ${RESULT_TONES[ar.verification_result]}`}
                            >
                              RVC {ar.verification_result}
                            </span>
                          ) : null}
                        </div>
                        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          <Metric label="Evidence roots" value={ar.evidence_root_count} />
                          <div className="border-r border-edge px-3 py-3 last:border-r-0 sm:px-4">
                            <dt className="text-[9px] font-semibold uppercase tracking-[0.1em] text-tertiary">
                              Certificate
                            </dt>
                            <dd className="mt-1.5 min-h-4 text-[11px] font-semibold text-accent">
                              {ar.certificate_status ? displayValue(ar.certificate_status) : "Not inspected"}
                            </dd>
                          </div>
                          <div className="border-r border-edge px-3 py-3 last:border-r-0 sm:px-4">
                            <dt className="text-[9px] font-semibold uppercase tracking-[0.1em] text-tertiary">
                              PolicyGate
                            </dt>
                            <dd className="mt-1.5 min-h-4 text-[11px] font-semibold text-accent">
                              {ar.policygate_outcome ? displayValue(ar.policygate_outcome) : "Not inspected"}
                            </dd>
                          </div>
                        </dl>
                        {ar.reason_codes.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {ar.reason_codes.map((reason) => (
                              <span
                                key={reason}
                                className="rounded-[4px] border border-warning/20 bg-warning/[0.045] px-1.5 py-0.5 font-mono text-[8px] text-warning"
                              >
                                {reason}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Metric label="Asset / claim" value={response.asset ? `${response.asset} / ${response.claim ?? "--"}` : null} />
                    <Metric label="Evidence roots" value={response.evidence_root_count} />
                    <div className="border-r border-edge px-3 py-3 last:border-r-0 sm:px-4">
                      <dt className="text-[9px] font-semibold uppercase tracking-[0.1em] text-tertiary">
                        Certificate
                      </dt>
                      <dd className="mt-1.5 min-h-4">
                        {response.certificate_status ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-[11px] font-semibold text-accent">
                              {displayValue(response.certificate_status)}
                            </span>
                            <span className="rounded-[3px] border border-brand/20 bg-brand/[0.05] px-1 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-accent">
                              LIVE ON-CHAIN
                            </span>
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-accent">Not inspected</span>
                        )}
                      </dd>
                    </div>
                    <div className="border-r border-edge px-3 py-3 last:border-r-0 sm:px-4">
                      <dt className="text-[9px] font-semibold uppercase tracking-[0.1em] text-tertiary">
                        PolicyGate
                      </dt>
                      <dd className="mt-1.5 min-h-4">
                        {response.policygate_outcome ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="text-[11px] font-semibold text-accent">
                              {displayValue(response.policygate_outcome)}
                            </span>
                            <span className="rounded-[3px] border border-brand/20 bg-brand/[0.05] px-1 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-accent">
                              LIVE ON-CHAIN
                            </span>
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-accent">Not inspected</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {response.verification_result ? (
                    <span
                      className={`inline-flex rounded-[5px] border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] ${RESULT_TONES[response.verification_result]}`}
                    >
                      RVC {response.verification_result}
                    </span>
                  ) : null}
                  {response.reason_codes.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {response.reason_codes.map((reason) => (
                        <span
                          key={reason}
                          className="rounded-[4px] border border-warning/20 bg-warning/[0.045] px-1.5 py-0.5 font-mono text-[8px] text-warning"
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              )}

              {/* AI Investigation Summary */}
              <div className="px-4 py-4 sm:px-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.11em] text-secondary">
                    {isArchitectureResponse ? "Repository-Grounded Architecture" : "Tool-Grounded Investigation Summary"}
                  </span>
                  <span className="rounded-[3px] border border-brand/20 bg-brand/[0.05] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-accent">
                    {providerLabel}
                  </span>
                  <span className="rounded-[3px] border border-edge bg-overlay-hover px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-tertiary">
                    Read-only
                  </span>
                </div>
                <SafeMarkdown
                  content={response.answer}
                  className="prose-agent"
                />
              </div>

              {/* Tool execution trace */}
              <details className="border-t border-edge px-4 py-3 sm:px-5">
                <summary className="cursor-pointer text-[9px] font-semibold uppercase tracking-[0.1em] text-secondary">
                  Tool execution trace / {response.tools_used.length} tools
                </summary>
                <ol className="mt-3 space-y-2 border-l border-edge pl-3">
                  {response.trace.map((step, index) => {
                    const isLiveChain = step.tool === "get_certificate_state" || step.tool === "get_policygate_state" || step.tool === "get_decision_history";
                    const isSnapshot = step.tool === "get_evidence" || step.tool === "get_asset_metadata";
                    const isArchitecture = step.tool === "get_system_architecture";
                    return (
                      <li key={`${step.tool}-${index}`} className="text-[9px] leading-4 text-secondary">
                        <span className="mr-2 rounded-[3px] border border-edge px-1 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-tertiary">
                          Tool call
                        </span>
                        <span className="font-mono font-semibold text-accent">{step.tool}</span>
                        <span className={step.status === "error" ? "ml-2 text-fail" : "ml-2 text-success"}>
                          {step.status}
                        </span>
                        {isArchitecture ? (
                          <span className="ml-2 rounded-[3px] border border-brand/20 bg-brand/[0.05] px-1 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-accent">
                            REPOSITORY CONTEXT
                          </span>
                        ) : isLiveChain ? (
                          <span className="ml-2 rounded-[3px] border border-brand/20 bg-brand/[0.05] px-1 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-accent">
                            LIVE ON-CHAIN
                          </span>
                        ) : isSnapshot ? (
                          <span className="ml-2 rounded-[3px] border border-edge bg-overlay-hover px-1 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-tertiary">
                            SNAPSHOT
                          </span>
                        ) : null}
                        {Object.entries(step.arguments).some(([, value]) => value !== null) ? (
                          <span className="mt-0.5 block font-mono text-[8px] text-tertiary">
                            {Object.entries(step.arguments)
                              .filter(([, value]) => value !== null)
                              .map(([name, value]) => `${name}=${value}`)
                              .join(" / ")}
                          </span>
                        ) : null}
                        <span className="mt-0.5 block">{step.summary}</span>
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-3 text-[8px] leading-4 text-tertiary">
                  Trace contains tool names and factual outputs only; hidden model reasoning is not exposed.
                </p>
              </details>
            </div>
          ) : (
            <div className="flex min-h-[270px] items-center justify-center px-6 text-center">
              <div className="max-w-[360px]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-tertiary">
                  Ready for investigation
                </p>
                <p className="mt-2 text-[11px] leading-5 text-tertiary">
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
