import { NextResponse } from "next/server";
import { searchSymbols } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const regionParam = url.searchParams.get("region");
  const region =
    regionParam === "US" || regionParam === "IN" ? regionParam : undefined;
  if (q.length < 1) return NextResponse.json({ results: [] });
  try {
    const results = await searchSymbols(q, region, 10);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { results: [], error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
