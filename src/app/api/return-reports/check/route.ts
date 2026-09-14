import { z } from 'zod';
import { checkTrackingIds } from '@/lib/returnReports';

export const dynamic = 'force-dynamic';

const Body = z.object({
  trackingIds: z.array(z.string()).min(1).max(5000),
});

/**
 * POST /api/return-reports/check -> one-off comparison against logged returns.
 * Read-only: nothing here is saved. For "I have a file, just tell me what's
 * missing" — the saved-reports workflow (POST /api/return-reports) is for
 * when you actually want the list kept and tracked over time.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  const lines = await checkTrackingIds(parsed.data.trackingIds);
  return Response.json({ lines });
}
