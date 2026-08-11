import type { EvidenceApiError, EvidenceExplorerIndex } from "@/lib/evidence";

export const runtime = "nodejs";

const REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_API_URL = "http://127.0.0.1:8010";

function upstreamUrl(): string {
  return `${(
    process.env.PROOFLAYER_API_URL ||
    process.env.PROOFLAYER_AGENT_API_URL ||
    DEFAULT_API_URL
  ).replace(/\/$/, "")}/evidence`;
}

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const upstream = await fetch(upstreamUrl(), { cache: "no-store", signal: controller.signal });
    const payload = (await upstream.json()) as EvidenceExplorerIndex | EvidenceApiError;
    return Response.json(payload, { status: upstream.status });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return Response.json(
      {
        available: false,
        error: timedOut
          ? "Evidence Explorer timed out."
          : "ProofLayer evidence service unavailable. Start the local Python API.",
      } satisfies EvidenceApiError,
      { status: timedOut ? 504 : 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
