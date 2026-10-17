import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { UploadedImageModel } from '@/models/UploadedImage';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return new NextResponse('Invalid image ID', { status: 400 });
  }

  try {
    await connectDB();
    const doc = await UploadedImageModel.findById(id).lean();
    if (!doc || !doc.data) {
      return new NextResponse('Image not found', { status: 404 });
    }

    const buffer = Buffer.isBuffer(doc.data)
      ? doc.data
      : Buffer.from((doc.data as any).buffer || doc.data);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': doc.contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err: any) {
    return new NextResponse(err.message || 'Error loading image', { status: 500 });
  }
}
