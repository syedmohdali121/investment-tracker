import { NextResponse } from "next/server";
import { getAssetProfile } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbolsParam = url.searchParams.get("symbols") ?? "";
  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (symbols.length === 0)
    return NextResponse.json({ profiles: [], asOf: new Date().toISOString() });
  const profiles = await Promise.all(symbols.map((s) => getAssetProfile(s)));
  return NextResponse.json({ profiles, asOf: new Date().toISOString() });
}
