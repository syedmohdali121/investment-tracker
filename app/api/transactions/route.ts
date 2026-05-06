import { NextResponse } from "next/server";
import { addTransaction, listTransactions } from "@/lib/transactions-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const investmentId = url.searchParams.get("investmentId") ?? undefined;
  const transactions = await listTransactions(
    investmentId ? { investmentId } : undefined,
  );
  return NextResponse.json({ transactions });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const tx = await addTransaction(body);
    return NextResponse.json({ transaction: tx }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid input";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
