import { z } from 'zod';
import { getOpenPeriodWithEntries, listClosedPeriods, addEntry } from '@/lib/accounts';

export const dynamic = 'force-dynamic';

/** GET /api/account -> the open period (with entries + totals) and every closed period's summary. */
export async function GET() {
  const [open, closed] = await Promise.all([getOpenPeriodWithEntries(), listClosedPeriods()]);
  return Response.json({ open, closed });
}

const AddEntry = z.object({
  type: z.enum(['EXPENSE', 'RECEIVED']),
  name: z.string().trim().min(1).max(200),
  date: z.string().min(1),
  amount: z.number().positive(),
});

/** POST /api/account -> add an entry to the current open period. */
export async function POST(req: Request) {
  const parsed = AddEntry.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  const entry = await addEntry(parsed.data);
  return Response.json({ entry });
}
