import { NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:8010";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  try {
    const res = await fetch(
      `${BACKEND}/verification/registry/${encodeURIComponent(symbol)}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      }
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { available: false, error: "Backend unavailable" },
      { status: 503 }
    );
  }
}
