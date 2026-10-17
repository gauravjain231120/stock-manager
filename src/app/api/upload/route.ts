import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { connectDB } from '@/lib/db';
import { UploadedImageModel } from '@/models/UploadedImage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/upload (multipart form-data, field "file") -> { url }.
 *
 * 1. Production with Vercel Blob configured: uploads to Vercel Blob.
 * 2. If Vercel Blob is not configured, or if running in serverless environment,
 *    or on upload failure: persistently stores the image in MongoDB.
 * 3. Local dev fallback: stores in public/uploads if writable, else MongoDB.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return Response.json({ error: 'Only image files are allowed' }, { status: 400 });
    }

    const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]+/g, '-')}`;

    // 1. Try Vercel Blob if token is set
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const { put } = await import('@vercel/blob');
        const blob = await put(`products/${safeName}`, file, { access: 'public' });
        return Response.json({ url: blob.url });
      } catch (blobErr: any) {
        console.warn('Vercel Blob upload failed, falling back to database storage:', blobErr?.message);
      }
    }

    // 2. Dev fallback to public/uploads if filesystem is writable
    if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
      try {
        const bytes = Buffer.from(await file.arrayBuffer());
        const dir = join(process.cwd(), 'public', 'uploads');
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, safeName), bytes);
        return Response.json({ url: `/uploads/${safeName}` });
      } catch (fsErr: any) {
        console.warn('Local filesystem write failed, falling back to database storage:', fsErr?.message);
      }
    }

    // 3. Fallback: Save directly to MongoDB
    await connectDB();
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const doc = await UploadedImageModel.create({
      filename: file.name || safeName,
      contentType: file.type || 'image/jpeg',
      data: buffer,
      size: buffer.length,
    });

    return Response.json({ url: `/api/images/${doc._id}` });
  } catch (err: any) {
    console.error('Upload error:', err);
    return Response.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
