import { reconcileReservedStock } from '@/lib/shipping';

export const dynamic = 'force-dynamic';

/** POST /api/stock/reconcile -> fix any SKU whose reserved count drifted from the actual queue. */
export async function POST() {
  try {
    const res = await reconcileReservedStock();
    return Response.json({ ok: true, ...res });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
