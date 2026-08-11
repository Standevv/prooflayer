import type { DeveloperApiError, DeveloperPlatformStatus } from "@/lib/developers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_API_URL = "http://127.0.0.1:8010";

export async function GET() {
  const baseUrl = (
    process.env.PROOFLAYER_API_URL ||
    process.env.PROOFLAYER_AGENT_API_URL ||
    DEFAULT_API_URL
  ).replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${baseUrl}/developer/status`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = (await upstream.json()) as DeveloperPlatformStatus | DeveloperApiError;
    return Response.json(payload, { status: upstream.status });
  } catch {
    return Response.json(
      {
        available: false,
        error: "ProofLayer developer status unavailable. Start the local Python API.",
      } satisfies DeveloperApiError,
      { status: 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
