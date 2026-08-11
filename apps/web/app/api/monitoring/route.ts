import type { MonitoringApiError, MonitoringOverview } from "@/lib/monitoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_API_URL = "http://127.0.0.1:8010";

function apiUrl(path: string): string {
  const base = (process.env.PROOFLAYER_API_URL || process.env.PROOFLAYER_AGENT_API_URL || DEFAULT_API_URL).replace(/\/$/, "");
  return `${base}${path}`;
}

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const upstream = await fetch(apiUrl("/monitoring"), { cache: "no-store", signal: controller.signal });
    const payload = (await upstream.json()) as MonitoringOverview | MonitoringApiError;
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
