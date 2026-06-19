import { ingestAllReturns } from '@/lib/returns';

export const dynamic = 'force-dynamic';

/** POST /api/returns/ingest -> pull returns from all channels into QUARANTINE. */
export async function POST() {
  const results = await ingestAllReturns();
  return Response.json({ ok: true, results });
}
