import type { MonitoringApiError, MonitoringAssetDetail } from "@/lib/monitoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_API_URL = "http://127.0.0.1:8010";

export async function GET(_request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params;
  const normalized = asset.trim().toLowerCase();
  if (normalized !== "usdy" && normalized !== "paxg") {
    return Response.json({ available: false, error: "Supported monitoring assets are USDY and PAXG." } satisfies MonitoringApiError, { status: 400 });
  }
  const base = (process.env.PROOFLAYER_API_URL || process.env.PROOFLAYER_AGENT_API_URL || DEFAULT_API_URL).replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const upstream = await fetch(`${base}/monitoring/${normalized}`, { cache: "no-store", signal: controller.signal });
    const payload = (await upstream.json()) as MonitoringAssetDetail | MonitoringApiError;
    return Response.json(payload, { status: upstream.status });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return Response.json(
      { available: false, error: timedOut ? "Monitoring history timed out." : "ProofLayer monitoring service unavailable. Start the local Python API." } satisfies MonitoringApiError,
      { status: timedOut ? 504 : 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
