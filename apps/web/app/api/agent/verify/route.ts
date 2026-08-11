import type { AgentErrorResponse } from "@/lib/agent";

export const runtime = "nodejs";

const REQUEST_TIMEOUT_MS = 250_000;
const DEFAULT_AGENT_API_URL = "http://127.0.0.1:8010";

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

  const query =
    typeof payload === "object" &&
    payload !== null &&
    "query" in payload &&
    typeof payload.query === "string"
      ? payload.query.trim()
      : "";
  if (query.length < 3 || query.length > 2_000) {
    return errorResponse("Query must be between 3 and 2,000 characters.", 400);
  }

  const baseUrl = (
    process.env.PROOFLAYER_AGENT_API_URL || DEFAULT_AGENT_API_URL
  ).replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${baseUrl}/agent/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      cache: "no-store",
      signal: controller.signal,
    });
    const responsePayload = (await upstream.json()) as AgentErrorResponse | object;
    return Response.json(responsePayload, { status: upstream.status });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "AI Agent request timed out without producing a result."
        : "AI Agent service unavailable. Start the local Python agent API and verify its environment.";
    return errorResponse(message, error instanceof Error && error.name === "AbortError" ? 504 : 503);
  } finally {
    clearTimeout(timeout);
  }
}
