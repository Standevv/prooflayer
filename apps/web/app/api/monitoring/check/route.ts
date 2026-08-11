import type { MonitoringApiError, MonitoringCheckResult, MonitoredAsset, MonitoredClaim } from "@/lib/monitoring";

export const runtime = "nodejs";

const DEFAULT_API_URL = "http://127.0.0.1:8010";
const CLAIMS: Record<MonitoredAsset, MonitoredClaim> = { USDY: "TreasuryBacking", PAXG: "GoldBacking" };

function errorResponse(error: string, status: number) {
  return Response.json({ available: false, error } satisfies MonitoringApiError, { status });
}

export async function POST(request: Request) {
  let body: { asset?: unknown; claim?: unknown };
  try {
    body = (await request.json()) as { asset?: unknown; claim?: unknown };
  } catch {
    return errorResponse("A JSON monitoring request is required.", 400);
  }
  const asset = typeof body.asset === "string" ? body.asset.trim().toUpperCase() : "";
  if (asset !== "USDY" && asset !== "PAXG") return errorResponse("Supported monitoring assets are USDY and PAXG.", 400);
  if (body.claim !== CLAIMS[asset]) return errorResponse(`${asset} monitoring requires claim ${CLAIMS[asset]}.`, 400);

  const base = (process.env.PROOFLAYER_API_URL || process.env.PROOFLAYER_AGENT_API_URL || DEFAULT_API_URL).replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const upstream = await fetch(`${base}/monitoring/check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ asset, claim: body.claim }),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = (await upstream.json()) as MonitoringCheckResult | MonitoringApiError;
    return Response.json(payload, { status: upstream.status });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return errorResponse(timedOut ? "Read-only verification check timed out." : "ProofLayer monitoring service unavailable. Start the local Python API.", timedOut ? 504 : 503);
  } finally {
    clearTimeout(timeout);
  }
}
