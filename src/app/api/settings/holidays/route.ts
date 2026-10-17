import { NextRequest, NextResponse } from "next/server";
import { getMyntraHolidays, setMyntraHolidays, toggleMyntraHoliday, recalcPendingMyntraShipBy } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const holidays = await getMyntraHolidays();
    return NextResponse.json({ holidays });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    let holidays: string[];

    if (body.toggle && typeof body.toggle === "string") {
      // Toggle a single date
      holidays = await toggleMyntraHoliday(body.toggle);
    } else if (Array.isArray(body.holidays)) {
      // Set the full list
      holidays = await setMyntraHolidays(body.holidays);
    } else {
      return NextResponse.json({ error: "Provide { toggle: 'YYYY-MM-DD' } or { holidays: [...] }" }, { status: 400 });
    }

    // Recalculate pending Myntra shipBy dates with new holidays
    await recalcPendingMyntraShipBy();

    return NextResponse.json({ ok: true, holidays });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
