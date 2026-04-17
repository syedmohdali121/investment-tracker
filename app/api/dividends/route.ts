import { NextResponse } from "next/server";
import { getDividends } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbolsParam = url.searchParams.get("symbols") ?? "";
  const yearsParam = Number(url.searchParams.get("years") ?? "5");
  const years =
    Number.isFinite(yearsParam) && yearsParam > 0 && yearsParam <= 20
      ? yearsParam
      : 5;
  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (symbols.length === 0) return NextResponse.json({ series: [] });
  const series = await Promise.all(symbols.map((s) => getDividends(s, years)));
  return NextResponse.json({ series, years, asOf: new Date().toISOString() });
}
