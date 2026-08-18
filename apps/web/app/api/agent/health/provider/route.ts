import type { AgentErrorResponse } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live provider probe — expensive, cached server-side for 120s.
const REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_AGENT_API_URL = "http://127.0.0.1:8010";

export async function GET() {
  const baseUrl = (
    process.env.PROOFLAYER_AGENT_API_URL || DEFAULT_AGENT_API_URL
  ).replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${baseUrl}/health/provider`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = (await upstream.json()) as AgentErrorResponse | object;
    return Response.json(payload, { status: upstream.status });
  } catch {
    return Response.json(
      {
        provider_status: "UNKNOWN",
        provider_error: "BACKEND_UNREACHABLE",
      },
      { status: 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
