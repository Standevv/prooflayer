import type { EvidenceApiError, EvidenceAssetDetail } from "@/lib/evidence";

export const runtime = "nodejs";

const REQUEST_TIMEOUT_MS = 45_000;
const DEFAULT_API_URL = "http://127.0.0.1:8010";
const SUPPORTED_ASSETS = new Set(["usdy", "paxg"]);

function errorResponse(error: string, status: number) {
  return Response.json({ available: false, error } satisfies EvidenceApiError, { status });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset } = await params;
  const normalized = asset.trim().toLowerCase();
  if (!SUPPORTED_ASSETS.has(normalized)) {
    return errorResponse("Unsupported evidence asset; supported assets are USDY and PAXG.", 400);
  }

  const baseUrl = (
    process.env.PROOFLAYER_API_URL ||
    process.env.PROOFLAYER_AGENT_API_URL ||
    DEFAULT_API_URL
  ).replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${baseUrl}/evidence/${normalized}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = (await upstream.json()) as EvidenceAssetDetail | EvidenceApiError;
    return Response.json(payload, { status: upstream.status });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return errorResponse(
      timedOut
        ? "Evidence Explorer timed out."
        : "ProofLayer evidence service unavailable. Start the local Python API.",
      timedOut ? 504 : 503,
    );
  } finally {
    clearTimeout(timeout);
  }
}
