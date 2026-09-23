/**
 * One-off (2026-09-23): fill in `returnType` (CUSTOMER / RTO / UNKNOWN) on
 * RETURNED rows logged before the field existed, from the JSON file the
 * Order Alerts bot's scripts/classify-return-types.js writes (it asks
 * Myntra/Amazon which kind each return was — read-only).
 *
 * Only ever sets `returnType`, and only on RETURNED rows that don't have one
 * yet — never touches stock, condition, or a row the scan pages already
 * tagged. Rows not in the file are left alone (they show as Unknown).
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/apply-return-types.ts /path/to/return-types.json --dry
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/apply-return-types.ts /path/to/return-types.json
 */
import { readFileSync } from 'fs';
import { config } from 'dotenv';
import mongoose from 'mongoose';

import { connectDB } from '@/lib/db';
import { MovementType, RETURN_TYPES, ReturnType } from '@/lib/constants';
import { StockMovementModel } from '@/models/StockMovement';

config({ path: '.env.local' });

const DRY = process.argv.includes('--dry');
const FILE = process.argv.slice(2).find((a) => !a.startsWith('--'));

interface Classified {
  id: string;
  type: string;
}

async function main() {
  if (!FILE) throw new Error('usage: apply-return-types.ts <file.json> [--dry]');
  const entries = JSON.parse(readFileSync(FILE, 'utf8')) as Classified[];
  await connectDB();
  console.log(DRY ? '=== DRY RUN — nothing will be written ===\n' : '=== APPLYING ===\n');

  const byType: Record<string, string[]> = {};
  let invalid = 0;
  for (const e of entries) {
    if (!RETURN_TYPES.includes(e.type as ReturnType) || !mongoose.isValidObjectId(e.id)) {
      invalid += 1;
      continue;
    }
    (byType[e.type] ||= []).push(e.id);
  }

  let total = 0;
  for (const [type, ids] of Object.entries(byType)) {
    const filter = {
      _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
      type: MovementType.RETURNED,
      $or: [{ returnType: { $exists: false } }, { returnType: null }],
    };
    const eligible = await StockMovementModel.countDocuments(filter);
    console.log(`${type.padEnd(8)} ${String(ids.length).padStart(4)} in file, ${String(eligible).padStart(4)} still untagged`);
    if (!DRY && eligible) {
      // timestamps:false — this is a label, not an edit; the row keeps its date.
      const res = await StockMovementModel.updateMany(filter, { $set: { returnType: type } }, { timestamps: false });
      total += res.modifiedCount;
    }
  }
  if (invalid) console.log(`${invalid} entries skipped (bad id or type)`);

  const untagged = await StockMovementModel.countDocuments({
    type: MovementType.RETURNED,
    $or: [{ returnType: { $exists: false } }, { returnType: null }],
  });
  console.log(DRY ? '\nDRY RUN — nothing was written.' : `\nDone: ${total} rows tagged. ${untagged} RETURNED rows still untagged (shown as Unknown).`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
