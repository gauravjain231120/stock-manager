import { reportBundle } from '@/lib/reports';

export const dynamic = 'force-dynamic';

/** GET /api/reports?days=30 -> sales/returns/movers/damaged report bundle. */
export async function GET(request: Request) {
  const daysParam = new URL(request.url).searchParams.get('days');
  const days = Math.min(365, Math.max(1, Number(daysParam) || 30));
  const bundle = await reportBundle(days);
  return Response.json(bundle);
}
