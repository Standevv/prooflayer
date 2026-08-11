import type { CertificateApiError, CertificateExplorerRecord } from "@/lib/certificates";

export const runtime = "nodejs";

const REQUEST_TIMEOUT_MS = 45_000;
const DEFAULT_API_URL = "http://127.0.0.1:8010";

function upstreamUrl(path: string): string {
  const baseUrl = (
    process.env.PROOFLAYER_API_URL ||
    process.env.PROOFLAYER_AGENT_API_URL ||
    DEFAULT_API_URL
  ).replace(/\/$/, "");
  return `${baseUrl}${path}`;
}

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const upstream = await fetch(upstreamUrl("/certificates"), {
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = (await upstream.json()) as CertificateExplorerRecord[] | CertificateApiError;
    return Response.json(payload, { status: upstream.status });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return Response.json(
      {
        available: false,
        error: timedOut
          ? "Certificate lookup timed out."
          : "ProofLayer certificate service unavailable. Start the local Python API.",
      } satisfies CertificateApiError,
      { status: timedOut ? 504 : 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
