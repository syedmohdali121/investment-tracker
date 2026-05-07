import { NextResponse } from "next/server";
import { getHistory, type HistoryRange } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID: HistoryRange[] = ["1d", "5d", "1m", "1y", "3y", "5y"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbolsParam = url.searchParams.get("symbols") ?? "";
  const rangeParam = (url.searchParams.get("range") ?? "1y") as HistoryRange;
  const range = (VALID as string[]).includes(rangeParam) ? rangeParam : "1y";
  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (symbols.length === 0) return NextResponse.json({ series: [] });
  const series = await Promise.all(symbols.map((s) => getHistory(s, range)));
  return NextResponse.json({ series, range, asOf: new Date().toISOString() });
}
