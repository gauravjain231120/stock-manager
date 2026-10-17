import { NextRequest, NextResponse } from 'next/server';
import { updateClothColor, deleteClothColor } from '@/lib/clothColors';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const body = await req.json().catch(() => ({}));
    const color = await updateClothColor(id, {
      name: typeof body?.name === 'string' ? body.name : undefined,
      imageUrl: typeof body?.imageUrl === 'string' ? body.imageUrl : undefined,
      notes: typeof body?.notes === 'string' ? body.notes : undefined,
    });
    if (!color) return NextResponse.json({ error: 'Color not found' }, { status: 404 });
    return NextResponse.json({ ok: true, color });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const ok = await deleteClothColor(id);
    if (!ok) return NextResponse.json({ error: 'Color not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
