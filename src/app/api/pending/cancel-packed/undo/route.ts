import { undoPackedCancel, EntryRuleError } from '@/lib/register';

export const dynamic = 'force-dynamic';

/**
 * POST /api/pending/cancel-packed/undo { requestId }
 *
 * The order-alert app's Undo for a parcel marked cancelled by mistake: puts
 * back exactly what that request changed (see undoPackedCancel). A stock rule
 * refusing it (the marketplace has cancelled the order too, the units were
 * used since) is 409 with the reason — retrying won't change it.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const requestId = typeof body?.requestId === 'string' ? body.requestId.trim().slice(0, 200) : '';
  if (!requestId) return Response.json({ error: 'requestId is required' }, { status: 400 });

  try {
    return Response.json({ ok: true, ...(await undoPackedCancel(requestId)) });
  } catch (err) {
    if (err instanceof EntryRuleError) return Response.json({ error: err.message }, { status: 409 });
    console.error('cancel-packed undo failed:', err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
