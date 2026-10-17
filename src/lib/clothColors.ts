import { connectDB } from '@/lib/db';
import { ClothColorModel } from '@/models/ClothColor';

export interface ClothColorRow {
  id: string;
  name: string;
  imageUrl: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export async function listClothColors(): Promise<ClothColorRow[]> {
  await connectDB();
  const docs = await ClothColorModel.find().sort({ createdAt: -1 }).lean();
  return docs.map((d) => ({
    id: String(d._id),
    name: d.name,
    imageUrl: d.imageUrl,
    notes: d.notes || '',
    createdAt: (d as any).createdAt ? new Date((d as any).createdAt).toISOString() : '',
    updatedAt: (d as any).updatedAt ? new Date((d as any).updatedAt).toISOString() : '',
  }));
}

export async function addClothColor(input: {
  name: string;
  imageUrl: string;
  notes?: string;
}): Promise<ClothColorRow> {
  const name = input.name.trim();
  const imageUrl = input.imageUrl.trim();
  if (!name) throw new Error('Color name is required');
  if (!imageUrl) throw new Error('Image is required');

  await connectDB();
  const doc = await ClothColorModel.create({
    name,
    imageUrl,
    notes: input.notes?.trim() || '',
  });

  return {
    id: String(doc._id),
    name: doc.name,
    imageUrl: doc.imageUrl,
    notes: doc.notes || '',
    createdAt: (doc as any).createdAt ? new Date((doc as any).createdAt).toISOString() : new Date().toISOString(),
    updatedAt: (doc as any).updatedAt ? new Date((doc as any).updatedAt).toISOString() : new Date().toISOString(),
  };
}

export async function updateClothColor(
  id: string,
  input: { name?: string; imageUrl?: string; notes?: string },
): Promise<ClothColorRow | null> {
  await connectDB();
  const updates: Record<string, any> = {};
  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) throw new Error('Color name cannot be empty');
    updates.name = trimmed;
  }
  if (input.imageUrl !== undefined) {
    const trimmed = input.imageUrl.trim();
    if (!trimmed) throw new Error('Image URL cannot be empty');
    updates.imageUrl = trimmed;
  }
  if (input.notes !== undefined) {
    updates.notes = input.notes.trim();
  }

  const doc = await ClothColorModel.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();
  if (!doc) return null;

  return {
    id: String(doc._id),
    name: doc.name,
    imageUrl: doc.imageUrl,
    notes: doc.notes || '',
    createdAt: (doc as any).createdAt ? new Date((doc as any).createdAt).toISOString() : '',
    updatedAt: (doc as any).updatedAt ? new Date((doc as any).updatedAt).toISOString() : '',
  };
}

export async function deleteClothColor(id: string): Promise<boolean> {
  await connectDB();
  const res = await ClothColorModel.findByIdAndDelete(id);
  return Boolean(res);
}
