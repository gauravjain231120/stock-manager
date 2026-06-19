/**
 * Seed demo data on top of the imported sample SKUs so every screen has something
 * to show: raw materials, BOMs, channel mappings (Amazon/Flipkart/Myntra), reorder
 * policies — then an initial stock sync. Idempotent.
 *
 * Run AFTER `npm run import`:  npm run seed:demo
 */
import { config } from 'dotenv';
import mongoose from 'mongoose';

import { connectDB } from '@/lib/db';
import { Channel, CHANNELS } from '@/lib/constants';
import { ensureSystemLocations } from './setup-locations';
import { receiveRawMaterial } from '@/lib/production';
import { setReorderPolicy } from '@/lib/replenishment';
import { syncAll } from '@/lib/sync';
import { ProductModel } from '@/models/Product';
import { RawMaterialModel } from '@/models/RawMaterial';
import { BomModel } from '@/models/Bom';
import { ChannelListingModel } from '@/models/ChannelListing';

config({ path: '.env.local' });

const MATERIALS = [
  { code: 'FABRIC', name: 'Cotton Fabric', unit: 'm', open: 500, reorder: 100 },
  { code: 'THREAD', name: 'Thread Spool', unit: 'm', open: 2000, reorder: 300 },
  { code: 'ZIP', name: 'Metal Zip', unit: 'pcs', open: 200, reorder: 50 },
  { code: 'POLYBAG', name: 'Poly Bag', unit: 'pcs', open: 1000, reorder: 200 },
];

const BOM_BY_CATEGORY: Record<string, { materialCode: string; qtyPerUnit: number }[]> = {
  'T-Shirts': [{ materialCode: 'FABRIC', qtyPerUnit: 1.2 }, { materialCode: 'THREAD', qtyPerUnit: 0.1 }, { materialCode: 'POLYBAG', qtyPerUnit: 1 }],
  Hoodies: [{ materialCode: 'FABRIC', qtyPerUnit: 2 }, { materialCode: 'THREAD', qtyPerUnit: 0.2 }, { materialCode: 'ZIP', qtyPerUnit: 1 }, { materialCode: 'POLYBAG', qtyPerUnit: 1 }],
  Caps: [{ materialCode: 'FABRIC', qtyPerUnit: 0.3 }, { materialCode: 'THREAD', qtyPerUnit: 0.05 }, { materialCode: 'POLYBAG', qtyPerUnit: 1 }],
  Socks: [{ materialCode: 'FABRIC', qtyPerUnit: 0.2 }, { materialCode: 'THREAD', qtyPerUnit: 0.05 }, { materialCode: 'POLYBAG', qtyPerUnit: 1 }],
};

const CHANNEL_PREFIX: Record<Channel, string> = {
  [Channel.AMAZON]: 'AMZ',
  [Channel.FLIPKART]: 'FLP',
  [Channel.MYNTRA]: 'MYN',
};

async function main() {
  await connectDB();
  await ensureSystemLocations();

  const products = await ProductModel.find().lean();
  if (!products.length) {
    console.log('No products found. Run `npm run import` first.');
    return;
  }

  // Raw materials (+ opening stock via the ledger).
  for (const m of MATERIALS) {
    const exists = await RawMaterialModel.findOne({ code: m.code }).lean();
    if (!exists) {
      await RawMaterialModel.create({ code: m.code, name: m.name, unit: m.unit, onHand: 0, reorderPoint: m.reorder });
      await receiveRawMaterial({ materialCode: m.code, qty: m.open, note: 'Demo opening stock' });
    }
  }

  // BOMs by category, channel mappings on all 3 channels, reorder policies.
  let boms = 0;
  let listings = 0;
  for (const p of products) {
    const components = BOM_BY_CATEGORY[p.category ?? ''] ?? [];
    if (components.length) {
      await BomModel.updateOne({ sku: p.sku }, { $set: { components } }, { upsert: true });
      boms++;
    }
    for (const channel of CHANNELS) {
      const channelSku = `${CHANNEL_PREFIX[channel as Channel]}-${p.sku}`;
      await ChannelListingModel.updateOne(
        { channel, channelSku },
        { $set: { sku: p.sku, price: p.mrp, active: true } },
        { upsert: true },
      );
      listings++;
    }
    await setReorderPolicy(p.sku, 10, 10);
  }

  const sync = await syncAll();

  console.log('Demo seed complete:');
  console.log(`  raw materials: ${MATERIALS.length}`);
  console.log(`  BOMs:          ${boms}`);
  console.log(`  listings:      ${listings} (${products.length} SKUs x ${CHANNELS.length} channels)`);
  console.log(`  synced pushes: ${sync.length}`);
}

main()
  .then(() => mongoose.connection.close())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
