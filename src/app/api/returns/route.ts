import { listReturns } from '@/lib/returns';

export const dynamic = 'force-dynamic';

/** GET /api/returns?status=RECEIVED|GRADED -> returns list. */
export async function GET(request: Request) {
  const status = new URL(request.url).searchParams.get('status');
  const valid = status === 'RECEIVED' || status === 'GRADED' ? status : undefined;
  const returns = await listReturns(valid);
  return Response.json({ returns });
}
