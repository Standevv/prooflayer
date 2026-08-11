"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  DemoRunnerResponse,
  OrchestrationHealth,
} from "@/lib/agent";
import type { CertificateExplorerRecord } from "@/lib/certificates";
import { formatCertificateTime } from "@/lib/certificates";
import type { DeveloperPlatformStatus } from "@/lib/developers";
import { KNOWN_USDY_CERTIFICATE_ID, XLAYER } from "@/lib/developers";
import type { EvidenceAssetDetail } from "@/lib/evidence";
import { evidenceResultStyle } from "@/lib/evidence";
import type { MonitoringOverview, TrustSnapshot } from "@/lib/monitoring";
import { formatMonitoringTime } from "@/lib/monitoring";

type StatusTone = "ok" | "warn" | "bad" | "muted";

const TONE_STYLES: Record<StatusTone, string> = {
  ok: "border-[#36d17c]/25 bg-[#36d17c]/[0.07] text-[#5cdb94]",
  warn: "border-[#e9b949]/25 bg-[#e9b949]/[0.07] text-[#e9c55f]",
  bad: "border-[#ff6b6b]/25 bg-[#ff6b6b]/[0.07] text-[#ff8181]",
  muted: "border-white/[0.08] bg-white/[0.03] text-[#9ca1ad]",
};

function statusBadge(label: string, tone: StatusTone) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[5px] border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.09em] ${TONE_STYLES[tone]}`}
    >
      <span
        className={`size-1.5 rounded-full ${
          tone === "ok"
            ? "bg-[#36d17c]"
            : tone === "warn"
              ? "bg-[#e9b949]"
              : tone === "bad"
                ? "bg-[#ff6b6b]"
                : "bg-[#8a8f9b]"
        }`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

function SectionTitle({
  kicker,
  title,
  note,
}: {
  kicker: string;
  title: string;
  note?: string;
}) {
  return (
    <div className="mb-4">
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#8f84dd]">
        {kicker}
      </p>
      <h2 className="mt-2 text-[19px] font-semibold tracking-[-0.03em] text-[#f2f3f7]">
        {title}
      </h2>
      {note ? <p className="mt-1.5 text-[11px] leading-5 text-[#8d929e]">{note}</p> : null}
    </div>
  );
}

function MonoValue({ value, label }: { value: string | null; label?: string }) {
  if (!value) return <span className="font-mono text-[10px] text-[#8a8f9b]">Unavailable</span>;
  const display = value.length > 26 ? `${value.slice(0, 10)}…${value.slice(-10)}` : value;
  return (
    <code
      title={value}
      className="block max-w-full overflow-hidden text-ellipsis font-mono text-[10px] text-[#c9c4ea]"
    >
      {display}
      {label ? <span className="ml-2 text-[#7c8190]">{label}</span> : null}
    </code>
  );
}

function MetricCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[7px] border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
      <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">
        {label}
      </p>
      <p className="mt-1 font-mono text-[13px] font-semibold text-[#e8e9ee]">{value}</p>
      {sub ? <p className="mt-0.5 text-[9px] leading-4 text-[#8d929e]">{sub}</p> : null}
    </div>
  );
}

type TrustDomainView = {
  root: string;
  label: string;
  sourceType: string;
  status: StatusTone;
  freshness: string;
  freshnessReason: string;
  observedAt: string | null;
  recordCount: number;
  liveOrCached: string;
  staleAttestation: boolean;
};

function buildTrustDomains(detail: EvidenceAssetDetail | null): TrustDomainView[] {
  if (!detail) return [];
  const byRoot = new Map<string, typeof detail.evidence_records>();
  for (const record of detail.evidence_records) {
    const group = byRoot.get(record.root_source_id) ?? [];
    group.push(record);
    byRoot.set(record.root_source_id, group);
  }
  const names: Record<string, { label: string; type: string }> = {
    ondo: { label: "Ondo", type: "issuer" },
    ethereum: { label: "Ethereum", type: "on-chain" },
    ankura: { label: "Ankura", type: "attestation" },
  };
  const views: TrustDomainView[] = [];
  for (const [root, records] of byRoot) {
    const name = names[root] ?? { label: root, type: records[0]?.source_type ?? "unknown" };
    const stale = records.some((record) => record.freshness === "STALE");
    const hasLive = records.some((record) => record.authenticity_labels.includes("LIVE READ"));
    const hasCached = records.some((record) =>
      record.authenticity_labels.includes("CACHED OFFICIAL EVIDENCE"),
    );
    const observedAt = records
      .map((record) => record.observed_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
    const freshness = stale ? "STALE" : records.some((r) => r.freshness === "UNKNOWN") ? "UNKNOWN" : "CURRENT";
    views.push({
      root,
      label: name.label,
      sourceType: name.type,
      status: stale ? "bad" : "ok",
      freshness,
      freshnessReason: records.find((r) => r.freshness === "STALE")?.freshness_reason ?? "",
      observedAt,
      recordCount: records.length,
      liveOrCached: hasLive && !hasCached ? "LIVE READ" : hasCached ? "CACHED OFFICIAL EVIDENCE" : "MIXED",
      staleAttestation: stale && root === "ankura",
    });
  }
  return views.sort((a, b) => a.label.localeCompare(b.label));
}

type AlertItem = {
  severity: "CRITICAL" | "WARNING" | "INFO";
  message: string;
  source: string;
};

function buildAlerts(
  health: OrchestrationHealth | null,
  developer: DeveloperPlatformStatus | null,
  evidence: EvidenceAssetDetail | null,
  monitoring: MonitoringOverview | null,
  certificates: CertificateExplorerRecord[] | null,
): AlertItem[] {
  const alerts: AlertItem[] = [];
  if (!health || health.status !== "ok") {
    alerts.push({
      severity: "CRITICAL",
      message: "Local orchestration API is unreachable. Start it with: python scripts/run_agent_api.py",
      source: "orchestration",
    });
  }
  if (developer && developer.xlayer.status !== "CONNECTED") {
    alerts.push({
      severity: "CRITICAL",
      message: "X Layer testnet read is unavailable.",
      source: "xlayer",
    });
  }
  if (
    evidence &&
    evidence.live_ethereum_read_enabled === true &&
    evidence.live_ethereum_read_failed === true
  ) {
    alerts.push({
      severity: "WARNING",
      message: "Live Ethereum read failed; USDY evidence degraded to cached snapshot only.",
      source: "ethereum",
    });
  }
  if (evidence && evidence.live_ethereum_read_enabled === false) {
    alerts.push({
      severity: "WARNING",
      message: "Live Ethereum evidence reads are not enabled.",
      source: "ethereum",
    });
  }
  if (health && health.status === "ok" && !health.agent_configured) {
    alerts.push({
      severity: "WARNING",
      message: "AI Verification Agent is not configured.",
      source: "agent",
    });
  }
  if (evidence) {
    for (const requirement of evidence.missing_requirements) {
      alerts.push({
        severity: "WARNING",
        message: `Missing evidence: ${requirement}`,
        source: "evidence",
      });
    }
  }
  for (const certificate of certificates ?? []) {
    const state = certificate.usability?.state;
    if (state === "EXPIRED") {
      alerts.push({
        severity: "WARNING",
        message: `Certificate ${short(certificate.certificate_id)} is expired.`,
        source: "certificate",
      });
    }
    if (state === "REVOKED") {
      alerts.push({
        severity: "CRITICAL",
        message: `Certificate ${short(certificate.certificate_id)} is revoked.`,
        source: "certificate",
      });
    }
  }
  for (const asset of monitoring?.assets ?? []) {
    const snapshot = asset.current_snapshot;
    if (!snapshot) continue;
    if (snapshot.evidence_freshness === "STALE") {
      alerts.push({
        severity: "WARNING",
        message: `${asset.asset} evidence freshness is STALE.`,
        source: "monitoring",
      });
    }
    if (snapshot.reason_codes.includes("MISSING_EVIDENCE")) {
      alerts.push({
        severity: "INFO",
        message: `${asset.asset} RVC reports MISSING_EVIDENCE.`,
        source: "monitoring",
      });
    }
    for (const error of snapshot.source_errors ?? []) {
      alerts.push({
        severity: "WARNING",
        message: `${asset.asset} source error: ${error}`,
        source: "monitoring",
      });
    }
  }
  return alerts;
}

function short(value: string): string {
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

export function OperatorConsole() {
  const [health, setHealth] = useState<OrchestrationHealth | null>(null);
  const [developer, setDeveloper] = useState<DeveloperPlatformStatus | null>(null);
  const [evidence, setEvidence] = useState<EvidenceAssetDetail | null>(null);
  const [certificates, setCertificates] = useState<CertificateExplorerRecord[] | null>(null);
  const [certificateDetail, setCertificateDetail] = useState<CertificateExplorerRecord | null>(null);
  const [monitoring, setMonitoring] = useState<MonitoringOverview | null>(null);
  const [runResult, setRunResult] = useState<DemoRunnerResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    const [healthPayload, developerPayload, evidencePayload, certificatesPayload, monitoringPayload] =
      await Promise.all([
        fetch("/api/agent/health").then((response) =>
          response.ok ? (response.json() as Promise<OrchestrationHealth>) : null,
        ).catch(() => null),
        fetch("/api/developers/status").then((response) =>
          response.ok ? (response.json() as Promise<DeveloperPlatformStatus>) : null,
        ).catch(() => null),
        fetch("/api/evidence/usdy").then((response) =>
          response.ok ? (response.json() as Promise<EvidenceAssetDetail>) : null,
        ).catch(() => null),
        fetch("/api/certificates").then((response) =>
          response.ok ? (response.json() as Promise<CertificateExplorerRecord[]>) : null,
        ).catch(() => null),
        fetch("/api/monitoring").then((response) =>
          response.ok ? (response.json() as Promise<MonitoringOverview>) : null,
        ).catch(() => null),
      ]);
    const detailPayload = await fetch(`/api/certificates/${KNOWN_USDY_CERTIFICATE_ID}`)
      .then((response) => (response.ok ? (response.json() as Promise<CertificateExplorerRecord>) : null))
      .catch(() => null);

    setHealth(healthPayload);
    setDeveloper(developerPayload);
    setEvidence(evidencePayload);
    setCertificates(certificatesPayload);
    setCertificateDetail(detailPayload);
    setMonitoring(monitoringPayload);
    setLastRefreshed(new Date());
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const runVerification = useCallback(async () => {
    setRunning(true);
    setRunError(null);
    try {
      const response = await fetch("/api/demo/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: "usdy_treasury_verification" }),
        cache: "no-store",
      });
      const payload = (await response.json()) as DemoRunnerResponse | { available?: boolean; error?: string };
      if (!response.ok || "error" in payload) {
        setRunError("error" in payload && payload.error ? payload.error : "Deterministic verification could not complete.");
        return;
      }
      setRunResult(payload as DemoRunnerResponse);
      void refresh();
    } catch {
      setRunError("Local orchestration API unavailable. Start it with: python scripts/run_agent_api.py");
    } finally {
      setRunning(false);
    }
  }, [refresh]);

  const domains = useMemo(() => buildTrustDomains(evidence), [evidence]);
  const alerts = useMemo(
    () => buildAlerts(health, developer, evidence, monitoring, certificates),
    [health, developer, evidence, monitoring, certificates],
  );
  const rvcResult = evidence?.verification.result ?? null;
  const canIssue = rvcResult === "PASS";
  const ethereumTone: StatusTone =
    evidence?.live_ethereum_read_enabled === true
      ? evidence.live_ethereum_read_failed === true
        ? "bad"
        : "ok"
      : evidence === null
        ? "muted"
        : "warn";

  return (
    <div className="space-y-5">
      {/* LOCAL OPERATOR MODE banner */}
      <div className="rounded-[7px] border border-[#e9b949]/25 bg-[#e9b949]/[0.05] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#e9c55f]">
              LOCAL / DEMO OPERATOR MODE
            </p>
            <p className="mt-1 text-[11px] leading-5 text-[#b5a76f]">
              No authentication, no write capabilities, no production RBAC. Read-only control and observation
              against the local ProofLayer API. Production auth &amp; RBAC are deferred.
            </p>
          </div>
          {lastRefreshed ? (
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#8d929e]">
              Last refreshed {lastRefreshed.toISOString().replace("T", " ").slice(0, 19)}Z
            </p>
          ) : null}
        </div>
      </div>

      {/* System health */}
      <section>
        <SectionTitle kicker="System" title="Operator Health" note="Composed from real local API, Ethereum, and X Layer read state." />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-[7px] border border-white/[0.07] bg-white/[0.02] px-3 py-3">
            <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">Orchestration API</p>
            <div className="mt-2">{statusBadge(health?.status === "ok" ? "Operational" : "Offline", health?.status === "ok" ? "ok" : "bad")}</div>
          </div>
          <div className="rounded-[7px] border border-white/[0.07] bg-white/[0.02] px-3 py-3">
            <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">X Layer Testnet</p>
            <div className="mt-2">
              {statusBadge(
                developer?.xlayer.status === "CONNECTED" ? "Connected" : "Unavailable",
                developer?.xlayer.status === "CONNECTED" ? "ok" : "bad",
              )}
            </div>
            {developer?.latest_block ? (
              <p className="mt-2 font-mono text-[9px] text-[#8d929e]">Block {developer.latest_block.toLocaleString("en-US")}</p>
            ) : null}
          </div>
          <div className="rounded-[7px] border border-white/[0.07] bg-white/[0.02] px-3 py-3">
            <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">Ethereum RPC</p>
            <div className="mt-2">
              {statusBadge(
                evidence?.live_ethereum_read_enabled === true
                  ? evidence.live_ethereum_read_failed === true
                    ? "Degraded"
                    : "Live"
                  : "Not configured",
                ethereumTone,
              )}
            </div>
            {evidence?.live_ethereum_read_failed === true ? (
              <p className="mt-2 text-[9px] leading-4 text-[#ff8181]">Last live read failed</p>
            ) : null}
          </div>
          <div className="rounded-[7px] border border-white/[0.07] bg-white/[0.02] px-3 py-3">
            <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">AI Agent</p>
            <div className="mt-2">
              {statusBadge(
                health?.agent_configured ? `Configured · ${health.model}` : "Unconfigured",
                health?.agent_configured ? "ok" : "warn",
              )}
            </div>
          </div>
          <div className="rounded-[7px] border border-white/[0.07] bg-white/[0.02] px-3 py-3">
            <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">Deterministic RVC</p>
            <div className="mt-2">
              {statusBadge(health?.deterministic_demo_available ? "Available" : "Unavailable", health?.deterministic_demo_available ? "ok" : "bad")}
            </div>
          </div>
          <div className="rounded-[7px] border border-white/[0.07] bg-white/[0.02] px-3 py-3">
            <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">Write Capabilities</p>
            <div className="mt-2">{statusBadge("None", "muted")}</div>
          </div>
        </div>
      </section>

      {/* USDY Verification Control */}
      <section>
        <SectionTitle
          kicker="USDY · TreasuryBacking"
          title="Verification Control"
          note="Authoritative deterministic RVC state; the operator cannot override it."
        />
        <div className="rounded-[9px] border border-white/[0.08] bg-[#0d0e13] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={`rounded-[6px] border px-2.5 py-1 text-[11px] font-bold tracking-[0.08em] ${evidenceResultStyle(rvcResult ?? "INDETERMINATE")}`}>
                RVC {rvcResult ?? "UNAVAILABLE"}
              </span>
              <span className="text-[11px] text-[#9ca1ad]">
                {evidence?.verification.reason_codes.length
                  ? evidence.verification.reason_codes.join(", ")
                  : "No reason codes"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void runVerification()}
                disabled={running || health?.status !== "ok"}
                className="surface-transition rounded-[7px] border border-[#8f7df0]/35 bg-[#8f7df0]/[0.1] px-3.5 py-2 text-[11px] font-semibold text-[#ddd8ff] hover:border-[#8f7df0]/60 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {running ? "Running verification…" : "Run Verification"}
              </button>
              <button
                type="button"
                disabled={!canIssue}
                title={
                  canIssue
                    ? "Certificate issuance requires a signer; not available in LOCAL OPERATOR MODE."
                    : `Issuance locked: authoritative RVC must be PASS (currently ${rvcResult ?? "unavailable"}).`
                }
                className="surface-transition rounded-[7px] border border-[#ff6b6b]/25 bg-[#ff6b6b]/[0.05] px-3.5 py-2 text-[11px] font-semibold text-[#9a6a6a] hover:border-[#ff6b6b]/40 disabled:cursor-not-allowed disabled:opacity-55"
              >
                Issue Certificate
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
            <MetricCell label="Evidence Records" value={String(evidence?.evidence_records.length ?? "—")} />
            <MetricCell label="Independent Roots" value={String(evidence?.provenance.independent_root_count ?? "—")} sub={evidence?.provenance.independent_root_ids.join(" · ")} />
            <MetricCell label="Verification Time" value={evidence?.verification.observed_at ? evidence.verification.observed_at.replace("T", " ").slice(0, 16) : "—"} sub="UTC" />
            <MetricCell label="Policy" value={evidence?.verification.policy_id ?? "—"} sub={`v${evidence?.verification.policy_version ?? "?"}`} />
            <div className="col-span-2 rounded-[7px] border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
              <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">Evidence Commitment</p>
              <div className="mt-1"><MonoValue value={evidence?.evidence_commitment.value ?? null} /></div>
              <p className="mt-0.5 text-[9px] text-[#8d929e]">pl-evidence-v1 · {evidence?.evidence_commitment.independent_root_count ?? "—"} roots</p>
            </div>
          </div>

          {evidence?.verification.predicates?.length ? (
            <div className="mt-4 overflow-hidden rounded-[7px] border border-white/[0.07]">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/[0.07] bg-white/[0.02]">
                    <th className="px-3 py-2 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">Predicate</th>
                    <th className="px-3 py-2 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">Result</th>
                    <th className="hidden px-3 py-2 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190] sm:table-cell">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {evidence.verification.predicates.map((predicate) => (
                    <tr key={predicate.predicate} className="border-b border-white/[0.05] last:border-b-0">
                      <td className="px-3 py-1.5 font-mono text-[10px] text-[#c9c4ea]">{predicate.predicate}</td>
                      <td className="px-3 py-1.5">
                        {predicate.passed === true
                          ? statusBadge("Pass", "ok")
                          : predicate.passed === false
                            ? statusBadge("Fail", "bad")
                            : statusBadge("Indeterminate", "warn")}
                      </td>
                      <td className="hidden px-3 py-1.5 text-[10px] text-[#8d929e] sm:table-cell">{predicate.reason_code ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {runError ? (
            <p className="mt-4 rounded-[5px] border border-[#ff6b6b]/25 bg-[#ff6b6b]/[0.05] px-3 py-2 text-[11px] text-[#ff9b9b]">
              {runError}
            </p>
          ) : null}

          {runResult ? (
            <div className="mt-4 rounded-[7px] border border-white/[0.07] bg-[#0a0b0f] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8f84dd]">
                  Latest verification run · {runResult.scenario}
                </p>
                <div className="flex items-center gap-2">
                  {statusBadge(`RVC ${runResult.verification_result ?? "UNAVAILABLE"}`, runResult.verification_result === "PASS" ? "ok" : runResult.verification_result === "FAIL" ? "bad" : "warn")}
                  {runResult.certificate_status ? (
                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#8d929e]">
                      {runResult.certificate_status.replaceAll("_", " ")}
                    </span>
                  ) : null}
                  {runResult.policygate_outcome ? (
                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#8d929e]">
                      PolicyGate {runResult.policygate_outcome.replaceAll("_", " ")}
                    </span>
                  ) : null}
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-[#b1b5bf]">{runResult.summary}</p>
              <div className="mt-3 space-y-1">
                {runResult.trace.map((step) => (
                  <div key={`${step.step}-${step.tool}`} className="flex items-start gap-2.5 border-t border-white/[0.04] py-1.5">
                    <span className="mt-0.5 w-5 shrink-0 font-mono text-[9px] text-[#7c8190]">{String(step.step).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] font-semibold text-[#e2e0f4]">{step.tool}</span>
                        {step.status === "unavailable" ? statusBadge("Unavailable", "bad") : null}
                        {step.authenticity_labels.map((label) => (
                          <span key={label} className="text-[8px] font-semibold uppercase tracking-[0.1em] text-[#7c8190]">
                            {label.replaceAll("_", " ")}
                          </span>
                        ))}
                      </div>
                      <p className="mt-0.5 text-[10px] leading-4 text-[#8d929e]">{step.result_summary}</p>
                    </div>
                    <span className="shrink-0 font-mono text-[9px] text-[#7c8190]">{step.duration_ms.toFixed(0)}ms</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* Evidence sources / trust domains */}
      <section>
        <SectionTitle
          kicker="Evidence Sources"
          title="Trust Domains"
          note="Each independent root is shown with its real freshness and observation state."
        />
        <div className="grid gap-3 md:grid-cols-3">
          {domains.map((domain) => (
            <div
              key={domain.root}
              className={`rounded-[9px] border p-4 ${domain.staleAttestation ? "border-[#ff6b6b]/30 bg-[#ff6b6b]/[0.04]" : "border-white/[0.08] bg-[#0d0e13]"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[13px] font-semibold text-[#eef0f5]">{domain.label}</p>
                  <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-[#7c8190]">
                    root · {domain.root}
                  </p>
                </div>
                {statusBadge(domain.freshness === "STALE" ? "Stale" : domain.freshness === "UNKNOWN" ? "Unknown" : "Available", domain.status)}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
                <div>
                  <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">Source type</p>
                  <p className="mt-0.5 text-[#c9c4ea]">{domain.sourceType}</p>
                </div>
                <div>
                  <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">Mode</p>
                  <p className="mt-0.5 text-[#c9c4ea]">{domain.liveOrCached}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">Observation</p>
                  <p className="mt-0.5 font-mono text-[10px] text-[#c9c4ea]">
                    {domain.observedAt ? domain.observedAt.replace("T", " ").slice(0, 16) : "Unavailable"}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">Records</p>
                  <p className="mt-0.5 text-[#c9c4ea]">{domain.recordCount} normalized records</p>
                </div>
              </div>
              {domain.staleAttestation ? (
                <div className="mt-3 rounded-[5px] border border-[#ff6b6b]/30 bg-[#ff6b6b]/[0.08] px-2.5 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#ff8181]">STALE_ATTESTATION</p>
                  <p className="mt-0.5 text-[9px] leading-4 text-[#d98f8f]">
                    {domain.freshnessReason || "Report observation exceeds the 24-hour policy window."}
                  </p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {/* Certificate operations */}
      <section>
        <SectionTitle
          kicker="Certificates"
          title="Certificate Operations"
          note="Exported certificates with current live X Layer registration and usability."
        />
        <div className="overflow-hidden rounded-[9px] border border-white/[0.08] bg-[#0d0e13]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/[0.07] bg-white/[0.02]">
                  <th className="px-3 py-2.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">Certificate</th>
                  <th className="px-3 py-2.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">Result</th>
                  <th className="hidden px-3 py-2.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190] md:table-cell">Evidence commitment</th>
                  <th className="px-3 py-2.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">Issued</th>
                  <th className="px-3 py-2.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">Expires</th>
                  <th className="px-3 py-2.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">Revoked</th>
                  <th className="px-3 py-2.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">X Layer usability</th>
                </tr>
              </thead>
              <tbody>
                {(certificates ?? []).map((certificate) => (
                  <tr key={certificate.certificate_id} className="border-b border-white/[0.05] last:border-b-0">
                    <td className="px-3 py-2.5">
                      <code className="block font-mono text-[10px] text-[#c9c4ea]">{short(certificate.certificate_id)}</code>
                      {certificate.labels.asset ? (
                        <span className="mt-1 inline-block text-[8px] font-semibold uppercase tracking-[0.1em] text-[#8d929e]">
                          {certificate.labels.asset} · {certificate.labels.claim ?? "unknown claim"}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      {certificate.core.result ? statusBadge(certificate.core.result, certificate.core.result === "PASS" ? "ok" : certificate.core.result === "FAIL" ? "bad" : "warn") : statusBadge("Unknown", "muted")}
                    </td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      <MonoValue value={certificate.core.evidence_root} />
                    </td>
                    <td className="px-3 py-2.5 text-[10px] text-[#b9bdc7]">
                      {formatCertificateTime(certificate.core.observed_at)}
                    </td>
                    <td className="px-3 py-2.5 text-[10px] text-[#b9bdc7]">
                      {formatCertificateTime(certificate.core.valid_until)}
                    </td>
                    <td className="px-3 py-2.5">
                      {certificate.core.revoked === true ? statusBadge("Revoked", "bad") : certificate.core.revoked === false ? statusBadge("No", "muted") : statusBadge("Unknown", "muted")}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {statusBadge(certificate.usability?.state ?? "UNAVAILABLE", certificate.usability?.usable ? "ok" : certificate.usability?.state === "EXPIRED" ? "bad" : certificate.usability?.state === "REVOKED" ? "bad" : "warn")}
                        <span className="hidden font-mono text-[8px] uppercase tracking-[0.08em] text-[#7c8190] xl:inline">
                          {certificate.registry?.current_usable === true ? "usable" : "unusable"}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!certificates?.length ? (
            <p className="px-4 py-6 text-center font-mono text-[11px] text-[#7c8190]">
              No exported certificate fixtures are available from the local API.
            </p>
          ) : null}
        </div>
        <p className="mt-2 text-[10px] leading-4 text-[#7c8190]">
          Issuance is intentionally disabled: it requires an authoritative RVC of PASS and a configured signer.
          No certificate was issued or registered from this console.
        </p>
      </section>

      {/* PolicyGate */}
      <section>
        <SectionTitle kicker="Enforcement" title="PolicyGate State" note="Read-only assessment from the deployed X Layer PolicyGate." />
        <div className="rounded-[9px] border border-white/[0.08] bg-[#0d0e13] p-4 sm:p-5">
          {certificateDetail ? (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2.5">
                <MetricCell label="Certificate" value={short(certificateDetail.certificate_id)} />
                <MetricCell
                  label="Usability"
                  value={certificateDetail.usability?.state ?? "UNAVAILABLE"}
                  sub={certificateDetail.usability?.reason}
                />
              </div>
              <div className="space-y-2.5">
                <MetricCell
                  label="Policy"
                  value={certificateDetail.labels.policy ?? "default-treasury-policy"}
                  sub={`${certificateDetail.labels.asset ?? "USDY"} · ${certificateDetail.labels.claim ?? "TreasuryBacking"}`}
                />
                <MetricCell
                  label="Registry"
                  value={certificateDetail.registry?.read_status ?? "UNAVAILABLE"}
                  sub={
                    certificateDetail.registry?.latest_block
                      ? `X Layer Testnet · block ${certificateDetail.registry.latest_block.toLocaleString("en-US")}`
                      : XLAYER.name
                  }
                />
              </div>
              <div className="rounded-[7px] border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">PolicyGate decision</p>
                <div className="mt-2">
                  {statusBadge(
                    certificateDetail.enforcement?.outcome === "ALLOW" ? "ALLOW" : certificateDetail.enforcement?.outcome === "BLOCK" ? "BLOCK" : "NOT CHECKED",
                    certificateDetail.enforcement?.outcome === "ALLOW" ? "ok" : certificateDetail.enforcement?.outcome === "BLOCK" ? "bad" : "muted",
                  )}
                </div>
                <p className="mt-2 text-[10px] leading-5 text-[#b1b5bf]">{certificateDetail.enforcement?.reason}</p>
                <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.1em] text-[#7c8190]">
                  source · {certificateDetail.enforcement?.source ?? "UNAVAILABLE"} · no action executed
                </p>
              </div>
            </div>
          ) : (
            <p className="font-mono text-[11px] text-[#7c8190]">
              Certificate detail unavailable — the local API may be offline.
            </p>
          )}
        </div>
      </section>

      {/* Monitoring */}
      <section>
        <SectionTitle kicker="Monitoring" title="Assets & Alerts" note="Persisted local trust snapshots and derived operational alerts." />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[9px] border border-white/[0.08] bg-[#0d0e13] p-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#8f84dd]">Latest trust snapshots</p>
            <div className="mt-3 space-y-2">
              {(monitoring?.assets ?? []).map((asset) => {
                const snapshot: TrustSnapshot | null = asset.current_snapshot;
                return (
                  <div key={asset.asset} className="rounded-[7px] border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] font-semibold text-[#eef0f5]">
                        {asset.asset} <span className="text-[#7c8190]">· {asset.claim}</span>
                      </p>
                      {snapshot ? (
                        statusBadge(snapshot.verification_result, snapshot.verification_result === "PASS" ? "ok" : snapshot.verification_result === "FAIL" ? "bad" : "warn")
                      ) : (
                        statusBadge("Never checked", "muted")
                      )}
                    </div>
                    {snapshot ? (
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] sm:grid-cols-4">
                        <div>
                          <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">Checked</p>
                          <p className="mt-0.5 font-mono text-[9px] text-[#b9bdc7]">{formatMonitoringTime(snapshot.checked_at)}</p>
                        </div>
                        <div>
                          <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">Freshness</p>
                          <p className={`mt-0.5 font-mono text-[9px] ${snapshot.evidence_freshness === "STALE" ? "text-[#ff8181]" : "text-[#b9bdc7]"}`}>
                            {snapshot.evidence_freshness ?? "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">Certificate</p>
                          <p className="mt-0.5 font-mono text-[9px] text-[#b9bdc7]">{snapshot.certificate_status}</p>
                        </div>
                        <div>
                          <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#7c8190]">PolicyGate</p>
                          <p className="mt-0.5 font-mono text-[9px] text-[#b9bdc7]">{snapshot.policygate_outcome}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {!monitoring?.assets?.length ? (
                <p className="font-mono text-[10px] text-[#7c8190]">No monitoring history is available from the local API.</p>
              ) : null}
            </div>
          </div>
          <div className="rounded-[9px] border border-white/[0.08] bg-[#0d0e13] p-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#8f84dd]">Operational alerts</p>
            <div className="mt-3 space-y-1.5">
              {alerts.length === 0 ? (
                <p className="font-mono text-[10px] text-[#7c8190]">No active alerts.</p>
              ) : (
                alerts.map((alert, index) => (
                  <div
                    key={`${alert.source}-${index}`}
                    className={`flex items-start gap-2.5 rounded-[6px] border px-3 py-2 ${
                      alert.severity === "CRITICAL"
                        ? "border-[#ff6b6b]/25 bg-[#ff6b6b]/[0.05]"
                        : alert.severity === "WARNING"
                          ? "border-[#e9b949]/25 bg-[#e9b949]/[0.04]"
                          : "border-white/[0.07] bg-white/[0.02]"
                    }`}
                  >
                    {statusBadge(alert.severity, alert.severity === "CRITICAL" ? "bad" : alert.severity === "WARNING" ? "warn" : "muted")}
                    <div className="min-w-0">
                      <p className={`text-[10px] leading-4 ${alert.severity === "CRITICAL" ? "text-[#ffb3b3]" : alert.severity === "WARNING" ? "text-[#e9c55f]" : "text-[#b9bdc7]"}`}>
                        {alert.message}
                      </p>
                      <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[#7c8190]">{alert.source}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footing */}
      <footer className="flex flex-col gap-1 border-t border-white/[0.08] py-4 text-[10px] leading-4 text-[#747987] sm:flex-row sm:justify-between">
        <p>Operator Console · read-only · local API at 127.0.0.1:8010</p>
        <p>No transactions · No certificate issuance · No RVC override possible</p>
      </footer>
    </div>
  );
}
