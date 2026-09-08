import { connectDB } from '@/lib/db';
import { MovementType, SystemLocation, stockSkuFor } from '@/lib/constants';
import { applyMovement } from '@/lib/stock';
import { ProductModel } from '@/models/Product';
import { ProductGroupModel } from '@/models/ProductGroup';
import { SkuStockModel } from '@/models/SkuStock';
import { LocationModel } from '@/models/Location';
import { StockMovementModel } from '@/models/StockMovement';
import { ChannelListingModel } from '@/models/ChannelListing';
import { ChannelInventoryStateModel } from '@/models/ChannelInventoryState';
import { PendingShipmentModel } from '@/models/PendingShipment';
import { MarketplaceOrderModel } from '@/models/MarketplaceOrder';
import { ReturnRecordModel } from '@/models/ReturnRecord';
import { ReturnShipmentModel } from '@/models/ReturnShipment';
import { ProductionBatchModel } from '@/models/ProductionBatch';
import { BomModel } from '@/models/Bom';
import { ReorderPolicyModel } from '@/models/ReorderPolicy';

/** Uppercase alphanumeric slug for building SKUs. */
function slug(s: string) {
  return s.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

export function variantSku(base: string, color?: string, size?: string) {
  return [slug(base), color ? slug(color) : null, size ? slug(size) : null].filter(Boolean).join('-');
}

export interface CreateGroupInput {
  code: string;
  name: string;
  category?: string;
  imageUrl?: string;
  mrp?: number;
  costPrice?: number;
  colors: string[];
  sizes: string[];
  variants: { color?: string; size?: string; openingQty?: number }[];
}

/**
 * Create a parent product and a tracked SKU for each colour×size variant, seeding
 * opening stock. Returns how many variant SKUs were created vs already existed.
 */
export async function createProductGroup(input: CreateGroupInput) {
  await connectDB();
  const code = slug(input.code);
  if (!code) throw new Error('Product code is required');
  if (await ProductGroupModel.exists({ code })) {
    throw new Error(`Product code ${code} already exists`);
  }

  await ProductGroupModel.create({
    code,
    name: input.name,
    category: input.category,
    imageUrl: input.imageUrl,
    mrp: input.mrp,
    costPrice: input.costPrice,
    colors: input.colors,
    sizes: input.sizes,
  });

  let created = 0;
  let skipped = 0;
  for (const v of input.variants) {
    const sku = variantSku(code, v.color, v.size);
    if (await ProductModel.exists({ sku })) {
      skipped++;
      continue;
    }
    const attributes: Record<string, string> = {};
    if (v.size) attributes.size = v.size;
    if (v.color) attributes.color = v.color;
    const variantName = [input.name, v.color, v.size].filter(Boolean).join(' ');

    await ProductModel.create({
      sku,
      name: variantName,
      groupCode: code,
      imageUrl: input.imageUrl,
      attributes,
      category: input.category,
      mrp: input.mrp,
      costPrice: input.costPrice,
    });
    created++;

    const qty = v.openingQty ?? 0;
    if (qty > 0) {
      await applyMovement({
        sku,
        locationCode: SystemLocation.MAIN,
        qty,
        type: MovementType.ADJUSTED,
        refType: 'MANUAL',
        refId: `OPENING:${sku}`,
        note: 'Opening balance (new product)',
      });
    }
  }

  return { code, created, skipped };
}

/**
 * Edit a product's shared fields (name, category, price, photo). Changes propagate
 * to all its variant SKUs — including regenerating each variant's display name.
 */
export async function updateProductGroup(
  code: string,
  fields: { name?: string; category?: string; mrp?: number; costPrice?: number; imageUrl?: string },
) {
  await connectDB();
  const c = code.trim().toUpperCase();
  const group = await ProductGroupModel.findOne({ code: c });
  if (!group) throw new Error('Product not found');

  if (fields.name !== undefined) group.name = fields.name;
  if (fields.category !== undefined) group.category = fields.category;
  if (fields.mrp !== undefined) group.mrp = fields.mrp;
  if (fields.costPrice !== undefined) group.costPrice = fields.costPrice;
  if (fields.imageUrl !== undefined) group.imageUrl = fields.imageUrl;
  await group.save();

  const variants = await ProductModel.find({ groupCode: c });
  for (const p of variants) {
    if (fields.category !== undefined) p.category = fields.category;
    if (fields.mrp !== undefined) p.mrp = fields.mrp;
    if (fields.imageUrl !== undefined) p.imageUrl = fields.imageUrl;
    if (fields.name !== undefined) {
      const color = p.attributes?.get('color');
      const size = p.attributes?.get('size');
      p.name = [group.name, color, size].filter(Boolean).join(' ');
    }
    await p.save();
  }
  return { code: c };
}

/** Add a single colour/size variant (new SKU) to an existing product. */
export async function addVariant(code: string, v: { color?: string; size?: string; openingQty?: number; sku?: string }) {
  await connectDB();
  const c = code.trim().toUpperCase();
  const group = await ProductGroupModel.findOne({ code: c });
  if (!group) throw new Error('Product not found');

  // An explicit SKU wins — a marketplace listing's own SKU (e.g. RRC-011-CO-C-RED-XS)
  // rarely matches what auto-derives from just colour+size, and typing it here beats
  // creating the auto-derived one and immediately renaming it.
  const sku = v.sku?.trim() ? v.sku.trim().toUpperCase() : variantSku(c, v.color, v.size);
  if (await ProductModel.exists({ sku })) throw new Error(`Variant ${sku} already exists`);

  const attributes: Record<string, string> = {};
  if (v.size) attributes.size = v.size;
  if (v.color) attributes.color = v.color;

  await ProductModel.create({
    sku,
    name: [group.name, v.color, v.size].filter(Boolean).join(' '),
    groupCode: c,
    imageUrl: group.imageUrl,
    attributes,
    category: group.category,
    mrp: group.mrp,
    costPrice: group.costPrice,
  });

  if (v.color && !group.colors.includes(v.color)) group.colors.push(v.color);
  if (v.size && !group.sizes.includes(v.size)) group.sizes.push(v.size);
  await group.save();

  const qty = v.openingQty ?? 0;
  if (qty > 0) {
    await applyMovement({
      sku,
      locationCode: SystemLocation.MAIN,
      qty,
      type: MovementType.ADJUSTED,
      refType: 'MANUAL',
      refId: `OPENING:${sku}`,
      note: 'Opening balance (added variant)',
    });
  }
  return { sku };
}

/** Remove a single variant SKU and its stock/history. */
export async function removeVariant(sku: string) {
  await connectDB();
  const s = sku.trim().toUpperCase();
  await Promise.all([
    ProductModel.deleteOne({ sku: s }),
    SkuStockModel.deleteMany({ sku: s }),
    StockMovementModel.deleteMany({ sku: s }),
    ChannelListingModel.deleteMany({ sku: s }),
    ChannelInventoryStateModel.deleteMany({ sku: s }),
  ]);
  return { sku: s };
}

/**
 * Rename a variant's SKU, carrying everything that points at it — stock, ledger
 * history, channel mappings, anything queued or in flight — over to the new code
 * so nothing is left referring to a SKU that no longer exists. Fails if the new
 * SKU already exists.
 */
export async function renameVariantSku(oldSku: string, newSku: string) {
  await connectDB();
  const o = oldSku.trim().toUpperCase();
  const n = newSku.trim().toUpperCase();
  if (!n) throw new Error('New SKU is required');
  if (n === o) return { sku: n };
  if (!(await ProductModel.exists({ sku: o }))) throw new Error('Variant not found');
  if (await ProductModel.exists({ sku: n })) throw new Error(`SKU "${n}" already exists`);

  await Promise.all([
    ProductModel.updateOne({ sku: o }, { $set: { sku: n } }),
    SkuStockModel.updateMany({ sku: o }, { $set: { sku: n } }),
    StockMovementModel.updateMany({ sku: o }, { $set: { sku: n } }),
    ChannelListingModel.updateMany({ sku: o }, { $set: { sku: n } }),
    ChannelInventoryStateModel.updateMany({ sku: o }, { $set: { sku: n } }),
    // Work in flight: an unshipped queue row, a marketplace order, a return being
    // processed or a production batch would otherwise point at a dead SKU.
    PendingShipmentModel.updateMany({ sku: o }, { $set: { sku: n } }),
    MarketplaceOrderModel.updateMany({ sku: o }, { $set: { sku: n } }),
    ReturnRecordModel.updateMany({ sku: o }, { $set: { sku: n } }),
    ReturnShipmentModel.updateMany({ sku: o }, { $set: { sku: n } }),
    ProductionBatchModel.updateMany({ sku: o }, { $set: { sku: n } }),
    BomModel.updateMany({ sku: o }, { $set: { sku: n } }),
    ReorderPolicyModel.updateMany({ sku: o }, { $set: { sku: n } }),
  ]);
  return { sku: n };
}

/**
 * Delete a product and everything tied to its variant SKUs: the variant Products,
 * their stock, ledger movements, channel mappings and channel state. Use to remove
 * a product added by mistake.
 */
export async function deleteProductGroup(code: string) {
  await connectDB();
  const c = code.trim().toUpperCase();
  const variants = await ProductModel.find({ groupCode: c }, { sku: 1 }).lean();
  const skus = variants.map((v) => v.sku);

  await Promise.all([
    ProductGroupModel.deleteOne({ code: c }),
    ProductModel.deleteMany({ groupCode: c }),
    SkuStockModel.deleteMany({ sku: { $in: skus } }),
    StockMovementModel.deleteMany({ sku: { $in: skus } }),
    ChannelListingModel.deleteMany({ sku: { $in: skus } }),
    ChannelInventoryStateModel.deleteMany({ sku: { $in: skus } }),
  ]);

  return { code: c, removedVariants: skus.length };
}

export interface GroupVariant {
  sku: string;
  size?: string;
  color?: string;
  onHand: number;
}
export interface GroupView {
  code: string;
  name: string;
  category?: string;
  imageUrl?: string;
  mrp?: number;
  variantCount: number;
  totalStock: number;
  variants: GroupVariant[];
}

/** All product groups with per-variant sellable stock, plus count of ungrouped SKUs. */
export async function getProductGroups(): Promise<{ groups: GroupView[]; ungrouped: number }> {
  await connectDB();
  const [groups, products, stock, locations] = await Promise.all([
    ProductGroupModel.find().sort({ createdAt: -1 }).lean(),
    ProductModel.find().lean(),
    SkuStockModel.find().lean(),
    LocationModel.find({ kind: 'SELLABLE' }).lean(),
  ]);

  const sellable = new Set(locations.map((l) => l.code));
  const onHandBySku = new Map<string, number>();
  for (const s of stock) {
    if (!sellable.has(s.locationCode)) continue;
    onHandBySku.set(s.sku, (onHandBySku.get(s.sku) ?? 0) + s.onHand);
  }

  const productsByGroup = new Map<string, typeof products>();
  let ungrouped = 0;
  for (const p of products) {
    if (!p.groupCode) {
      ungrouped++;
      continue;
    }
    const arr = productsByGroup.get(p.groupCode) ?? [];
    arr.push(p);
    productsByGroup.set(p.groupCode, arr);
  }

  const views: GroupView[] = groups.map((g) => {
    const items = productsByGroup.get(g.code) ?? [];
    const variants: GroupVariant[] = items
      .map((p) => ({
        sku: p.sku,
        size: p.attributes?.get?.('size') ?? (p.attributes as unknown as Record<string, string>)?.size,
        color: p.attributes?.get?.('color') ?? (p.attributes as unknown as Record<string, string>)?.color,
        // Bundles show their component's pool (e.g. the set shows halter stock).
        onHand: onHandBySku.get(stockSkuFor(p.sku)) ?? 0,
      }))
      .sort((a, b) => a.sku.localeCompare(b.sku));
    return {
      code: g.code,
      name: g.name,
      category: g.category ?? undefined,
      imageUrl: g.imageUrl ?? undefined,
      mrp: g.mrp ?? undefined,
      variantCount: variants.length,
      totalStock: variants.reduce((acc, v) => acc + v.onHand, 0),
      variants,
    };
  });

  return { groups: views, ungrouped };
}
