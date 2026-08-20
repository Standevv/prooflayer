export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:8010";
const TIMEOUT = 15_000;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return Response.json(
      { available: false, error: "Invalid address format" },
      { status: 400 },
    );
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    const res = await fetch(`${BACKEND}/markets/trust/${address}`, {
      method: "GET",
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
