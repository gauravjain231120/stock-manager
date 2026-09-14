import { z } from 'zod';
import { updateEntry, deleteEntry } from '@/lib/accounts';

export const dynamic = 'force-dynamic';

const Patch = z.object({
  type: z.enum(['EXPENSE', 'RECEIVED']).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  date: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
});

/** PATCH /api/account/entries/[id] -> edit an entry's type/name/date/amount. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  await updateEntry(id, parsed.data);
  return Response.json({ ok: true });
}

/** DELETE /api/account/entries/[id] -> remove an entry. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await deleteEntry(id);
  return Response.json({ ok: true });
}
