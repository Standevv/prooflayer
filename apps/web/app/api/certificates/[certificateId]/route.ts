import { isCertificateId, type CertificateApiError, type CertificateExplorerRecord } from "@/lib/certificates";

export const runtime = "nodejs";

const REQUEST_TIMEOUT_MS = 90_000;
const DEFAULT_API_URL = "http://127.0.0.1:8010";

function errorResponse(error: string, status: number) {
  return Response.json({ available: false, error } satisfies CertificateApiError, { status });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ certificateId: string }> },
) {
  const { certificateId } = await params;
  const normalized = certificateId.trim().toLowerCase();
  if (!isCertificateId(normalized)) {
    return errorResponse(
      "Certificate ID must be a 0x-prefixed 32-byte value (64 hexadecimal characters).",
      400,
    );
  }

  const baseUrl = (
    process.env.PROOFLAYER_API_URL ||
    process.env.PROOFLAYER_AGENT_API_URL ||
    DEFAULT_API_URL
  ).replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${baseUrl}/certificates/${encodeURIComponent(normalized)}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = (await upstream.json()) as CertificateExplorerRecord | CertificateApiError;
    return Response.json(payload, { status: upstream.status });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return errorResponse(
      timedOut
        ? "Certificate lookup timed out."
        : "ProofLayer certificate service unavailable. Start the local Python API.",
      timedOut ? 504 : 503,
    );
  } finally {
    clearTimeout(timeout);
  }
}
