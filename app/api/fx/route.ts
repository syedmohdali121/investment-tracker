import { NextResponse } from "next/server";
import { getFxUsdInr } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const usdInr = await getFxUsdInr();
  return NextResponse.json({ usdInr, asOf: new Date().toISOString() });
}
