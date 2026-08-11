import type { DeveloperApiError } from "@/lib/developers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_API_URL = "http://127.0.0.1:8010";

export async function GET() {
  const baseUrl = (
    process.env.PROOFLAYER_API_URL ||
    process.env.PROOFLAYER_AGENT_API_URL ||
    DEFAULT_API_URL
  ).replace(/\/$/, "");
  try {
    const upstream = await fetch(`${baseUrl}/openapi.json`, { cache: "no-store" });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return Response.json(
      {
        available: false,
        error: "FastAPI OpenAPI document unavailable. Start the local Python API.",
      } satisfies DeveloperApiError,
      { status: 503 },
    );
  }
}
