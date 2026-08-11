"use client";

import { type FormEvent, useState } from "react";

import {
  ASSET_CLAIMS,
  PROTOCOL_PRESETS,
  type ProtocolDecision,
  type ProtocolErrorResponse,
  type ProtocolType,
  type SupportedProtocolAsset,
} from "@/lib/protocol";

const AUTHENTICITY_TONES = {
  "PROOFLAYER TOOL": "border-white/[0.1] bg-white/[0.025] text-[#a0a5b0]",
  "DETERMINISTIC RVC": "border-[#8f7df0]/25 bg-[#8f7df0]/[0.06] text-[#b9aff8]",
  "LIVE ON-CHAIN": "border-[#36d17c]/22 bg-[#36d17c]/[0.05] text-[#78dca2]",
  "POLICY CHECK": "border-[#e9b949]/22 bg-[#e9b949]/[0.045] text-[#d0b568]",
} as const;

function readable(value: string | number | null) {
  if (value === null) return "NOT CHECKED";
  return typeof value === "string" ? value.replaceAll("_", " ") : String(value);
}

function resultTone(value: string | null) {
  if (value === "PASS" || value === "ALLOWED" || value === "ACCEPT" || value === "USABLE") {
    return "text-[#54dc90]";
  }
  if (
    value === "FAIL" ||
    value === "BLOCKED" ||
    value === "REJECT" ||
    value === "REVOKED" ||
    value === "EXPIRED"
  ) {
    return "text-[#ff8585]";
  }
  return "text-[#e9bf59]";
}

function DecisionMetric({
  number,
  label,
  value,
  detail,
}: {
  number: string;
  label: string;
  value: string | null;
  detail: string;
}) {
  return (
    <div className="border-b border-r border-white/[0.08] p-3.5 last:border-r-0 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <dt className="text-[8px] font-semibold uppercase tracking-[0.11em] text-[#737986]">
          {label}
        </dt>
        <span className="font-mono text-[7px] text-[#4f5560]">{number}</span>
      </div>
      <dd className={`mt-2 text-[11px] font-bold uppercase tracking-[0.03em] ${resultTone(value)}`}>
        {readable(value)}
      </dd>
      <p className="mt-1 text-[8px] leading-3 text-[#606672]">{detail}</p>
    </div>
  );
}

export function ProtocolIntegrationSandbox() {
  const [protocolType, setProtocolType] = useState<ProtocolType>("lending");
  const [asset, setAsset] = useState<SupportedProtocolAsset>("USDY");
  const [decision, setDecision] = useState<ProtocolDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const preset = PROTOCOL_PRESETS[protocolType];
  const claim = ASSET_CLAIMS[asset];

  function changeProtocol(nextProtocol: ProtocolType) {
    setProtocolType(nextProtocol);
    setDecision(null);
    setError(null);
  }

  function changeAsset(nextAsset: SupportedProtocolAsset) {
    setAsset(nextAsset);
    setDecision(null);
    setError(null);
  }

  async function runPolicyCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isRunning) return;
    setIsRunning(true);
    setDecision(null);
    setError(null);

    try {
      const response = await fetch("/api/protocol/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocol_type: protocolType,
          asset,
          claim,
          action: preset.action,
        }),
      });
      const payload = (await response.json()) as ProtocolDecision | ProtocolErrorResponse;
      if (!response.ok || !("final_protocol_recommendation" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Protocol policy check could not complete.",
        );
      }
      setDecision(payload);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Protocol policy check could not complete.",
      );
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <section
      className="overflow-hidden rounded-[10px] border border-white/[0.09] bg-[#111319]"
      aria-labelledby="integration-sandbox-heading"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.08] px-5 py-4 sm:px-6">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8f84dd]">
            Protocol simulation / read only
          </p>
          <h2
            id="integration-sandbox-heading"
            className="mt-1.5 text-xl font-semibold tracking-[-0.03em] text-[#f5f4f8]"
          >
            Would this protocol accept the asset right now?
          </h2>
        </div>
        <p className="font-mono text-[8px] uppercase tracking-[0.08em] text-[#606672]">
          No wallet / no transaction
        </p>
      </div>

      <div className="grid xl:grid-cols-[minmax(330px,0.72fr)_minmax(0,1.28fr)]">
        <form
          onSubmit={runPolicyCheck}
          className="border-b border-white/[0.08] p-5 sm:p-6 xl:border-b-0 xl:border-r"
        >
          <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#777d89]">
            Integration input
          </p>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-[9px] font-semibold uppercase tracking-[0.09em] text-[#777c89]">
                Protocol
              </span>
              <select
                value={protocolType}
                onChange={(event) => changeProtocol(event.target.value as ProtocolType)}
                disabled={isRunning}
                className="mt-2 w-full rounded-[7px] border border-white/[0.1] bg-[#090b0f] px-3.5 py-3 text-[11px] font-semibold text-[#e5e5eb] outline-none transition-colors hover:border-white/[0.16] focus:border-[#8f7df0]/55"
              >
                {Object.entries(PROTOCOL_PRESETS).map(([value, item]) => (
                  <option key={value} value={value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-[9px] font-semibold uppercase tracking-[0.09em] text-[#777c89]">
                Asset
              </span>
              <select
                value={asset}
                onChange={(event) => changeAsset(event.target.value as SupportedProtocolAsset)}
                disabled={isRunning}
                className="mt-2 w-full rounded-[7px] border border-white/[0.1] bg-[#090b0f] px-3.5 py-3 text-[11px] font-semibold text-[#e5e5eb] outline-none transition-colors hover:border-white/[0.16] focus:border-[#8f7df0]/55"
              >
                <option value="USDY">USDY</option>
                <option value="PAXG">PAXG</option>
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.09em] text-[#777c89]">
                  Required claim
                </p>
                <p className="mt-2 min-h-[43px] rounded-[7px] border border-white/[0.08] bg-white/[0.018] px-3.5 py-3 text-[11px] font-semibold text-[#c9cbd3]">
                  {claim}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.09em] text-[#777c89]">
                  Intended action
                </p>
                <p className="mt-2 min-h-[43px] rounded-[7px] border border-white/[0.08] bg-white/[0.018] px-3.5 py-3 text-[11px] font-semibold text-[#c9cbd3]">
                  {preset.actionLabel}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 border-l border-[#8f7df0]/30 pl-3">
            <p className="text-[8px] font-semibold uppercase tracking-[0.09em] text-[#8379b2]">
              Primary concern
            </p>
            <p className="mt-1 text-[9px] leading-4 text-[#747a86]">{preset.primaryConcern}</p>
          </div>

          <button
            type="submit"
            disabled={isRunning}
            className="surface-transition mt-6 w-full rounded-[7px] border border-[#9a89f5]/55 bg-[#8f7df0]/[0.17] px-4 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-[#eeeaff] hover:border-[#b4a7fa]/80 hover:bg-[#8f7df0]/[0.23] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isRunning ? "Running policy check…" : "Run policy check →"}
          </button>
          <p className="mt-2 text-center text-[8px] leading-4 text-[#5f6570]">
            Shared conservative policy / no custom financial risk logic
          </p>
        </form>

        <div className="min-w-0" aria-live="polite" aria-busy={isRunning}>
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-3 sm:px-6">
            <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#777d89]">
              ProofLayer decision
            </p>
            <div className="flex flex-wrap justify-end gap-1.5">
              <span className="rounded-[3px] border border-white/[0.09] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-[#777d88]">
                Current ProofLayer state
              </span>
              <span className="rounded-[3px] border border-[#8f7df0]/22 bg-[#8f7df0]/[0.05] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.08em] text-[#a99ef0]">
                Protocol simulation
              </span>
            </div>
          </div>

          {isRunning ? (
            <div className="flex min-h-[510px] items-center justify-center px-6 text-center">
              <div>
                <span className="mx-auto block size-2 animate-pulse rounded-full bg-[#8f7df0] shadow-[0_0_16px_rgba(143,125,240,0.55)]" />
                <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#c9c4dd]">
                  Checking current ProofLayer state
                </p>
                <p className="mt-1 text-[9px] text-[#6c727e]">
                  Deterministic RVC → certificate → PolicyGate
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="min-h-[510px] px-5 py-7 sm:px-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-[#e9b949]">
                Verification service unavailable
              </p>
              <p className="mt-3 max-w-xl text-[12px] leading-5 text-[#b7bbc4]">{error}</p>
              <p className="mt-4 border-l border-[#e9b949]/30 pl-3 text-[9px] leading-4 text-[#777c87]">
                No protocol recommendation was fabricated. Start the local ProofLayer API and run
                the check again.
              </p>
            </div>
          ) : decision ? (
            <div>
              <dl className="grid grid-cols-2 sm:grid-cols-4">
                <DecisionMetric
                  number="01"
                  label="Verification"
                  value={decision.verification_result ?? decision.verification_status}
                  detail="Deterministic RVC"
                />
                <DecisionMetric
                  number="02"
                  label="Certificate"
                  value={decision.certificate_state}
                  detail="Registry state"
                />
                <DecisionMetric
                  number="03"
                  label="PolicyGate"
                  value={decision.policygate_outcome}
                  detail="Enforcement readiness"
                />
                <DecisionMetric
                  number="04"
                  label="Recommendation"
                  value={decision.final_protocol_recommendation}
                  detail="Protocol simulation"
                />
              </dl>

              <div className="border-t border-white/[0.08] px-5 py-5 sm:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#777d89]">
                    Final recommendation
                  </p>
                  <span
                    className={`rounded-[4px] border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.09em] ${
                      decision.final_protocol_recommendation === "ACCEPT"
                        ? "border-[#36d17c]/30 bg-[#36d17c]/[0.07] text-[#6fe29f]"
                        : decision.final_protocol_recommendation === "REJECT"
                          ? "border-[#ff6b6b]/30 bg-[#ff6b6b]/[0.07] text-[#ff9797]"
                          : "border-[#e9b949]/30 bg-[#e9b949]/[0.07] text-[#efca70]"
                    }`}
                  >
                    {readable(decision.final_protocol_recommendation)}
                  </span>
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.78fr)]">
                  <div>
                    <h3 className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#8b819c]">
                      Why?
                    </h3>
                    <ol className="mt-3 space-y-2">
                      {decision.explanation.map((item, index) => (
                        <li key={item} className="grid grid-cols-[22px_minmax(0,1fr)] gap-2 text-[10px] leading-4 text-[#aeb2bd]">
                          <span className="font-mono text-[8px] text-[#625a76]">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          {item}
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#8b819c]">
                      Blocking reasons
                    </p>
                    {decision.blocking_reasons.length > 0 ? (
                      <ul className="mt-3 space-y-1.5">
                        {decision.blocking_reasons.map((reason) => (
                          <li key={reason} className="border-l border-[#e9b949]/25 pl-2.5 text-[9px] leading-4 text-[#969ba6]">
                            {reason}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 border-l border-[#36d17c]/30 pl-2.5 text-[9px] leading-4 text-[#83b699]">
                        All required ProofLayer acceptance conditions are satisfied.
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {decision.reason_codes.map((code) => (
                        <span key={code} className="rounded-[3px] border border-[#e9b949]/20 bg-[#e9b949]/[0.04] px-1.5 py-1 font-mono text-[7px] text-[#ceb365]">
                          {code}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-white/[0.08] px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.11em] text-[#777d89]">
                    Execution trace
                  </p>
                  <p className="font-mono text-[7px] uppercase tracking-[0.08em] text-[#565c68]">
                    {decision.trace.length} real tool calls
                  </p>
                </div>
                <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                  {decision.trace.map((step) => (
                    <li key={`${step.step}-${step.tool}`} className="rounded-[6px] border border-white/[0.075] bg-[#0c0e13] p-3">
                      <div className="flex items-start gap-2">
                        <span className="font-mono text-[8px] text-[#555b66]">
                          {String(step.step).padStart(2, "0")}
                        </span>
                        <div className="min-w-0">
                          <p className="font-mono text-[9px] font-semibold text-[#b5abed]">
                            {step.tool}
                          </p>
                          <p className={`mt-1 text-[9px] font-semibold uppercase ${step.status === "completed" ? resultTone(step.outcome) : "text-[#e9bf59]"}`}>
                            {readable(step.outcome)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {step.authenticity_labels.map((label) => (
                          <span key={label} className={`rounded-[3px] border px-1.5 py-0.5 text-[6px] font-bold uppercase tracking-[0.07em] ${AUTHENTICITY_TONES[label]}`}>
                            {label}
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {decision.authenticity_sources.map((source) => (
                    <span key={source} className="rounded-[3px] border border-white/[0.08] px-1.5 py-1 text-[7px] text-[#747a86]">
                      {source}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[510px] items-center justify-center px-6 text-center">
              <div className="max-w-md">
                <div className="mx-auto flex size-10 items-center justify-center rounded-full border border-[#8f7df0]/25 bg-[#8f7df0]/[0.06] font-mono text-[11px] text-[#aaa0e8]">
                  PL
                </div>
                <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#81778f]">
                  Ready for policy check
                </p>
                <p className="mt-2 text-[11px] leading-5 text-[#696f7a]">
                  ProofLayer will evaluate the backing claim, inspect mapped certificate state, and
                  read PolicyGate where relevant before returning a protocol recommendation.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
