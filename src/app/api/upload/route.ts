import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/upload (multipart form-data, field "file") -> { url }.
 *
 * Production (Vercel): uploads to Vercel Blob if BLOB_READ_WRITE_TOKEN is set.
 * Local dev: writes to public/uploads and returns a /uploads/... path.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) {
    return Response.json({ error: 'No file provided' }, { status: 400 });
  }
  if (!file.type.startsWith('image/')) {
    return Response.json({ error: 'Only image files are allowed' }, { status: 400 });
  }

  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]+/g, '-')}`;

  // Production: Vercel Blob
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    const blob = await put(`products/${safeName}`, file, { access: 'public' });
    return Response.json({ url: blob.url });
  }

  // Dev: local disk under public/uploads
  const bytes = Buffer.from(await file.arrayBuffer());
  const dir = join(process.cwd(), 'public', 'uploads');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, safeName), bytes);
  return Response.json({ url: `/uploads/${safeName}` });
}
