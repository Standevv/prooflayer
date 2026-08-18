import type { AgentErrorResponse, DemoScenario } from "@/lib/agent";

export const runtime = "nodejs";

const REQUEST_TIMEOUT_MS = 45_000;
const DEFAULT_AGENT_API_URL = "http://127.0.0.1:8010";
const SCENARIOS = new Set<DemoScenario>([
  "usdy_treasury_verification",
  "paxg_gold_verification",
  "usdy_certificate_eligibility",
  "provenance_inspection",
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

  if (typeof payload !== "object" || payload === null || !("scenario" in payload)) {
    return errorResponse("A supported deterministic workflow is required.", 400);
  }
  const requestPayload = payload as Record<string, unknown>;
  const scenario =
    typeof requestPayload.scenario === "string" ? requestPayload.scenario : "";
  if (!SCENARIOS.has(scenario as DemoScenario)) {
    return errorResponse("A supported deterministic workflow is required.", 400);
  }

  const body: Record<string, string> = { scenario };
  for (const field of ["asset", "claim"] as const) {
    const value = requestPayload[field];
    if (typeof value === "string") {
      body[field] = value.trim();
    }
  }
  if (
    scenario === "provenance_inspection" &&
    (body.asset?.length === 0 || body.claim?.length === 0 || !body.asset || !body.claim)
  ) {
    return errorResponse("Provenance inspection requires an asset and claim.", 400);
  }

  const baseUrl = (
    process.env.PROOFLAYER_AGENT_API_URL || DEFAULT_AGENT_API_URL
  ).replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${baseUrl}/demo/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    const responsePayload = (await upstream.json()) as AgentErrorResponse | object;
    return Response.json(responsePayload, { status: upstream.status });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return errorResponse(
      timedOut
        ? "Deterministic workflow timed out without producing a result."
        : "Verification service unavailable. Start the local Python API.",
      timedOut ? 504 : 503,
    );
  } finally {
    clearTimeout(timeout);
  }
}
