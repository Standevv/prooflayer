"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CertificateIssuanceResponse,
  DemoRunnerResponse,
  OrchestrationHealth,
} from "@/lib/agent";
import type { CertificateExplorerRecord } from "@/lib/certificates";
import { formatCertificateTime } from "@/lib/certificates";
import type { DeveloperPlatformStatus } from "@/lib/developers";
import { KNOWN_USDY_CERTIFICATE_ID, XLAYER } from "@/lib/developers";
import type { EvidenceAssetDetail } from "@/lib/evidence";
import { evidenceResultStyle } from "@/lib/evidence";
import {
  canSubmitIssuance,
  createIssuanceIntent,
  ISSUANCE_INTENT_STORAGE_KEY,
  isAuthoritativeRvcWindowCurrent,
  mustRetainIssuanceIntent,
  parseIssuanceIntent,
  serializeIssuanceIntent,
  setIssuanceIntentUnresolved,
  type IssuanceIntentPayload,
  type PersistedIssuanceIntent,
} from "@/lib/issuance-intent";
import type { MonitoringOverview, TrustSnapshot } from "@/lib/monitoring";
import { formatMonitoringTime } from "@/lib/monitoring";

type IssuanceState = {
  status: "idle" | "confirming" | "pending" | "success" | "error";
  transactionHash: string | null;
  blockNumber: number | null;
  readBackMatches: boolean | null;
  error: string | null;
  errorCode: string | null;
  requestId: string | null;
  operatorId: string | null;
  idempotentReplay: boolean | null;
  authoritativeObservedAt: string | null;
  authoritativeValidUntil: string | null;
  auditStatus: string | null;
  ambiguous: boolean;
};

type StatusTone = "ok" | "warn" | "bad" | "muted";

const TONE_STYLES: Record<StatusTone, string> = {
  ok: "border-success/25 bg-success-soft/[0.07] text-success",
  warn: "border-warning/25 bg-warning/[0.07] text-warning",
  bad: "border-fail/25 bg-fail/[0.07] text-fail",
  muted: "border-edge bg-overlay-hover text-secondary",
};

function statusBadge(label: string, tone: StatusTone) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[5px] border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.09em] ${TONE_STYLES[tone]}`}
    >
      <span
        className={`size-1.5 rounded-full ${
          tone === "ok"
            ? "bg-success-soft"
            : tone === "warn"
              ? "bg-warning"
              : tone === "bad"
                ? "bg-fail"
                : "bg-overlay-active"
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
    <div className="mb-5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-brand">
        {kicker}
      </p>
      <h2 className="mt-2 text-[20px] font-bold tracking-[-0.035em] text-accent">
        {title}
      </h2>
      {note ? <p className="mt-2 max-w-2xl text-[11px] leading-5 text-secondary">{note}</p> : null}
    </div>
  );
}

function MonoValue({ value, label }: { value: string | null; label?: string }) {
  if (!value) return <span className="font-mono text-[10px] text-secondary">Unavailable</span>;
  const display = value.length > 26 ? `${value.slice(0, 10)}…${value.slice(-10)}` : value;
  return (
    <code
      title={value}
      className="block max-w-full overflow-hidden text-ellipsis font-mono text-[10px] text-brand-ink"
    >
      {display}
      {label ? <span className="ml-2 text-secondary">{label}</span> : null}
    </code>
  );
}

function MetricCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[7px] border border-edge bg-overlay-hover px-3 py-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">
        {label}
      </p>
      <p className="mt-1 font-mono text-[13px] font-semibold text-accent">{value}</p>
      {sub ? <p className="mt-0.5 text-[9px] leading-4 text-secondary">{sub}</p> : null}
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
        message: `${asset.asset} persisted snapshot recorded STALE evidence as of ${formatMonitoringTime(snapshot.checked_at)}.`,
        source: "monitoring history",
      });
    }
    if (snapshot.reason_codes.includes("MISSING_EVIDENCE")) {
      alerts.push({
        severity: "INFO",
        message: `${asset.asset} persisted snapshot recorded RVC reason MISSING_EVIDENCE as of ${formatMonitoringTime(snapshot.checked_at)}.`,
        source: "monitoring history",
      });
    }
    for (const error of snapshot.source_errors ?? []) {
      alerts.push({
        severity: "WARNING",
        message: `${asset.asset} persisted snapshot recorded source error as of ${formatMonitoringTime(snapshot.checked_at)}: ${error}`,
        source: "monitoring history",
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
  const [clockNowMs, setClockNowMs] = useState(() => Date.now());
  const [issuanceState, setIssuanceState] = useState<IssuanceState>({
    status: "idle",
    transactionHash: null,
    blockNumber: null,
    readBackMatches: null,
    error: null,
    errorCode: null,
    requestId: null,
    operatorId: null,
    idempotentReplay: null,
    authoritativeObservedAt: null,
    authoritativeValidUntil: null,
    auditStatus: null,
    ambiguous: false,
  });
  const [operatorToken, setOperatorToken] = useState("");
  const [issuanceIntent, setIssuanceIntent] =
    useState<PersistedIssuanceIntent | null>(null);
  const issuanceInFlight = useRef(false);

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

  useEffect(() => {
    // The stored intent contains no credential or authoritative certificate
    // fields. Its immutable selector and key ensure that a reload cannot turn
    // reconciliation into a different issuance request.
    const restored = parseIssuanceIntent(
      window.sessionStorage.getItem(ISSUANCE_INTENT_STORAGE_KEY),
    );
    if (restored?.unresolved) {
      const restore = window.setTimeout(() => setIssuanceIntent(restored), 0);
      return () => window.clearTimeout(restore);
    } else if (restored) {
      // A draft that was never submitted is safe to discard after a reload.
      window.sessionStorage.removeItem(ISSUANCE_INTENT_STORAGE_KEY);
    }
    return undefined;
  }, []);

  useEffect(() => {
    // Current truth advances with wall-clock time. In particular, a PASS is
    // withdrawn from the UI and from new-issuance eligibility at expiration
    // even when the operator leaves this page open without refreshing.
    const interval = window.setInterval(() => setClockNowMs(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  const rvcFieldsAgree =
    evidence === null ||
    evidence.verification.current_rvc_result === evidence.verification.result;
  const currentRvcIsAuthoritative =
    evidence !== null &&
    rvcFieldsAgree &&
    evidence.verification.simulation === false &&
    evidence.verification.authority === "ProofLayer deterministic RVC" &&
    isAuthoritativeRvcWindowCurrent(
      evidence.verification.observed_at,
      evidence.verification.valid_until,
      clockNowMs,
    );
  const rvcResult = currentRvcIsAuthoritative
    ? evidence.verification.current_rvc_result
    : null;
  const writeCapabilities = health?.write_capabilities ?? false;
  const operatorAuthenticated = operatorToken.length >= 32;
  const hasUnresolvedIssuance = issuanceIntent?.unresolved === true;
  const canIssue = canSubmitIssuance({
    intent: issuanceIntent,
    currentRvcIsAuthoritative,
    currentRvcResult: rvcResult,
    writeCapabilities,
    operatorAuthenticated,
  });
  const currentIssuancePayload = useMemo<IssuanceIntentPayload | null>(
    () =>
      evidence
        ? {
            asset: evidence.asset,
            claim: evidence.claim,
            policy_id: evidence.verification.policy_id,
          }
        : null,
    [evidence],
  );

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

  const persistIssuanceIntent = useCallback(
    (intent: PersistedIssuanceIntent) => {
      setIssuanceIntent(intent);
      window.sessionStorage.setItem(
        ISSUANCE_INTENT_STORAGE_KEY,
        serializeIssuanceIntent(intent),
      );
    },
    [],
  );

  const clearIssuanceIntent = useCallback(() => {
    setIssuanceIntent(null);
    window.sessionStorage.removeItem(ISSUANCE_INTENT_STORAGE_KEY);
  }, []);

  const handleIssueCertificate = useCallback(() => {
    let intent = issuanceIntent;
    if (intent === null) {
      if (
        currentIssuancePayload === null ||
        !currentRvcIsAuthoritative ||
        rvcResult !== "PASS"
      ) {
        return;
      }
      intent = createIssuanceIntent(
        crypto.randomUUID(),
        currentIssuancePayload,
      );
      persistIssuanceIntent(intent);
    }
    setIssuanceState({
      status: "confirming",
      transactionHash: null,
      blockNumber: null,
      readBackMatches: null,
      error: null,
      errorCode: null,
      requestId: null,
      operatorId: null,
      idempotentReplay: null,
      authoritativeObservedAt: null,
      authoritativeValidUntil: null,
      auditStatus: null,
      ambiguous: intent.unresolved,
    });
  }, [
    currentIssuancePayload,
    currentRvcIsAuthoritative,
    issuanceIntent,
    persistIssuanceIntent,
    rvcResult,
  ]);

  const cancelIssuance = useCallback(() => {
    if (issuanceIntent?.unresolved) return;
    setIssuanceState({
      status: "idle",
      transactionHash: null,
      blockNumber: null,
      readBackMatches: null,
      error: null,
      errorCode: null,
      requestId: null,
      operatorId: null,
      idempotentReplay: null,
      authoritativeObservedAt: null,
      authoritativeValidUntil: null,
      auditStatus: null,
      ambiguous: false,
    });
    clearIssuanceIntent();
    setOperatorToken("");
  }, [clearIssuanceIntent, issuanceIntent]);

  const confirmIssuance = useCallback(async () => {
    // Only one issuance request at a time; a second click is ignored while
    // a request is in flight (the pending state renders immediately, but
    // the ref closes the double-click race before state propagates).
    if (
      issuanceInFlight.current ||
      operatorToken.length < 32 ||
      issuanceIntent === null ||
      (!issuanceIntent.unresolved &&
        (!rvcFieldsAgree ||
          !currentRvcIsAuthoritative ||
          rvcResult !== "PASS")) ||
      !writeCapabilities
    ) return;
    issuanceInFlight.current = true;
    const wasReconciliation = issuanceIntent.unresolved;
    const pendingIntent = setIssuanceIntentUnresolved(issuanceIntent);
    // Persist synchronously before fetch: after this point a transaction may
    // be submitted even if the tab closes or the response is lost.
    persistIssuanceIntent(pendingIntent);
    setIssuanceState((prev) => ({ ...prev, status: "pending", error: null, errorCode: null }));

    try {
      const response = await fetch("/api/certificates/issue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${operatorToken}`,
          "Idempotency-Key": pendingIntent.idempotencyKey,
        },
        body: JSON.stringify(pendingIntent.payload),
        cache: "no-store",
      });
      const payload = (await response.json()) as CertificateIssuanceResponse;

      if (!response.ok || payload.success !== true || payload.error) {
        const errorCode = payload.error_code || "UNKNOWN_ERROR";
        // An unresolved prior attempt is cleared only by an actual replay of a
        // definitive result. A fresh pre-signer rejection cannot reconcile an
        // earlier unknown transaction after a backend restart.
        const ambiguous =
          mustRetainIssuanceIntent(errorCode) ||
          (wasReconciliation && payload.idempotent_replay !== true);
        if (!ambiguous) {
          clearIssuanceIntent();
        } else {
          persistIssuanceIntent(pendingIntent);
        }
        setIssuanceState({
          status: "error",
          transactionHash: payload.transaction_hash ?? null,
          blockNumber: payload.block_number ?? null,
          readBackMatches: payload.read_back?.matches ?? null,
          error: payload.error || "Certificate issuance failed",
          errorCode,
          requestId: payload.request_id ?? null,
          operatorId: payload.operator_id ?? null,
          idempotentReplay: payload.idempotent_replay ?? null,
          authoritativeObservedAt: payload.authoritative_observed_at ?? null,
          authoritativeValidUntil: payload.authoritative_valid_until ?? null,
          auditStatus: payload.audit_status ?? null,
          ambiguous,
        });
        return;
      }

      setIssuanceState({
        status: "success",
        transactionHash: payload.transaction_hash ?? null,
        blockNumber: payload.block_number ?? null,
        readBackMatches: payload.read_back?.matches ?? false,
        error: null,
        errorCode: null,
        requestId: payload.request_id ?? null,
        operatorId: payload.operator_id ?? null,
        idempotentReplay: payload.idempotent_replay ?? false,
        authoritativeObservedAt: payload.authoritative_observed_at ?? null,
        authoritativeValidUntil: payload.authoritative_valid_until ?? null,
        auditStatus: payload.audit_status ?? null,
        ambiguous: false,
      });
      clearIssuanceIntent();
      void refresh();
    } catch {
      // The backend may still be running or a transaction may have been
      // submitted. Keep the same intent key for the only safe retry path.
      persistIssuanceIntent(pendingIntent);
      setIssuanceState({
        status: "error",
        transactionHash: null,
        blockNumber: null,
        readBackMatches: null,
        error: "Local orchestration API unavailable. Start it with: python scripts/run_agent_api.py",
        errorCode: "NETWORK_ERROR",
        requestId: null,
        operatorId: null,
        idempotentReplay: null,
        authoritativeObservedAt: null,
        authoritativeValidUntil: null,
        auditStatus: null,
        ambiguous: true,
      });
    } finally {
      issuanceInFlight.current = false;
      setOperatorToken("");
    }
  }, [
    clearIssuanceIntent,
    currentRvcIsAuthoritative,
    issuanceIntent,
    operatorToken,
    persistIssuanceIntent,
    refresh,
    rvcFieldsAgree,
    rvcResult,
    writeCapabilities,
  ]);

  const domains = useMemo(() => buildTrustDomains(evidence), [evidence]);
  const alerts = useMemo(
    () => buildAlerts(health, developer, evidence, monitoring, certificates),
    [health, developer, evidence, monitoring, certificates],
  );
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
      <div className="rounded-[7px] border border-warning/25 bg-warning/[0.05] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-warning">
              TESTNET OPERATOR MODE
            </p>
            <p className="mt-1 text-[11px] leading-5 text-warning">
              Certificate issuance is disabled by default and, when explicitly enabled, requires a development/testnet operator credential.
              This bearer control is not a substitute for production KMS/HSM signing, multisig governance, or institutional identity and RBAC.
            </p>
          </div>
          {lastRefreshed ? (
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-secondary">
              Last refreshed {lastRefreshed.toISOString().replace("T", " ").slice(0, 19)}Z
            </p>
          ) : null}
        </div>
      </div>

      {/* System health */}
      <section>
        <SectionTitle kicker="System" title="Operator Health" note="Composed from real local API, Ethereum, and X Layer read state." />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-[7px] border border-edge bg-overlay-hover px-3 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Orchestration API</p>
            <div className="mt-2">{statusBadge(health?.status === "ok" ? "Operational" : "Offline", health?.status === "ok" ? "ok" : "bad")}</div>
          </div>
          <div className="rounded-[7px] border border-edge bg-overlay-hover px-3 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">X Layer Testnet</p>
            <div className="mt-2">
              {statusBadge(
                developer?.xlayer.status === "CONNECTED" ? "Connected" : "Unavailable",
                developer?.xlayer.status === "CONNECTED" ? "ok" : "bad",
              )}
            </div>
            {developer?.latest_block ? (
              <p className="mt-2 font-mono text-[9px] text-secondary">Block {developer.latest_block.toLocaleString("en-US")}</p>
            ) : null}
          </div>
          <div className="rounded-[7px] border border-edge bg-overlay-hover px-3 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Ethereum RPC</p>
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
              <p className="mt-2 text-[9px] leading-4 text-fail">Last live read failed</p>
            ) : null}
          </div>
          <div className="rounded-[7px] border border-edge bg-overlay-hover px-3 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">AI Agent</p>
            <div className="mt-2">
              {statusBadge(
                health?.backend_status === "ONLINE"
                  ? `Online · ${health.model}`
                  : health?.agent_configured
                    ? "Configured"
                    : "Unconfigured",
                health?.backend_status === "ONLINE" ? "ok" : "warn",
              )}
            </div>
          </div>
          <div className="rounded-[7px] border border-edge bg-overlay-hover px-3 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Deterministic RVC</p>
            <div className="mt-2">
              {statusBadge("Available", "ok")}
            </div>
          </div>
          <div className="rounded-[7px] border border-edge bg-overlay-hover px-3 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Testnet issuance boundary</p>
            <div className="mt-2">{statusBadge(writeCapabilities ? "Ready" : "Locked", writeCapabilities ? "ok" : "warn")}</div>
            {health?.issuance_readiness ? (
              <>
                <div className="mt-2.5 space-y-1">
                  {(
                    [
                      ["Explicitly enabled", health.issuance_readiness.enabled],
                      ["Operator auth", health.issuance_readiness.operator_auth_configured],
                      ["Chain 1952", health.issuance_readiness.chain_matches],
                      ["Registry code", health.issuance_readiness.registry_has_code],
                      ["Signer key", health.issuance_readiness.signer_key_present],
                      ["RPC reachable", health.issuance_readiness.rpc_reachable],
                    ] as Array<[string, boolean]>
                  ).map(([label, ok]) => (
                    <p key={label} className="flex items-center gap-1.5 text-[9px] leading-4 text-secondary">
                      <span className={`size-1 rounded-full ${ok ? "bg-success-soft" : "bg-warning"}`} aria-hidden="true" />
                      {label}
                    </p>
                  ))}
                </div>
                <p className="mt-2 text-[9px] leading-4 text-tertiary">{health.issuance_readiness.note}</p>
                <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.08em] text-tertiary">{health.issuance_readiness.control_scope}</p>
              </>
            ) : null}
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
        <div
          className={`rounded-[9px] border bg-surface p-4 sm:p-5 ${
            rvcResult === "FAIL"
              ? "border-fail/20"
              : rvcResult === "INDETERMINATE"
                ? "border-warning/20"
                : "border-edge"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-[7px] border px-3 py-1.5 text-[12px] font-bold tracking-[0.08em] ${evidenceResultStyle(rvcResult ?? "INDETERMINATE")}`}>
                RVC {rvcResult ?? "UNAVAILABLE"}
              </span>
              <span className="text-[11px] text-secondary">
                {evidence?.verification.reason_codes.length
                  ? evidence.verification.reason_codes.join(", ")
                  : "No reason codes"}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_auto] sm:items-end">
              <label className="text-[8px] font-semibold uppercase tracking-[0.1em] text-secondary">
                Ephemeral testnet operator credential
                <input
                  type="password"
                  value={operatorToken}
                  onChange={(event) => setOperatorToken(event.target.value)}
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder="Required only when issuance is enabled"
                  className="mt-1.5 h-9 w-full rounded-[7px] border border-edge bg-scrim px-3 font-mono text-[10px] font-normal normal-case tracking-normal text-primary placeholder:text-tertiary"
                  aria-describedby="operator-credential-note"
                />
                <span id="operator-credential-note" className="mt-1 block text-[8px] font-normal normal-case tracking-normal text-tertiary">
                  Development/testnet only. Held in page memory, cleared after every attempt, and exposed if this page is compromised by XSS.
                </span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void runVerification()}
                  disabled={running || health?.status !== "ok"}
                  className="surface-transition rounded-[7px] border border-brand/35 bg-brand/[0.1] px-3.5 py-2 text-[11px] font-semibold text-brand-ink hover:border-brand/60 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {running ? "Running verification…" : "Run Verification"}
                </button>
                <button
                  type="button"
                  disabled={!canIssue || issuanceState.status === "pending"}
                  onClick={handleIssueCertificate}
                  title={
                    canIssue
                      ? hasUnresolvedIssuance
                        ? "Reconcile the exact retained issuance request using its original idempotency key"
                        : "Request an idempotent certificate issuance on X Layer Testnet"
                      : hasUnresolvedIssuance
                        ? "Reconciliation requires the testnet signer boundary and an operator credential; current RVC state does not replace the retained request."
                        : `Issuance locked: authoritative RVC must be PASS, the testnet signer boundary ready, and an operator credential supplied (RVC currently ${rvcResult ?? "unavailable"}).`
                  }
                  className={`surface-transition rounded-[7px] border px-3.5 py-2 text-[11px] font-semibold ${
                    canIssue
                      ? "border-success/35 bg-success-soft/[0.1] text-success hover:border-success/60"
                      : "border-fail/25 bg-fail/[0.05] text-fail hover:border-fail/40"
                  } disabled:cursor-not-allowed disabled:opacity-55`}
                >
                  {issuanceState.status === "pending"
                    ? issuanceState.ambiguous
                      ? "Reconciling…"
                      : "Issuing…"
                    : hasUnresolvedIssuance
                      ? "Reconcile Issuance"
                      : "Issue Certificate"}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
            <MetricCell label="Evidence Records" value={String(evidence?.evidence_records.length ?? "—")} />
            <MetricCell label="Independent Roots" value={String(evidence?.provenance.independent_root_count ?? "—")} sub={evidence?.provenance.independent_root_ids.join(" · ")} />
            <MetricCell label="Verification Time" value={evidence?.verification.observed_at ? evidence.verification.observed_at.replace("T", " ").slice(0, 16) : "—"} sub="UTC" />
            <MetricCell label="Policy" value={evidence?.verification.policy_id ?? "—"} sub={`v${evidence?.verification.policy_version ?? "?"}`} />
            <div className="col-span-2 rounded-[7px] border border-edge bg-overlay-hover px-3 py-2.5">
              <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Evidence Commitment</p>
              <div className="mt-1"><MonoValue value={evidence?.evidence_commitment.value ?? null} /></div>
              <p className="mt-0.5 text-[9px] text-secondary">pl-evidence-v1 · {evidence?.evidence_commitment.independent_root_count ?? "—"} roots</p>
            </div>
          </div>

          {rvcResult === "FAIL" || rvcResult === "INDETERMINATE" ? (
            <div
              className={`mt-3 rounded-[6px] border px-3 py-2 text-[10px] leading-4 ${
                rvcResult === "FAIL"
                  ? "border-fail/25 bg-fail/[0.05] text-fail"
                  : "border-warning/25 bg-warning/[0.05] text-warning"
              }`}
            >
              {rvcResult === "FAIL"
                ? `Verification is FAIL — certificate issuance is locked until the authoritative RVC reaches PASS. Reason: ${
                    evidence?.verification.reason_codes.join(", ") || "see predicates"
                  }.`
                : "Verification is INDETERMINATE — evidence is insufficient and issuance remains locked."}
            </div>
          ) : null}

          {evidence?.verification.predicates?.length ? (
            <div className="mt-4 overflow-hidden rounded-[7px] border border-edge">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-edge bg-overlay-hover">
                    <th className="px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Predicate</th>
                    <th className="px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Result</th>
                    <th className="hidden px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary sm:table-cell">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {evidence.verification.predicates.map((predicate) => (
                    <tr key={predicate.predicate} className="border-b border-edge last:border-b-0">
                      <td className="px-3 py-1.5 font-mono text-[10px] text-brand-ink">{predicate.predicate}</td>
                      <td className="px-3 py-1.5">
                        {predicate.passed === true
                          ? statusBadge("Pass", "ok")
                          : predicate.passed === false
                            ? statusBadge("Fail", "bad")
                            : statusBadge("Indeterminate", "warn")}
                      </td>
                      <td className="hidden px-3 py-1.5 text-[10px] text-secondary sm:table-cell">{predicate.reason_code ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {runError ? (
            <p className="mt-4 rounded-[5px] border border-fail/25 bg-fail/[0.05] px-3 py-2 text-[11px] text-fail">
              {runError}
            </p>
          ) : null}

          {runResult ? (
            <div className="mt-4 rounded-[7px] border border-edge bg-surface p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand">
                  Latest verification run · {runResult.scenario}
                </p>
                <div className="flex items-center gap-2">
                  {statusBadge(`RVC ${runResult.verification_result ?? "UNAVAILABLE"}`, runResult.verification_result === "PASS" ? "ok" : runResult.verification_result === "FAIL" ? "bad" : "warn")}
                  {runResult.certificate_status ? (
                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-secondary">
                      {runResult.certificate_status.replaceAll("_", " ")}
                    </span>
                  ) : null}
                  {runResult.policygate_outcome ? (
                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-secondary">
                      PolicyGate {runResult.policygate_outcome.replaceAll("_", " ")}
                    </span>
                  ) : null}
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-primary">{runResult.summary}</p>
              <div className="mt-3 space-y-1">
                {runResult.trace.map((step) => (
                  <div key={`${step.step}-${step.tool}`} className="flex items-start gap-2.5 border-t border-edge py-1.5">
                    <span className="mt-0.5 w-5 shrink-0 font-mono text-[9px] text-secondary">{String(step.step).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] font-semibold text-accent">{step.tool}</span>
                        {step.status === "unavailable" ? statusBadge("Unavailable", "bad") : null}
                        {step.authenticity_labels.map((label) => (
                          <span key={label} className="text-[8px] font-semibold uppercase tracking-[0.1em] text-secondary">
                            {label.replaceAll("_", " ")}
                          </span>
                        ))}
                      </div>
                      <p className="mt-0.5 text-[10px] leading-4 text-secondary">{step.result_summary}</p>
                    </div>
                    <span className="shrink-0 font-mono text-[9px] text-secondary">{step.duration_ms.toFixed(0)}ms</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Issuance confirmation modal */}
          {issuanceState.status === "confirming" && (
            <div className="mt-4 rounded-[7px] border border-success/30 bg-surface p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-success">
                {issuanceState.ambiguous
                  ? "Confirm Issuance Reconciliation"
                  : "Confirm Certificate Issuance"}
              </p>
              <p className="mt-2 text-[11px] leading-5 text-primary">
                {issuanceState.ambiguous
                  ? "This retries the exact retained asset, claim, policy, and idempotency key. A changed or expired current RVC does not alter that request; the backend may only replay its prior result or re-evaluate it fail closed."
                  : "This authenticated request can submit an on-chain transaction to X Layer Testnet (chain ID 1952). Certificate observation and validity timestamps come from the authoritative RVC and cannot be extended here."}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Asset</p>
                  <p className="mt-0.5 text-brand-ink">{issuanceIntent?.payload.asset ?? "Unavailable"}</p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Current RVC result</p>
                  <p className={`mt-0.5 ${rvcResult === "PASS" ? "text-success" : "text-fail"}`}>
                    {rvcResult ?? "UNAVAILABLE"}
                    {evidence?.verification.reason_codes.length ? ` — ${evidence.verification.reason_codes.join(", ")}` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Retained claim</p>
                  <p className="mt-0.5 text-brand-ink">{issuanceIntent?.payload.claim ?? "Unavailable"}</p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Retained policy</p>
                  <p className="mt-0.5 text-brand-ink">{issuanceIntent?.payload.policy_id ?? "Unavailable"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Current authoritative RVC valid until</p>
                  <p className="mt-0.5 font-mono text-brand-ink">{evidence?.verification.valid_until ?? "Unavailable"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Network</p>
                  <p className="mt-0.5 text-brand-ink">X Layer Testnet · chain ID 1952</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelIssuance}
                  disabled={issuanceState.ambiguous}
                  className="surface-transition rounded-[7px] border border-edge bg-overlay-hover px-3.5 py-2 text-[11px] font-semibold text-secondary hover:border-edge"
                >
                  {issuanceState.ambiguous ? "Reconciliation Required" : "Cancel"}
                </button>
                <button
                  type="button"
                  onClick={() => void confirmIssuance()}
                  disabled={!canIssue}
                  className="surface-transition rounded-[7px] border border-success/35 bg-success-soft/[0.1] px-3.5 py-2 text-[11px] font-semibold text-success hover:border-success/60"
                >
                  {issuanceState.ambiguous ? "Retry Same Intent" : "Issue Certificate"}
                </button>
              </div>
            </div>
          )}

          {/* Issuance pending */}
          {issuanceState.status === "pending" && (
            <div className="mt-4 rounded-[7px] border border-warning/30 bg-surface p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-warning">
                {issuanceState.ambiguous ? "Reconciling Issuance" : "Issuing Certificate"}
              </p>
              <p className="mt-2 text-[11px] leading-5 text-warning">
                {issuanceState.ambiguous
                  ? "Retrying the exact retained request. Please wait for the idempotent result."
                  : "Submitting transaction to X Layer Testnet. Please wait for confirmation."}
              </p>
            </div>
          )}

          {/* Issuance success */}
          {issuanceState.status === "success" && (
            <div className="mt-4 rounded-[7px] border border-success/30 bg-surface p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-success">
                Certificate Issued Successfully
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Transaction Hash</p>
                  <p className="mt-0.5 font-mono text-brand-ink break-all">
                    {issuanceState.transactionHash === "ALREADY_REGISTERED"
                      ? "Already registered"
                      : issuanceState.transactionHash}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Block Number</p>
                  <p className="mt-0.5 font-mono text-brand-ink">{issuanceState.blockNumber}</p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Read-back Verified</p>
                  <p className="mt-0.5 text-success">{issuanceState.readBackMatches ? "Yes" : "No"}</p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Request ID</p>
                  <p className="mt-0.5 break-all font-mono text-brand-ink">{issuanceState.requestId ?? "Unavailable"}</p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Audited operator</p>
                  <p className="mt-0.5 font-mono text-brand-ink">{issuanceState.operatorId ?? "Unavailable"}</p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Idempotency</p>
                  <p className="mt-0.5 font-mono text-brand-ink">{issuanceState.idempotentReplay ? "Replayed prior result" : "Original request"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={cancelIssuance}
                className="mt-3 surface-transition rounded-[7px] border border-edge bg-overlay-hover px-3.5 py-2 text-[11px] font-semibold text-secondary hover:border-edge"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Issuance error */}
          {issuanceState.status === "error" && (
            <div className="mt-4 rounded-[7px] border border-fail/30 bg-surface p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-fail">
                Certificate Issuance Failed
              </p>
              <p className="mt-2 text-[11px] leading-5 text-fail">
                {issuanceState.error}
              </p>
              <p className="mt-1 font-mono text-[9px] text-secondary">
                Error code: {issuanceState.errorCode}
              </p>
              {issuanceState.transactionHash ? (
                <p className="mt-2 break-all font-mono text-[9px] text-warning">
                  Transaction identity retained: {issuanceState.transactionHash}
                  {issuanceState.blockNumber !== null ? ` / block ${issuanceState.blockNumber}` : ""}
                </p>
              ) : null}
              {issuanceState.ambiguous ? (
                <p className="mt-2 text-[10px] leading-4 text-warning">
                  Transaction state may be unknown. Re-enter the operator credential and retry only with this retained idempotency intent; do not start a fresh issuance until the original request is reconciled.
                </p>
              ) : null}
              <button
                type="button"
                onClick={issuanceState.ambiguous ? handleIssueCertificate : cancelIssuance}
                className="mt-3 surface-transition rounded-[7px] border border-edge bg-overlay-hover px-3.5 py-2 text-[11px] font-semibold text-secondary hover:border-edge"
              >
                {issuanceState.ambiguous ? "Retry Same Intent" : "Dismiss"}
              </button>
            </div>
          )}
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
              className={`rounded-[9px] border p-4 ${domain.staleAttestation ? "border-fail/30 bg-fail/[0.04]" : "border-edge bg-surface"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[13px] font-semibold text-accent">{domain.label}</p>
                  <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-secondary">
                    root · {domain.root}
                  </p>
                </div>
                {statusBadge(domain.freshness === "STALE" ? "Stale" : domain.freshness === "UNKNOWN" ? "Unknown" : "Available", domain.status)}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Source type</p>
                  <p className="mt-0.5 text-brand-ink">{domain.sourceType}</p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Mode</p>
                  <p className="mt-0.5 text-brand-ink">{domain.liveOrCached}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Observation</p>
                  <p className="mt-0.5 font-mono text-[10px] text-brand-ink">
                    {domain.observedAt ? domain.observedAt.replace("T", " ").slice(0, 16) : "Unavailable"}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Records</p>
                  <p className="mt-0.5 text-brand-ink">{domain.recordCount} normalized records</p>
                </div>
              </div>
              {domain.staleAttestation ? (
                <div className="mt-3 rounded-[5px] border border-fail/30 bg-fail/[0.08] px-2.5 py-2">
                  <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-fail">STALE_ATTESTATION</p>
                  <p className="mt-0.5 text-[9px] leading-4 text-fail">
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
        <div className="overflow-hidden rounded-[9px] border border-edge bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-edge bg-overlay-hover">
                  <th className="px-3 py-2.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Certificate</th>
                  <th className="px-3 py-2.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Historical certificate result</th>
                  <th className="hidden px-3 py-2.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary md:table-cell">Evidence commitment</th>
                  <th className="px-3 py-2.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Issued</th>
                  <th className="px-3 py-2.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Expires</th>
                  <th className="px-3 py-2.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Revoked</th>
                  <th className="px-3 py-2.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">X Layer usability</th>
                </tr>
              </thead>
              <tbody>
                {(certificates ?? []).map((certificate) => (
                  <tr key={certificate.certificate_id} className="border-b border-edge last:border-b-0">
                    <td className="px-3 py-2.5">
                      <code className="block font-mono text-[10px] text-brand-ink">{short(certificate.certificate_id)}</code>
                      {certificate.labels.asset ? (
                        <span className="mt-1 inline-block text-[8px] font-semibold uppercase tracking-[0.1em] text-secondary">
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
                    <td className="px-3 py-2.5 text-[10px] text-primary">
                      {formatCertificateTime(certificate.core.observed_at)}
                    </td>
                    <td className="px-3 py-2.5 text-[10px] text-primary">
                      {formatCertificateTime(certificate.core.valid_until)}
                    </td>
                    <td className="px-3 py-2.5">
                      {certificate.core.revoked === true ? statusBadge("Revoked", "bad") : certificate.core.revoked === false ? statusBadge("No", "muted") : statusBadge("Unknown", "muted")}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {statusBadge(certificate.usability?.state ?? "UNAVAILABLE", certificate.usability?.usable ? "ok" : certificate.usability?.state === "EXPIRED" ? "bad" : certificate.usability?.state === "REVOKED" ? "bad" : "warn")}
                        <span className="hidden font-mono text-[8px] uppercase tracking-[0.08em] text-secondary xl:inline">
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
            <p className="px-4 py-6 text-center font-mono text-[11px] text-secondary">
              No exported certificate fixtures are available from the local API.
            </p>
          ) : null}
        </div>
        <p className="mt-2 text-[10px] leading-4 text-secondary">
          Certificate issuance requires an authoritative RVC of PASS and a signer verified on X Layer Testnet.
          {writeCapabilities
            ? " Signer readiness is verified (chain 1952, registry bytecode, key present). Balance and issuer authorization are confirmed only at signing time."
            : " Signer readiness is not verified; issuance is disabled."}
        </p>
      </section>

      {/* PolicyGate */}
      <section>
        <SectionTitle kicker="Enforcement" title="PolicyGate State" note="Read-only assessment from the deployed X Layer PolicyGate." />
        <div className="rounded-[9px] border border-edge bg-surface p-4 sm:p-5">
          {certificateDetail ? (
            <>
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
              <div className="rounded-[7px] border border-edge bg-overlay-hover px-3 py-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">PolicyGate decision</p>
                <div className="mt-2">
                  {statusBadge(
                    certificateDetail.enforcement?.outcome === "ALLOW" ? "ALLOW" : certificateDetail.enforcement?.outcome === "BLOCK" ? "BLOCK" : "NOT CHECKED",
                    certificateDetail.enforcement?.outcome === "ALLOW" ? "ok" : certificateDetail.enforcement?.outcome === "BLOCK" ? "bad" : "muted",
                  )}
                </div>
                <p className="mt-2 text-[10px] leading-5 text-primary">{certificateDetail.enforcement?.reason}</p>
                <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.1em] text-secondary">
                  source · {certificateDetail.enforcement?.source ?? "UNAVAILABLE"} · no action executed
                </p>
              </div>
            </div>
            {certificateDetail.enforcement?.outcome === "BLOCK" ? (
              <div className="mt-3 rounded-[6px] border border-fail/25 bg-fail/[0.05] px-3 py-2 text-[10px] leading-4 text-fail">
                PolicyGate blocks the protected action with the current certificate. Certificate registration
                stays separate and remains governed by the authoritative RVC.
              </div>
            ) : null}
            </>
          ) : (
            <p className="font-mono text-[11px] text-secondary">
              Certificate detail unavailable — the local API may be offline.
            </p>
          )}
        </div>
      </section>

      {/* Monitoring */}
      <section>
        <SectionTitle kicker="Monitoring" title="Assets & Alerts" note="Historical/as-of snapshot values are kept separate from the current RVC evidence shown in Verification Control above." />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[9px] border border-edge bg-surface p-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-brand">Most recent persisted snapshots</p>
            <p className="mt-1 text-[9px] leading-4 text-tertiary">AS-OF history only; these results are not substituted for current RVC truth.</p>
            <div className="mt-3 space-y-2">
              {(monitoring?.assets ?? []).map((asset) => {
                const snapshot: TrustSnapshot | null = asset.current_snapshot;
                return (
                  <div key={asset.asset} className="rounded-[7px] border border-edge bg-overlay-hover px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12px] font-semibold text-accent">
                        {asset.asset} <span className="text-secondary">· {asset.claim}</span>
                      </p>
                      {snapshot ? (
                        statusBadge(`AS-OF RVC ${snapshot.verification_result}`, snapshot.verification_result === "PASS" ? "ok" : snapshot.verification_result === "FAIL" ? "bad" : "warn")
                      ) : (
                        statusBadge("Never checked", "muted")
                      )}
                    </div>
                    {snapshot ? (
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] sm:grid-cols-4">
                        <div>
                          <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Snapshot captured</p>
                          <p className="mt-0.5 font-mono text-[9px] text-primary">{formatMonitoringTime(snapshot.checked_at)}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Freshness</p>
                          <p className={`mt-0.5 font-mono text-[9px] ${snapshot.evidence_freshness === "STALE" ? "text-fail" : "text-primary"}`}>
                            {snapshot.evidence_freshness ?? "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">Certificate</p>
                          <p className="mt-0.5 font-mono text-[9px] text-primary">{snapshot.certificate_status}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-secondary">PolicyGate</p>
                          <p className="mt-0.5 font-mono text-[9px] text-primary">{snapshot.policygate_outcome}</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {!monitoring?.assets?.length ? (
                <p className="font-mono text-[10px] text-secondary">No monitoring history is available from the local API.</p>
              ) : null}
            </div>
          </div>
          <div className="rounded-[9px] border border-edge bg-surface p-4">
            <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-brand">Operational alerts</p>
            <div className="mt-3 space-y-1.5">
              {alerts.length === 0 ? (
                <p className="font-mono text-[10px] text-secondary">No active alerts.</p>
              ) : (
                alerts.map((alert, index) => (
                  <div
                    key={`${alert.source}-${index}`}
                    className={`flex items-start gap-2.5 rounded-[6px] border px-3 py-2 ${
                      alert.severity === "CRITICAL"
                        ? "border-fail/25 bg-fail/[0.05]"
                        : alert.severity === "WARNING"
                          ? "border-warning/25 bg-warning/[0.04]"
                          : "border-edge bg-overlay-hover"
                    }`}
                  >
                    {statusBadge(alert.severity, alert.severity === "CRITICAL" ? "bad" : alert.severity === "WARNING" ? "warn" : "muted")}
                    <div className="min-w-0">
                      <p className={`text-[10px] leading-4 ${alert.severity === "CRITICAL" ? "text-fail" : alert.severity === "WARNING" ? "text-warning" : "text-primary"}`}>
                        {alert.message}
                      </p>
                      <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-secondary">{alert.source}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footing */}
      <footer className="flex flex-col gap-1 border-t border-edge py-4 text-[10px] leading-4 text-tertiary sm:flex-row sm:justify-between">
        <p>Operator Console · TESTNET · local API at 127.0.0.1:8010</p>
        <p>Testnet issuance disabled by default · Authenticated operator only · No RVC override possible</p>
      </footer>
    </div>
  );
}
