import { restoreEntry, EntrySnapshot } from '@/lib/register';

export const dynamic = 'force-dynamic';

/** POST /api/register/restore -> put a just-deleted Stock Log entry back (Undo). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.sku || typeof body?.qty !== 'number' || !body?.type || !body?.createdAt) {
    return Response.json({ error: 'Nothing to restore' }, { status: 400 });
  }
  try {
    return Response.json(await restoreEntry(body as EntrySnapshot));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
