import { listPending, queueRows } from '@/lib/shipping';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pending/summary -> the whole Ready-to-Ship queue with computed
 * free/after/short stock per row (same allocation the /ship page and print
 * sheet use). Built for the Telegram bot's /ship and /make commands, so
 * that FIFO stock math stays computed here once, not duplicated elsewhere.
 */
export async function GET() {
  try {
    const pending = await listPending();
    const rows = queueRows(pending);
    const units = rows.reduce((a, r) => a + r.qty, 0);
    const shortRows = rows.filter((r) => r.short);
    return Response.json({ count: rows.length, units, shortCount: shortRows.length, rows });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
