import { z } from 'zod';
import { gradeReturn } from '@/lib/returns';

export const dynamic = 'force-dynamic';

const Body = z.object({
  returnId: z.string().min(1),
  grade: z.enum(['SELLABLE', 'DAMAGED']),
});

/** POST /api/returns/grade -> grade a return SELLABLE (back to MAIN) or DAMAGED. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const rec = await gradeReturn(parsed.data.returnId, parsed.data.grade);
    return Response.json({ ok: true, return: rec });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
