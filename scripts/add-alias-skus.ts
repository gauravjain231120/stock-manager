/**
 * Seed alias SKUs for all products that have a "-C-" segment in their SKU.
 * Creates a matching "-B-" alias for each, sharing stock with the primary.
 *
 * Usage:
 *   npx tsx scripts/add-alias-skus.ts [--apply]
 *
 *   Without --apply, runs in dry-run mode (shows what would be created).
 *   With --apply, actually creates the alias SKUs.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Connect to MongoDB
const MONGO = process.env.MONGODB_URI;
if (!MONGO) { console.error('MONGODB_URI not set'); process.exit(1); }

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(apply ? '🔧 APPLY mode — creating alias SKUs…' : '👁️  DRY RUN — pass --apply to create');
  console.log();

  await mongoose.connect(MONGO!);

  // Import models after connection
  const { ProductModel } = await import('../src/models/Product');

  // Find all primary products (non-alias) with a "-C-" segment
  const primaries = await ProductModel.find({
    isAlias: { $ne: true },
    sku: /-C-/,
  }).lean();

  console.log(`Found ${primaries.length} primary SKUs with "-C-" segment\n`);

  let created = 0;
  let skipped = 0;

  for (const p of primaries) {
    const aliasSku = p.sku.replace(/-C-/, '-B-');
    const exists = await ProductModel.exists({ sku: aliasSku });
    if (exists) {
      console.log(`  ⏭️  ${aliasSku} already exists — skipping`);
      skipped++;
      continue;
    }

    console.log(`  ${apply ? '✅' : '📋'}  ${p.sku}  →  ${aliasSku}`);

    if (apply) {
      const attrs: Record<string, string> = {};
      const pAttrs = p.attributes instanceof Map
        ? Object.fromEntries(p.attributes)
        : (p.attributes as unknown as Record<string, string>) ?? {};
      if (pAttrs.size) attrs.size = pAttrs.size;
      if (pAttrs.color) attrs.color = pAttrs.color;

      await ProductModel.create({
        sku: aliasSku,
        name: p.name,
        groupCode: p.groupCode,
        imageUrl: p.imageUrl,
        attributes: attrs,
        category: p.category,
        mrp: p.mrp,
        costPrice: p.costPrice,
        sharesStockWith: p.sku,
        isAlias: true,
      });
      created++;
    } else {
      created++;
    }
  }

  console.log();
  console.log(`${apply ? 'Created' : 'Would create'}: ${created} alias SKUs`);
  console.log(`Skipped (already exist): ${skipped}`);

  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });

