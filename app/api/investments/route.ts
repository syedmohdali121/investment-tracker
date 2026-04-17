import { NextResponse } from "next/server";
import { addInvestment, listInvestments } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const investments = await listInvestments();
  return NextResponse.json({ investments });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const inv = await addInvestment(body);
    return NextResponse.json({ investment: inv }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid input";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
