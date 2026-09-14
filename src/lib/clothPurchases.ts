import { connectDB } from '@/lib/db';
import { ClothPurchaseModel } from '@/models/ClothPurchase';

export interface ClothPurchaseItem {
  id: string;
  name: string;
  meters: number;
  price: number;
  shop: string;
  date: string;
}

function toItem(doc: {
  _id: unknown;
  name: string;
  meters: number;
  price: number;
  shop?: string | null;
  date: Date;
}): ClothPurchaseItem {
  return {
    id: String(doc._id),
    name: doc.name,
    meters: doc.meters,
    price: doc.price,
    shop: doc.shop ?? '',
    date: doc.date.toISOString(),
  };
}

/** Every cloth purchase ever logged, most recent first. */
export async function listClothPurchases(): Promise<ClothPurchaseItem[]> {
  await connectDB();
  const docs = await ClothPurchaseModel.find().sort({ date: -1, createdAt: -1 }).lean();
  return docs.map(toItem);
}

export async function addClothPurchase(input: {
  name: string;
  meters: number;
  price: number;
  shop: string;
  date: string;
}): Promise<ClothPurchaseItem> {
  await connectDB();
  const doc = await ClothPurchaseModel.create({
    name: input.name.trim(),
    meters: input.meters,
    price: input.price,
    shop: input.shop.trim(),
    date: new Date(input.date),
  });
  return toItem(doc.toObject());
}

export async function updateClothPurchase(
  id: string,
  changes: Partial<{ name: string; meters: number; price: number; shop: string; date: string }>,
): Promise<void> {
  await connectDB();
  const set: Record<string, string | number | Date> = {};
  if (changes.name !== undefined) set.name = changes.name.trim();
  if (changes.meters !== undefined) set.meters = changes.meters;
  if (changes.price !== undefined) set.price = changes.price;
  if (changes.shop !== undefined) set.shop = changes.shop.trim();
  if (changes.date !== undefined) set.date = new Date(changes.date);
  if (Object.keys(set).length === 0) return;
  await ClothPurchaseModel.updateOne({ _id: id }, { $set: set });
}

export async function deleteClothPurchase(id: string): Promise<void> {
  await connectDB();
  await ClothPurchaseModel.deleteOne({ _id: id });
}
