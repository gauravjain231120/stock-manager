import { z } from 'zod';
import { updateAccount, deleteAccount } from '@/lib/team';
import { getCurrentSession } from '@/lib/auth';
import { ROLES } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const Patch = z.object({
  username: z.string().trim().min(1).optional(),
  role: z.enum(ROLES).optional(),
  allowedSections: z.array(z.string()).optional(),
  password: z.string().min(6).optional(),
});

/** PATCH /api/accounts/[id] -> change username, role, Viewer permissions, and/or reset the password. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const session = await getCurrentSession();
    await updateAccount(id, parsed.data, session?.accountId);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

/** DELETE /api/accounts/[id] -> remove an account. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getCurrentSession();
  if (session?.accountId === id) {
    return Response.json({ error: "You can't delete the account you're currently logged in as" }, { status: 400 });
  }
  try {
    await deleteAccount(id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
