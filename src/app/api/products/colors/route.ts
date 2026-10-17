import { NextRequest, NextResponse } from 'next/server';
import { listClothColors, addClothColor } from '@/lib/clothColors';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const colors = await listClothColors();
    return NextResponse.json({ colors });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!body?.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'Color name is required' }, { status: 400 });
    }
    if (!body?.imageUrl || typeof body.imageUrl !== 'string') {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 });
    }

    const color = await addClothColor({
      name: body.name,
      imageUrl: body.imageUrl,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
    });

    return NextResponse.json({ ok: true, color }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
