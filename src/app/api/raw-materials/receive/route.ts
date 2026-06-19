import { z } from 'zod';
import { receiveRawMaterial } from '@/lib/production';

export const dynamic = 'force-dynamic';

const Receive = z.object({
  materialCode: z.string().min(1),
  qty: z.number().positive(),
  note: z.string().optional(),
  refId: z.string().optional(),
});

/** POST /api/raw-materials/receive -> record a supplier delivery (+stock). */
export async function POST(request: Request) {
  const parsed = Receive.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 400 });
  }
  try {
    await receiveRawMaterial(parsed.data);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
