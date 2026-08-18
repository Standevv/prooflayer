export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_AGENT_API_URL = "http://127.0.0.1:8010";

const ASSETS = new Set(["USDY", "PAXG"]);
const ACTIONS = new Set(["swap", "withdraw"]);

function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("Request body must be valid JSON.", 400);
  }

  if (typeof payload !== "object" || payload === null) {
    return errorResponse("A supported asset and action are required.", 400);
  }
  const requestPayload = payload as Record<string, unknown>;
  const asset = typeof requestPayload.asset === "string" ? requestPayload.asset : "";
  const action = typeof requestPayload.action === "string" ? requestPayload.action : "swap";
  if (!ASSETS.has(asset)) {
    return errorResponse("A supported asset is required (USDY or PAXG).", 400);
  }
  if (!ACTIONS.has(action)) {
    return errorResponse("A supported action is required (swap or withdraw).", 400);
  }

  const baseUrl = (
    process.env.PROOFLAYER_AGENT_API_URL || DEFAULT_AGENT_API_URL
  ).replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${baseUrl}/markets/eligibility`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset, action }),
      cache: "no-store",
      signal: controller.signal,
    });
    const responsePayload = (await upstream.json()) as object;
    return Response.json(responsePayload, { status: upstream.status });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return errorResponse(
      timedOut
        ? "Market eligibility check timed out without producing a result."
        : "Market eligibility service unavailable.",
      timedOut ? 504 : 503,
    );
  } finally {
    clearTimeout(timeout);
  }
}
