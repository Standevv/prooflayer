import { createHash, timingSafeEqual } from "node:crypto";

export const TESTNET_ISSUANCE_ENABLED_ENV =
  "PROOFLAYER_TESTNET_ISSUANCE_ENABLED";
export const OPERATOR_TOKEN_ENV = "PROOFLAYER_OPERATOR_TOKEN";

export type IssuanceBoundaryDecision =
  | { allowed: true; operatorToken: string; idempotencyKey: string }
  | {
      allowed: false;
      status: 403 | 503;
      error: string;
      errorCode:
        | "ISSUANCE_DISABLED"
        | "OPERATOR_AUTH_NOT_CONFIGURED"
        | "UNAUTHORIZED_OPERATOR"
        | "INVALID_IDEMPOTENCY_KEY";
    };

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function isTestnetIssuanceEnabled(
  value = process.env[TESTNET_ISSUANCE_ENABLED_ENV],
): boolean {
  return value === "true";
}

export function readBearerToken(value: string | null): string | null {
  if (!value) return null;
  const match = /^Bearer[ \t]+([^\s]+)$/i.exec(value);
  return match?.[1] ?? null;
}

export function operatorTokenMatches(
  suppliedToken: string | null,
  expectedToken = process.env[OPERATOR_TOKEN_ENV],
): boolean {
  if (!suppliedToken || !expectedToken || expectedToken.length < 32) return false;
  return timingSafeEqual(digest(suppliedToken), digest(expectedToken));
}

export function isValidIdempotencyKey(value: string | null): value is string {
  return value !== null && /^[A-Za-z0-9._:-]{8,128}$/.test(value);
}

export function authorizeIssuanceRequest(
  authorizationHeader: string | null,
  idempotencyHeader: string | null,
  env: Readonly<Record<string, string | undefined>> = process.env,
): IssuanceBoundaryDecision {
  if (!isTestnetIssuanceEnabled(env[TESTNET_ISSUANCE_ENABLED_ENV])) {
    return {
      allowed: false,
      status: 503,
      error: "Certificate issuance is disabled on this ProofLayer instance.",
      errorCode: "ISSUANCE_DISABLED",
    };
  }

  const expectedToken = env[OPERATOR_TOKEN_ENV];
  if (!expectedToken || expectedToken.length < 32) {
    return {
      allowed: false,
      status: 503,
      error: "Testnet operator authorization is not configured.",
      errorCode: "OPERATOR_AUTH_NOT_CONFIGURED",
    };
  }

  const operatorToken = readBearerToken(authorizationHeader);
  if (!operatorToken || !operatorTokenMatches(operatorToken, expectedToken)) {
    return {
      allowed: false,
      status: 403,
      error: "Authenticated testnet operator authorization is required.",
      errorCode: "UNAUTHORIZED_OPERATOR",
    };
  }

  if (!isValidIdempotencyKey(idempotencyHeader)) {
    return {
      allowed: false,
      status: 403,
      error: "A valid Idempotency-Key is required for certificate issuance.",
      errorCode: "INVALID_IDEMPOTENCY_KEY",
    };
  }

  return {
    allowed: true,
    operatorToken,
    idempotencyKey: idempotencyHeader,
  };
}

export type BrowserIssuancePayload = {
  asset: string;
  claim: string;
  policy_id: string;
};

export function sanitizeIssuancePayload(
  payload: unknown,
): BrowserIssuancePayload | null {
  if (typeof payload !== "object" || payload === null) return null;
  const input = payload as Record<string, unknown>;
  const allowedFields = new Set(["asset", "claim", "policy_id"]);
  if (Object.keys(input).some((field) => !allowedFields.has(field))) return null;
  const fields = [input.asset, input.claim, input.policy_id];
  if (
    fields.some(
      (value) =>
        typeof value !== "string" ||
        value.trim().length === 0 ||
        value.trim().length > 128,
    )
  ) {
    return null;
  }
  return {
    asset: (input.asset as string).trim(),
    claim: (input.claim as string).trim(),
    policy_id: (input.policy_id as string).trim(),
  };
}
