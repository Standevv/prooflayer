// Errors in this set may occur after a transaction was submitted or while a
// still-running backend request outlives the browser/proxy response. Retrying
// them under a fresh idempotency key is unsafe until the original intent has
// been reconciled.
const AMBIGUOUS_ISSUANCE_CODES = new Set([
  "NETWORK_ERROR",
  "REQUEST_TIMEOUT",
  "SERVICE_UNAVAILABLE",
  "IDEMPOTENCY_CONFLICT",
  "IDEMPOTENCY_IN_PROGRESS",
  "TRANSACTION_FAILED",
  "TRANSACTION_STATE_UNKNOWN",
  "POST_SUBMIT_VERIFICATION_FAILED",
  "READBACK_FAILED",
  "UNKNOWN_ERROR",
]);

export function mustRetainIssuanceIntent(errorCode: string | null): boolean {
  return errorCode !== null && AMBIGUOUS_ISSUANCE_CODES.has(errorCode);
}

export const ISSUANCE_INTENT_STORAGE_KEY =
  "prooflayer:testnet-issuance-intent:v2";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const EXPLICIT_TIMEZONE = /(?:Z|[+-]\d{2}:\d{2})$/i;
const INTENT_FIELDS = new Set([
  "version",
  "idempotencyKey",
  "payload",
  "unresolved",
]);
const PAYLOAD_FIELDS = new Set(["asset", "claim", "policy_id"]);

export type IssuanceIntentPayload = Readonly<{
  asset: string;
  claim: string;
  policy_id: string;
}>;

export type PersistedIssuanceIntent = Readonly<{
  version: 2;
  idempotencyKey: string;
  payload: IssuanceIntentPayload;
  unresolved: boolean;
}>;

function hasExactFields(
  value: Record<string, unknown>,
  expected: ReadonlySet<string>,
): boolean {
  const fields = Object.keys(value);
  return fields.length === expected.size && fields.every((field) => expected.has(field));
}

function isIntentValue(value: unknown): value is PersistedIssuanceIntent {
  if (typeof value !== "object" || value === null) return false;
  const intent = value as Record<string, unknown>;
  if (!hasExactFields(intent, INTENT_FIELDS)) return false;
  if (
    intent.version !== 2 ||
    typeof intent.idempotencyKey !== "string" ||
    !IDEMPOTENCY_KEY_PATTERN.test(intent.idempotencyKey) ||
    typeof intent.unresolved !== "boolean" ||
    typeof intent.payload !== "object" ||
    intent.payload === null
  ) {
    return false;
  }

  const payload = intent.payload as Record<string, unknown>;
  return (
    hasExactFields(payload, PAYLOAD_FIELDS) &&
    typeof payload.asset === "string" &&
    payload.asset.length > 0 &&
    typeof payload.claim === "string" &&
    payload.claim.length > 0 &&
    typeof payload.policy_id === "string" &&
    payload.policy_id.length > 0
  );
}

function immutableIntent(
  idempotencyKey: string,
  payload: IssuanceIntentPayload,
  unresolved: boolean,
): PersistedIssuanceIntent {
  return Object.freeze({
    version: 2 as const,
    idempotencyKey,
    payload: Object.freeze({ ...payload }),
    unresolved,
  });
}

export function createIssuanceIntent(
  idempotencyKey: string,
  payload: IssuanceIntentPayload,
  unresolved = false,
): PersistedIssuanceIntent {
  const candidate = {
    version: 2,
    idempotencyKey,
    payload,
    unresolved,
  };
  if (!isIntentValue(candidate)) {
    throw new Error("Cannot create an invalid issuance intent.");
  }
  return immutableIntent(idempotencyKey, payload, unresolved);
}

export function setIssuanceIntentUnresolved(
  intent: PersistedIssuanceIntent,
): PersistedIssuanceIntent {
  return immutableIntent(intent.idempotencyKey, intent.payload, true);
}

export function serializeIssuanceIntent(
  intent: PersistedIssuanceIntent,
): string {
  return JSON.stringify(intent);
}

export function parseIssuanceIntent(
  serialized: string | null,
): PersistedIssuanceIntent | null {
  if (!serialized) return null;
  try {
    const candidate: unknown = JSON.parse(serialized);
    if (!isIntentValue(candidate)) return null;
    return immutableIntent(
      candidate.idempotencyKey,
      candidate.payload,
      candidate.unresolved,
    );
  } catch {
    return null;
  }
}

export function isAuthoritativeRvcWindowCurrent(
  observedAt: string | null | undefined,
  validUntil: string | null | undefined,
  nowMs: number,
): boolean {
  if (
    !observedAt ||
    !validUntil ||
    !EXPLICIT_TIMEZONE.test(observedAt) ||
    !EXPLICIT_TIMEZONE.test(validUntil)
  ) {
    return false;
  }
  const observed = Date.parse(observedAt);
  const expiry = Date.parse(validUntil);
  return (
    Number.isFinite(observed) &&
    Number.isFinite(expiry) &&
    observed <= nowMs &&
    expiry > observed &&
    expiry > nowMs
  );
}

export function canSubmitIssuance({
  intent,
  currentRvcIsAuthoritative,
  currentRvcResult,
  writeCapabilities,
  operatorAuthenticated,
}: {
  intent: PersistedIssuanceIntent | null;
  currentRvcIsAuthoritative: boolean;
  currentRvcResult: string | null;
  writeCapabilities: boolean;
  operatorAuthenticated: boolean;
}): boolean {
  if (!writeCapabilities || !operatorAuthenticated) return false;
  if (intent?.unresolved) return true;
  return currentRvcIsAuthoritative && currentRvcResult === "PASS";
}
