import { shipAllPending } from '@/lib/shipping';

export const dynamic = 'force-dynamic';

/** POST /api/pending/ship-all -> pack & ship everything in the queue. */
export async function POST() {
  try {
    const res = await shipAllPending();
    return Response.json({ ok: true, ...res });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
