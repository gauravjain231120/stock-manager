import { connectDB } from '@/lib/db';

// Always run at request time (never prerender a DB ping).
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const conn = await connectDB();
    const admin = conn.connection.db?.admin();
    await admin?.ping();
    // Expose which database we're actually connected to, to diagnose env mismatches.
    const dbName = conn.connection.name;
    const products = await conn.connection.db?.collection('products').countDocuments();
    return Response.json({ ok: true, db: 'connected', dbName, products });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}
