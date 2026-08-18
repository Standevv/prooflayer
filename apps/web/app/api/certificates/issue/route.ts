import type { AgentErrorResponse } from "@/lib/agent";
import {
  authorizeIssuanceRequest,
  sanitizeIssuancePayload,
} from "@/lib/issuance-boundary";

export const runtime = "nodejs";

// Issuance can take a while: the Python boundary runs the Hardhat signer
// (up to 120s) plus transaction confirmation and read-back. Give the proxy
// headroom above the subprocess timeout.
const REQUEST_TIMEOUT_MS = 210_000;
const DEFAULT_AGENT_API_URL = "http://127.0.0.1:8010";

function errorResponse(error: string, status: number, errorCode: string) {
  return Response.json(
    { available: false, error, error_code: errorCode },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  // Reject disabled or unauthorized callers before parsing the body and before
  // any request can reach the backend signer boundary.
  const authorization = authorizeIssuanceRequest(
    request.headers.get("authorization"),
    request.headers.get("idempotency-key"),
  );
  if (!authorization.allowed) {
    return errorResponse(
      authorization.error,
      authorization.status,
      authorization.errorCode,
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("Request body must be valid JSON.", 400, "INVALID_INPUT");
  }

  // Only identifiers selecting the authoritative RVC are accepted. Result,
  // timestamps, validity, evidence/provenance fields and certificate ID are
  // derived by the backend and cannot be supplied through this proxy.
  const body = sanitizeIssuancePayload(payload);
  if (!body) {
    return errorResponse(
      "asset, claim, and policy_id must be non-empty strings.",
      400,
      "INVALID_INPUT",
    );
  }

  const baseUrl = (
    process.env.PROOFLAYER_AGENT_API_URL || DEFAULT_AGENT_API_URL
  ).replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${baseUrl}/certificates/issue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authorization.operatorToken}`,
        "Idempotency-Key": authorization.idempotencyKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    const responsePayload = (await upstream.json()) as AgentErrorResponse | object;
    // Preserve the backend's structured error codes and success shape.
    return Response.json(responsePayload, {
      status: upstream.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return errorResponse(
      timedOut
        ? "Certificate issuance timed out before confirmation."
        : "Certificate issuance service unavailable. Start the local Python API.",
      timedOut ? 504 : 503,
      timedOut ? "REQUEST_TIMEOUT" : "SERVICE_UNAVAILABLE",
    );
  } finally {
    clearTimeout(timeout);
  }
}
