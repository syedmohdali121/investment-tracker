import { NextResponse } from "next/server";
import { getIntraday } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbolsParam = url.searchParams.get("symbols") ?? "";
  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (symbols.length === 0) return NextResponse.json({ series: [] });
  const series = await Promise.all(symbols.map((s) => getIntraday(s)));
  return NextResponse.json({ series, asOf: new Date().toISOString() });
}
