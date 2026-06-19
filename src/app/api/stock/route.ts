import { getInventoryOverview } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/** GET /api/stock — full inventory overview (summary + per-SKU rows). */
export async function GET() {
  const overview = await getInventoryOverview();
  return Response.json(overview);
}
