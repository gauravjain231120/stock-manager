import mongoose from 'mongoose';
import { cookies } from 'next/headers';
import { connectDB } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Cloud backups older than this many days are pruned after each run. */
const KEEP_DAYS = 30;

/**
 * Allowed callers: Vercel Cron (Bearer CRON_SECRET), a logged-in Owner
 * hitting /api/backup in the browser, the legacy shared-secret cookie (kept
 * for the sister order-alert bot's old integration, if it's ever pointed at
 * this route directly), or local dev with no secret configured. Never open
 * in production — the dump contains the whole database.
 *
 * This route sits in proxy.ts's PUBLIC_PATHS (it guards itself), so a real
 * per-account session cookie is never a random string matching AUTH_TOKEN —
 * it has to be looked up here explicitly. Restricted to Owner, same as any
 * other full-database operation.
 */
async function authorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true;
  const cookie = (await cookies()).get('auth')?.value;
  if (cookie === (process.env.AUTH_TOKEN ?? 'rangrooh-stock-authed-9c4458')) return true;
  const session = await getCurrentSession();
  if (session?.role === 'OWNER') return true;
  return !secret && process.env.NODE_ENV !== 'production';
}

/** GET /api/backup -> dump every collection to one JSON file in Vercel Blob. */
export async function GET(req: Request) {
  if (!(await authorized(req))) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();
  const db = mongoose.connection.db;
  if (!db) return Response.json({ error: 'No database connection' }, { status: 500 });

  const collections = (await db.listCollections().toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.'))
    .sort();

  const out: Record<string, unknown> = {
    _meta: { database: db.databaseName, takenAt: new Date().toISOString(), collections },
  };
  let documents = 0;
  for (const name of collections) {
    const docs = await db.collection(name).find({}).toArray();
    out[name] = docs;
    documents += docs.length;
  }
  const body = JSON.stringify(out);
  const stamp = new Date().toISOString().slice(0, 10);

  // Production: Vercel Blob (random suffix keeps the URL unguessable).
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put, list, del } = await import('@vercel/blob');
    const blob = await put(`db-backups/db-backup-${stamp}.json`, body, {
      access: 'public',
      addRandomSuffix: true,
      contentType: 'application/json',
    });

    const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
    const { blobs } = await list({ prefix: 'db-backups/' });
    const stale = blobs.filter((b) => new Date(b.uploadedAt).getTime() < cutoff).map((b) => b.url);
    if (stale.length > 0) await del(stale);

    return Response.json({ ok: true, documents, collections: collections.length, url: blob.url, pruned: stale.length });
  }

  // Dev: local backups/ folder, same format as the manual dumps.
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const dir = join(process.cwd(), 'backups');
  await mkdir(dir, { recursive: true });
  const path = join(dir, `db-backup-${stamp}.json`);
  await writeFile(path, body);
  return Response.json({ ok: true, documents, collections: collections.length, path });
}
