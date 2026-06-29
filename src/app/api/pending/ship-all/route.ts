import { shipAllPending } from '@/lib/shipping';

export const dynamic = 'force-dynamic';

/** POST /api/pending/ship-all -> pack & ship the queue (optionally one platform). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as { channel?: string }));
  const channel = typeof body?.channel === 'string' ? body.channel : undefined;
  try {
    const res = await shipAllPending(channel);
    return Response.json({ ok: true, ...res });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
