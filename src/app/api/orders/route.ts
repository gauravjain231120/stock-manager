import { listOrders } from '@/lib/orders';

export const dynamic = 'force-dynamic';

/** GET /api/orders -> recent marketplace orders. */
export async function GET() {
  const orders = await listOrders(100);
  return Response.json({ orders });
}
