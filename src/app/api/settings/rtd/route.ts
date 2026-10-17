import { NextRequest, NextResponse } from "next/server";
import { getMyntraRtdCutoff, setMyntraRtdCutoff } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cutoff = await getMyntraRtdCutoff();
    return NextResponse.json({ cutoff });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const cutoff = body.cutoff || body.cutoffTime;
    if (!cutoff || typeof cutoff !== "string" || !/^\d{1,2}:\d{2}$/.test(cutoff)) {
      return NextResponse.json({ error: "Valid time (HH:MM) required" }, { status: 400 });
    }
    const saved = await setMyntraRtdCutoff(cutoff);
    return NextResponse.json({ ok: true, cutoff: saved });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
