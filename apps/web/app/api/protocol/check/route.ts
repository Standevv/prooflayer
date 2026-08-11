import type { ProtocolErrorResponse } from "@/lib/protocol";

export const runtime = "nodejs";

const REQUEST_TIMEOUT_MS = 45_000;
const DEFAULT_API_URL = "http://127.0.0.1:8010";
const PROTOCOLS = new Set(["lending", "rwa_vault", "treasury_management"]);
const ASSETS = new Set(["USDY", "PAXG"]);
const CLAIMS = new Set(["TreasuryBacking", "GoldBacking"]);
const ACTIONS = new Set([
  "accept_as_collateral",
  "admit_to_vault",
  "approve_for_treasury_allocation",
]);

function errorResponse(error: string, status: number) {
  return Response.json({ available: false, error }, { status });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("Request body must be valid JSON.", 400);
  }

  if (typeof payload !== "object" || payload === null) {
    return errorResponse("Protocol check request must be an object.", 400);
  }
  const values = payload as Record<string, unknown>;
  const protocolType = values.protocol_type;
  const asset = values.asset;
  const claim = values.claim;
  const action = values.action;
  if (
    typeof protocolType !== "string" ||
    typeof asset !== "string" ||
    typeof claim !== "string" ||
    typeof action !== "string" ||
    !PROTOCOLS.has(protocolType) ||
    !ASSETS.has(asset) ||
    !CLAIMS.has(claim) ||
    !ACTIONS.has(action)
  ) {
    return errorResponse("Protocol type, asset, claim, or action is unsupported.", 400);
  }

  const baseUrl = (
    process.env.PROOFLAYER_API_URL ||
    process.env.PROOFLAYER_AGENT_API_URL ||
    DEFAULT_API_URL
  ).replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${baseUrl}/protocol/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        protocol_type: protocolType,
        asset,
        claim,
        action,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    const responsePayload = (await upstream.json()) as ProtocolErrorResponse | object;
    return Response.json(responsePayload, { status: upstream.status });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return errorResponse(
      timedOut
        ? "Protocol policy check timed out."
        : "ProofLayer verification service unavailable. Start the local Python API.",
      timedOut ? 504 : 503,
    );
  } finally {
    clearTimeout(timeout);
  }
}
