import { closeCurrentPeriod } from '@/lib/accounts';

export const dynamic = 'force-dynamic';

/** POST /api/account/close -> close the current open period and start the next one. */
export async function POST() {
  try {
    const closed = await closeCurrentPeriod();
    return Response.json({ ok: true, closed });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
