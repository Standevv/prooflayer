import type {
  CurrentVerificationTruth,
  VerificationTruthResult,
} from "@/lib/truth-presentation";

const DEFAULT_API_URL = "http://127.0.0.1:8010";
const REQUEST_TIMEOUT_MS = 45_000;
const RESULTS = new Set<VerificationTruthResult>([
  "PASS",
  "FAIL",
  "INDETERMINATE",
]);
const RVC_AUTHORITY = "ProofLayer deterministic RVC";
const EXPLICIT_TIMEZONE = /(?:Z|[+-]\d{2}:\d{2})$/i;

function apiBaseUrl(): string {
  return (
    process.env.PROOFLAYER_API_URL ||
    process.env.PROOFLAYER_AGENT_API_URL ||
    DEFAULT_API_URL
  ).replace(/\/$/, "");
}

export async function getCurrentVerification(
  asset: "usdy" | "paxg",
): Promise<CurrentVerificationTruth | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiBaseUrl()}/evidence/${asset}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;

    return parseCurrentVerification(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function parseCurrentVerification(
  payload: unknown,
  now: Date = new Date(),
): CurrentVerificationTruth | null {
    if (typeof payload !== "object" || payload === null) return null;
    const verification = (payload as Record<string, unknown>).verification;
    if (typeof verification !== "object" || verification === null) return null;
    const value = verification as Record<string, unknown>;
    const currentResult = value.current_rvc_result ?? value.result;
    if (
      typeof currentResult !== "string" ||
      !RESULTS.has(currentResult as VerificationTruthResult) ||
      (value.current_rvc_result !== undefined &&
        value.result !== undefined &&
        value.current_rvc_result !== value.result)
    ) {
      return null;
    }
    if (
      !Array.isArray(value.reason_codes) ||
      !value.reason_codes.every((reason) => typeof reason === "string")
    ) {
      return null;
    }

    // A current result must come from the deterministic RVC, must not be a
    // simulation, and must still be inside its authoritative validity window.
    // Historical/expired fixture data is never promoted to current PASS.
    if (value.simulation !== false || value.authority !== RVC_AUTHORITY) {
      return null;
    }
    if (
      typeof value.observed_at !== "string" ||
      typeof value.valid_until !== "string" ||
      !EXPLICIT_TIMEZONE.test(value.observed_at) ||
      !EXPLICIT_TIMEZONE.test(value.valid_until)
    ) {
      return null;
    }
    const observedAt = Date.parse(value.observed_at);
    const validUntil = Date.parse(value.valid_until);
    if (
      !Number.isFinite(observedAt) ||
      !Number.isFinite(validUntil) ||
      observedAt > now.getTime() ||
      validUntil <= observedAt ||
      validUntil <= now.getTime()
    ) {
      return null;
    }

    return {
      result: currentResult as VerificationTruthResult,
      reason_codes: value.reason_codes,
      observed_at: value.observed_at,
      valid_until: value.valid_until,
    };
}
