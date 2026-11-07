import { config } from 'dotenv';
config({ path: '.env.local' });
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { ProductModel } from '@/models/Product';
import { ProductGroupModel } from '@/models/ProductGroup';
import { addPending } from '@/lib/shipping';
import { invalidateStockShareCache } from '@/lib/stockShare';

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

async function main() {
  await connectDB();
  console.log('Connected to DB');

  const group = await ProductGroupModel.findOne({ code: 'COORDSET' });
  if (!group) throw new Error('COORDSET group not found');

  console.log('Product group found:', group.name, group.code);

  const created: string[] = [];
  const existing: string[] = [];

  for (const size of SIZES) {
    const ylSku = `RRC-001-CO-K-YL-${size}`;
    const yllSku = `RRC-001-CO-K-YLL-${size}`;

    const targetProduct = await ProductModel.findOne({ sku: ylSku });
    if (!targetProduct) {
      console.warn(`Warning: Target SKU ${ylSku} not found in products!`);
    }

    const current = await ProductModel.findOne({ sku: yllSku });
    if (current) {
      existing.push(yllSku);
      if (current.sharesStockWith !== ylSku) {
        current.sharesStockWith = ylSku;
        await current.save();
        console.log(`Updated existing ${yllSku} to share stock with ${ylSku}`);
      }
    } else {
      await ProductModel.create({
        sku: yllSku,
        name: `Co-ord Set Yellow ${size}`,
        groupCode: 'COORDSET',
        imageUrl: targetProduct?.imageUrl || group.imageUrl,
        attributes: { size, color: 'Yellow' },
        category: group.category || 'Coord set',
        mrp: group.mrp || 999,
        sharesStockWith: ylSku,
        active: true,
      });
      created.push(yllSku);
      console.log(`Created ${yllSku} -> sharesStockWith ${ylSku}`);
    }
  }

  invalidateStockShareCache();

  console.log(`\nCreated ${created.length} variants, ${existing.length} already existed.`);

  // Now check and add the unreserved order 171-7392311-4205130 if not already in Ready to Ship
  const orderId = '171-7392311-4205130';
  const pendingCollection = mongoose.connection.collection('pendingshipments');
  const alreadyInQueue = await pendingCollection.findOne({ orderId });

  if (alreadyInQueue) {
    console.log(`Order ${orderId} is already in Ready to Ship queue (${alreadyInQueue.sku}).`);
  } else {
    console.log(`Adding order ${orderId} (RRC-001-CO-K-YLL-M) to Ready to Ship queue...`);
    const res = await addPending({
      sku: 'RRC-001-CO-K-YLL-M',
      qty: 1,
      channel: 'AMAZON',
      orderId,
      placedAt: new Date(1794047861.003 * 1000), // 7 Nov 2026, 4:07 pm (IST) / 10:37:41 UTC
      shipByAt: new Date(1794508199 * 1000),     // 12 Nov 2026, 11:59 pm (IST) / 18:29:59 UTC
      noMerge: true,
    });
    console.log(`Order ${orderId} added to Ready to Ship queue with id:`, res.id);
  }

  await mongoose.disconnect();
  console.log('Finished.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
