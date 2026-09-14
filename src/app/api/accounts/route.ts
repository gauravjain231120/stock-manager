import { z } from 'zod';
import { listAccounts, createAccount } from '@/lib/team';
import { ROLES } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/** GET /api/accounts -> every account. Owner-only — middleware already enforces this. */
export async function GET() {
  const accounts = await listAccounts();
  return Response.json({ accounts });
}

const CreateAccount = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(6),
  role: z.enum(ROLES),
  allowedSections: z.array(z.string()).optional(),
});

/** POST /api/accounts -> create a Manager, Viewer, or another Owner account. */
export async function POST(req: Request) {
  const parsed = CreateAccount.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const account = await createAccount(parsed.data);
    return Response.json({ account });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
