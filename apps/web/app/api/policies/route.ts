import type { InstitutionalPolicy, InstitutionalPolicyDraft, PolicyApiError, PolicyStudioOverview } from "@/lib/policies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_API_URL = "http://127.0.0.1:8010";
const baseUrl = () => (process.env.PROOFLAYER_API_URL || process.env.PROOFLAYER_AGENT_API_URL || DEFAULT_API_URL).replace(/\/$/, "");

function unavailable(message: string, status: number) {
  return Response.json({ available: false, error: message } satisfies PolicyApiError, { status });
}

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const upstream = await fetch(`${baseUrl()}/policies`, { cache: "no-store", signal: controller.signal });
    const payload = (await upstream.json()) as PolicyStudioOverview | PolicyApiError;
    return Response.json(payload, { status: upstream.status });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return unavailable(timedOut ? "Policy Studio timed out." : "ProofLayer policy service unavailable. Start the local Python API.", timedOut ? 504 : 503);
  } finally { clearTimeout(timeout); }
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 16_384) return unavailable("Policy request is too large.", 413);
  let body: InstitutionalPolicyDraft;
  try { body = (await request.json()) as InstitutionalPolicyDraft; }
  catch { return unavailable("A valid JSON policy configuration is required.", 400); }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const upstream = await fetch(`${baseUrl()}/policies`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: controller.signal });
    const payload = (await upstream.json()) as InstitutionalPolicy | PolicyApiError;
    return Response.json(payload, { status: upstream.status });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return unavailable(timedOut ? "Policy save timed out." : "ProofLayer policy service unavailable. Start the local Python API.", timedOut ? 504 : 503);
  } finally { clearTimeout(timeout); }
}
