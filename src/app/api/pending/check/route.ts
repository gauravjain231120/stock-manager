import { findOrderIdUses } from '@/lib/shipping';

export const dynamic = 'force-dynamic';

/** GET /api/pending/check?orderId=… -> where that order number is already used. */
export async function GET(req: Request) {
  const orderId = new URL(req.url).searchParams.get('orderId') ?? '';
  try {
    return Response.json({ uses: await findOrderIdUses(orderId) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
