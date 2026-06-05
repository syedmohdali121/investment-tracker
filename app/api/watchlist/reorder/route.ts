import { NextResponse } from "next/server";
import { z } from "zod";
import { reorderWatchlist } from "@/lib/watchlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ ids: z.array(z.string()).min(1) });

export async function PUT(req: Request) {
  try {
    const json = await req.json();
    const { ids } = BodySchema.parse(json);
    const ok = await reorderWatchlist(ids);
    if (!ok)
      return NextResponse.json(
        { error: "ids do not match stored watchlist" },
        { status: 400 },
      );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid input";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
