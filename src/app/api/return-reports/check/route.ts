import { z } from 'zod';
import { checkTrackingIds, findExtraReturnsForDay } from '@/lib/returnReports';

export const dynamic = 'force-dynamic';

const Body = z.object({
  trackingIds: z.array(z.string()).min(1).max(5000),
  // The file's own date (YYYY-MM-DD), if one could be read from its filename.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * POST /api/return-reports/check -> one-off, two-way comparison against logged
 * returns. Read-only: nothing here is saved. For "I have a file, just tell me
 * what's missing" — the saved-reports workflow (POST /api/return-reports) is
 * for when you actually want the list kept and tracked over time.
 *
 *   missing -> in the file, not found among your logged returns (any date)
 *   extra   -> logged as returned on the file's OWN day, but not in the file
 *              at all (only computed when a date was given)
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  const { trackingIds, date } = parsed.data;
  const [missing, extra] = await Promise.all([
    checkTrackingIds(trackingIds),
    date ? findExtraReturnsForDay(date, trackingIds) : Promise.resolve([]),
  ]);
  return Response.json({ lines: missing, extra });
}
