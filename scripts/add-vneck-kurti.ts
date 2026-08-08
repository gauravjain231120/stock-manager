/**
 * One-off: add the V-Neck Kurti (RRC-013) product, and first fill the gaps in
 * Co-ord Set (RRC-001) so every V-Neck Kurti variant has a counterpart.
 *
 * V-Neck Kurti has no stock of its own — BUNDLE_STOCK_PREFIX maps RRC-013- to
 * RRC-001-, so it shows the Co-ord Set's count and shipping one takes a Co-ord
 * Set off the pile. That mapping only lines up if RRC-001 has the same colour ×
 * size grid, hence the fill: Co-ord Set was missing all of White and all of XS.
 *
 * Idempotent — existing SKUs are left alone. Creates no stock: both products
 * start from whatever Co-ord Set already has.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/add-vneck-kurti.ts --dry
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/add-vneck-kurti.ts
 */
import { config } from 'dotenv';
import mongoose from 'mongoose';

import { connectDB } from '@/lib/db';
import { ProductModel } from '@/models/Product';
import { ProductGroupModel } from '@/models/ProductGroup';

config({ path: '.env.local' });

const DRY = process.argv.includes('--dry');

/** Colour name -> the SKU segment it has always used across the catalogue. */
const COLORS: { name: string; code: string }[] = [
  { name: 'Blue-Cross', code: 'CO-A-BLU' },
  { name: 'Black-Ikat', code: 'CO-B-BL' },
  { name: 'Red', code: 'CO-C-RED' },
  { name: 'Black-Bandhej', code: 'CO-D-BL' },
  { name: 'White', code: 'CO-E-OW' },
  { name: 'Blue-Bandhej', code: 'CO-F-BLU' },
  { name: 'Grey', code: 'CO-G-GR' },
];

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

const COORD = { code: 'COORDSET', prefix: 'RRC-001', name: 'Co-ord Set', category: 'Coord set' };

const VNECK = {
  code: 'VNECKKURTI',
  prefix: 'RRC-013',
  name: 'V-Neck Kurti',
  category: 'V-Neck Kurti',
  mrp: 999,
  imageUrl:
    'https://assets.myntassets.com/h_720,q_90,w_540/v1/assets/images/2026/AUGUST/5/2pOBH95I_7b9c73b1bf414a2ab38850806d5c50ad.jpg',
};

/** The full colour × size grid as SKUs for a style prefix. */
function grid(prefix: string) {
  return COLORS.flatMap((c) =>
    SIZES.map((size) => ({ sku: `${prefix}-${c.code}-${size}`, color: c.name, size })),
  );
}

interface NewVariant {
  sku: string;
  color: string;
  size: string;
}

/** Create any of `variants` that don't exist yet, under an existing group. */
async function createVariants(
  variants: NewVariant[],
  group: { code: string; name: string; category?: string; imageUrl?: string; mrp?: number },
) {
  const existing = new Set(
    (await ProductModel.find({ sku: { $in: variants.map((v) => v.sku) } }, { sku: 1 }).lean()).map(
      (p) => p.sku,
    ),
  );
  const missing = variants.filter((v) => !existing.has(v.sku));

  for (const v of missing) {
    console.log(`   + ${v.sku.padEnd(24)} ${v.color} ${v.size}`);
    if (DRY) continue;
    await ProductModel.create({
      sku: v.sku,
      name: [group.name, v.color, v.size].filter(Boolean).join(' '),
      groupCode: group.code,
      imageUrl: group.imageUrl,
      attributes: { size: v.size, color: v.color },
      category: group.category,
      mrp: group.mrp,
    });
  }
  return { created: missing.length, skipped: existing.size };
}

async function main() {
  await connectDB();
  console.log(DRY ? '=== DRY RUN — nothing will be written ===\n' : '=== APPLYING ===\n');

  // --- 1. Fill the gaps in Co-ord Set (White row + XS column) -----------------
  console.log(`1. Co-ord Set (${COORD.prefix}) — filling the grid to ${COLORS.length}x${SIZES.length}`);
  const coordGroup = await ProductGroupModel.findOne({ code: COORD.code });
  if (!coordGroup) throw new Error(`Product group ${COORD.code} not found`);

  const coord = await createVariants(grid(COORD.prefix), {
    code: COORD.code,
    name: coordGroup.name,
    category: coordGroup.category ?? undefined,
    imageUrl: coordGroup.imageUrl ?? undefined,
    mrp: coordGroup.mrp ?? undefined,
  });

  // Keep the group's own colour/size lists in step with its new variants.
  const addColors = COLORS.map((c) => c.name).filter((n) => !coordGroup.colors.includes(n));
  const addSizes = SIZES.filter((s) => !coordGroup.sizes.includes(s));
  if (addColors.length || addSizes.length) {
    console.log(`   group lists += colours [${addColors}] sizes [${addSizes}]`);
    if (!DRY) {
      coordGroup.colors.push(...addColors);
      // Keep XS at the front so sizes stay in wearing order.
      coordGroup.sizes = SIZES.filter((s) => coordGroup.sizes.includes(s) || addSizes.includes(s));
      await coordGroup.save();
    }
  }
  console.log(`   created ${coord.created}, already there ${coord.skipped}\n`);

  // --- 2. Create the V-Neck Kurti product -------------------------------------
  console.log(`2. V-Neck Kurti (${VNECK.prefix})`);
  if (await ProductGroupModel.exists({ code: VNECK.code })) {
    console.log('   group already exists — leaving it alone');
  } else {
    console.log(`   + group ${VNECK.code} "${VNECK.name}" cat="${VNECK.category}" mrp=${VNECK.mrp}`);
    if (!DRY) {
      await ProductGroupModel.create({
        code: VNECK.code,
        name: VNECK.name,
        category: VNECK.category,
        imageUrl: VNECK.imageUrl,
        mrp: VNECK.mrp,
        colors: COLORS.map((c) => c.name),
        sizes: SIZES,
      });
    }
  }

  const vneck = await createVariants(grid(VNECK.prefix), VNECK);
  console.log(`   created ${vneck.created}, already there ${vneck.skipped}\n`);

  console.log(
    `TOTAL — Co-ord Set +${coord.created}, V-Neck Kurti +${vneck.created} ` +
      `(${coord.created + vneck.created} new SKUs, 0 stock created)`,
  );
  if (DRY) console.log('\nDRY RUN — nothing was written.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
