import { shipSelectedPending } from '@/lib/shipping';

export const dynamic = 'force-dynamic';

/** POST /api/pending/ship-selected { ids: [...] } -> pack & ship the chosen queue entries. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as { ids?: unknown }));
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x: unknown): x is string => typeof x === 'string') : [];
  if (ids.length === 0) return Response.json({ error: 'No items selected' }, { status: 400 });
  try {
    const res = await shipSelectedPending(ids);
    return Response.json({ ok: true, ...res });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
