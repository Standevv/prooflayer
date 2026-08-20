export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:8010";
const TIMEOUT = 60_000;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    const res = await fetch(`${BACKEND}/markets/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { available: false, error: "Backend unavailable" },
      { status: 502 },
    );
  }
}
