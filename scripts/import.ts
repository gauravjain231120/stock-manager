/**
 * Import SKUs + opening stock counts from a CSV.
 *
 *   npm run import                       # uses data/sample-skus.csv
 *   npm run import -- path/to/file.csv   # your own file
 *
 * CSV columns (header row required):
 *   sku, name, size, color, category, costPrice, mrp, openingQty, locationCode
 *   - size/color become product attributes (optional, leave blank if N/A)
 *   - openingQty seeds your CURRENT physical count as an ADJUSTED opening-balance
 *     movement (the first row in the ledger for that SKU)
 *   - locationCode defaults to MAIN
 *
 * Re-running is SAFE: products are upserted, and each opening balance is posted
 * at most once (keyed by OPENING:<sku>). Change a real count later via the app,
 * not by editing the CSV.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { parse } from 'csv-parse/sync';
import mongoose from 'mongoose';

import { connectDB } from '@/lib/db';
import { ProductModel } from '@/models/Product';
import { StockMovementModel } from '@/models/StockMovement';
import { applyMovement } from '@/lib/stock';
import { MovementType, SystemLocation } from '@/lib/constants';
import { ensureSystemLocations } from './setup-locations';

config({ path: '.env.local' });

type Row = {
  sku: string;
  name: string;
  size?: string;
  color?: string;
  category?: string;
  costPrice?: string;
  mrp?: string;
  openingQty?: string;
  locationCode?: string;
};

function num(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

async function main() {
  const csvPath = resolve(process.argv[2] || 'data/sample-skus.csv');
  const raw = readFileSync(csvPath, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true }) as Row[];

  await connectDB();
  await ensureSystemLocations();

  let created = 0;
  let updated = 0;
  let openingPosted = 0;
  let openingSkipped = 0;

  for (const row of rows) {
    const sku = (row.sku || '').trim().toUpperCase();
    if (!sku) continue;

    const attributes: Record<string, string> = {};
    if (row.size) attributes.size = row.size;
    if (row.color) attributes.color = row.color;

    const res = await ProductModel.updateOne(
      { sku },
      {
        $set: {
          name: row.name,
          attributes,
          category: row.category,
          costPrice: num(row.costPrice),
          mrp: num(row.mrp),
        },
        $setOnInsert: { active: true },
      },
      { upsert: true },
    );
    if (res.upsertedCount) created++;
    else updated++;

    const openingQty = num(row.openingQty) ?? 0;
    const locationCode = (row.locationCode || SystemLocation.MAIN).trim().toUpperCase();
    if (openingQty > 0) {
      const refId = `OPENING:${sku}`;
      const exists = await StockMovementModel.exists({ refType: 'IMPORT', refId });
      if (exists) {
        openingSkipped++;
      } else {
        await applyMovement({
          sku,
          locationCode,
          qty: openingQty,
          type: MovementType.ADJUSTED,
          refType: 'IMPORT',
          refId,
          note: 'Opening balance (CSV import)',
        });
        openingPosted++;
      }
    }
  }

  console.log(`\nImport complete from ${csvPath}`);
  console.log(`  products:        ${created} created, ${updated} updated`);
  console.log(`  opening balance: ${openingPosted} posted, ${openingSkipped} already existed`);
}

main()
  .then(() => mongoose.connection.close())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nImport failed:', err);
    process.exit(1);
  });
