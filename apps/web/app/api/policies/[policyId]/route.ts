import type { PolicyApiError, PolicyDetail } from "@/lib/policies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DEFAULT_API_URL = "http://127.0.0.1:8010";
const POLICY_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;

export async function GET(_request: Request, { params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = await params;
  if (!POLICY_ID.test(policyId)) return Response.json({ available: false, error: "Invalid policy identifier." } satisfies PolicyApiError, { status: 400 });
  const base = (process.env.PROOFLAYER_API_URL || process.env.PROOFLAYER_AGENT_API_URL || DEFAULT_API_URL).replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const upstream = await fetch(`${base}/policies/${policyId}`, { cache: "no-store", signal: controller.signal });
    const payload = (await upstream.json()) as PolicyDetail | PolicyApiError;
    return Response.json(payload, { status: upstream.status });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return Response.json({ available: false, error: timedOut ? "Policy detail timed out." : "ProofLayer policy service unavailable. Start the local Python API." } satisfies PolicyApiError, { status: timedOut ? 504 : 503 });
  } finally { clearTimeout(timeout); }
}
