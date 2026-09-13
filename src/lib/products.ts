import { connectDB } from '@/lib/db';
import { MovementType, SystemLocation } from '@/lib/constants';
import { stockSkuFor, invalidateStockShareCache } from '@/lib/stockShare';
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

/**
 * Add one variant, then fill in the rest of `extraSizes` for the same colour
 * by swapping the size segment of `sku` (its last "-"-separated part) — one
 * SKU typed in gives you the whole size run instead of adding each by hand.
 * A size that already exists for this colour is left alone, not overwritten.
 */
export async function addVariantsForColor(
  code: string,
  v: { color?: string; size?: string; sku: string; openingQty?: number; extraSizes?: string[] },
) {
  const primary = await addVariant(code, { color: v.color, size: v.size, sku: v.sku, openingQty: v.openingQty });
  const sku = primary.sku;
  const idx = sku.lastIndexOf('-');
  const prefix = idx === -1 ? sku : sku.slice(0, idx);

  const created: string[] = [primary.sku];
  const skipped: { size: string; reason: string }[] = [];
  for (const size of v.extraSizes ?? []) {
    const extraSku = `${prefix}-${size.trim().toUpperCase()}`;
    try {
      const res = await addVariant(code, { color: v.color, size, sku: extraSku, openingQty: 0 });
      created.push(res.sku);
    } catch (err) {
      skipped.push({ size, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return { created, skipped };
}

/**
 * Apply one variant's stock-sharing target to every other size of the same
 * colour in its product, swapping the target's size segment to match each
 * one — set Red/S to share with RRC-002-...-RED-S once, and Red/M, Red/L etc.
 * pick up RRC-002-...-RED-M, RRC-002-...-RED-L automatically instead of being
 * configured one size at a time. A size whose swapped target doesn't exist is
 * left on its own stock rather than failing the whole batch.
 */
export async function setSharesStockWithForColorGroup(sku: string, targetSku: string) {
  await connectDB();
  const s = sku.trim().toUpperCase();
  const t = targetSku.trim().toUpperCase();
  const product = await ProductModel.findOne({ sku: s });
  if (!product) throw new Error('Variant not found');

  const primary = await setSharesStockWith(s, t);
  const updated = [primary.sku];
  const skipped: { sku: string; reason: string }[] = [];

  const color = product.attributes instanceof Map ? product.attributes.get('color') : (product.attributes as unknown as Record<string, string>)?.color;
  const tIdx = t.lastIndexOf('-');
  const tPrefix = tIdx === -1 ? t : t.slice(0, tIdx);

  if (color && product.groupCode) {
    const siblings = await ProductModel.find({ groupCode: product.groupCode, 'attributes.color': color, sku: { $ne: s } } as never).lean();
    for (const sib of siblings) {
      const sibIdx = sib.sku.lastIndexOf('-');
      const sibSize = sibIdx === -1 ? '' : sib.sku.slice(sibIdx + 1);
      if (!sibSize) continue;
      const sibTarget = `${tPrefix}-${sibSize}`;
      if (sibTarget === sib.sku) continue; // would point at itself — leave it alone
      try {
        await setSharesStockWith(sib.sku, sibTarget);
        updated.push(sib.sku);
      } catch (err) {
        skipped.push({ sku: sib.sku, reason: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  return { updated, skipped };
}

/**
 * Edit a variant's colour and/or size attributes (not its SKU string — use
 * renameVariantSku for that). Updates the display name and keeps the parent
 * group's colour/size dropdown lists in sync: adds the new value if it's new,
 * and drops the old one from the list once no variant in the group uses it
 * any more.
 */
export async function editVariantAttributes(sku: string, changes: { color?: string; size?: string }) {
  await connectDB();
  const s = sku.trim().toUpperCase();
  const product = await ProductModel.findOne({ sku: s });
  if (!product) throw new Error('Variant not found');

  const attrs: Map<string, string> =
    product.attributes instanceof Map ? product.attributes : new Map(Object.entries(product.attributes ?? {}));
  const oldColor = attrs.get('color');
  const oldSize = attrs.get('size');
  const newColor = changes.color !== undefined ? changes.color.trim() : oldColor;
  const newSize = changes.size !== undefined ? changes.size.trim() : oldSize;

  if (newColor) attrs.set('color', newColor);
  else attrs.delete('color');
  if (newSize) attrs.set('size', newSize);
  else attrs.delete('size');
  product.attributes = attrs;

  const group = product.groupCode ? await ProductGroupModel.findOne({ code: product.groupCode }) : null;
  if (group) product.name = [group.name, newColor, newSize].filter(Boolean).join(' ');
  await product.save();

  if (group) {
    let groupChanged = false;
    if (newColor && !group.colors.includes(newColor)) {
      group.colors.push(newColor);
      groupChanged = true;
    }
    if (newSize && !group.sizes.includes(newSize)) {
      group.sizes.push(newSize);
      groupChanged = true;
    }
    // Mongoose's generated types don't expose dotted paths into a Map field
    // ('attributes.color'), even though it's a perfectly valid query at
    // runtime — cast just this filter rather than losing type-checking
    // elsewhere in the function.
    if (
      oldColor &&
      oldColor !== newColor &&
      !(await ProductModel.exists({ groupCode: group.code, 'attributes.color': oldColor } as never))
    ) {
      group.colors = group.colors.filter((c) => c !== oldColor);
      groupChanged = true;
    }
    if (
      oldSize &&
      oldSize !== newSize &&
      !(await ProductModel.exists({ groupCode: group.code, 'attributes.size': oldSize } as never))
    ) {
      group.sizes = group.sizes.filter((sz) => sz !== oldSize);
      groupChanged = true;
    }
    if (groupChanged) await group.save();
  }

  return { sku: s, color: newColor, size: newSize, name: product.name };
}

/**
 * Point a variant at another SKU's physical stock (or clear it back to its
 * own) — the same mechanism that already powers "Halter with Palazzos"
 * sharing "Halter Neck"'s pile, now configurable per variant instead of
 * hardcoded. Every on-hand/reserved effect for `sku` lands on `targetSku`
 * from then on; `sku` keeps its own ledger rows so its sales stay visible.
 *
 * Chains are allowed — any number of variants can point at the same target,
 * and a target can itself point further on (stockSkuFor follows the whole
 * chain to the real pile). The only thing blocked is a loop, since that would
 * leave nothing with real stock to resolve to.
 */
export async function setSharesStockWith(sku: string, targetSku: string | null) {
  await connectDB();
  const s = sku.trim().toUpperCase();
  const product = await ProductModel.findOne({ sku: s });
  if (!product) throw new Error('Variant not found');

  if (!targetSku || !targetSku.trim()) {
    product.sharesStockWith = undefined;
    await product.save();
    invalidateStockShareCache();
    return { sku: s, sharesStockWith: null };
  }

  const t = targetSku.trim().toUpperCase();
  if (t === s) throw new Error('A variant cannot share stock with itself');
  const target = await ProductModel.findOne({ sku: t });
  if (!target) throw new Error(`SKU ${t} not found`);

  // Follow the chain onward from the target — pointing sku -> t must never
  // loop back to sku itself, however many hops it takes to get there.
  let cursor: string | null | undefined = target.sharesStockWith;
  let hops = 0;
  while (cursor) {
    if (cursor === s) throw new Error(`That would create a loop — ${t} eventually leads back to ${s}`);
    if (++hops > 20) throw new Error('That sharing chain is too long — check for a loop');
    const next = await ProductModel.findOne({ sku: cursor }, { sharesStockWith: 1 }).lean();
    cursor = next?.sharesStockWith;
  }

  product.sharesStockWith = t;
  await product.save();
  invalidateStockShareCache();
  return { sku: s, sharesStockWith: t };
}

/** Remove a single variant SKU and its stock/history. */
export async function removeVariant(sku: string) {
  await connectDB();
  const s = sku.trim().toUpperCase();
  const dependents = await ProductModel.find({ sharesStockWith: s }, { sku: 1 }).lean();
  if (dependents.length > 0) {
    throw new Error(
      `Can't remove — ${dependents.map((d) => d.sku).join(', ')} still shares stock with this variant. Repoint or remove those first.`,
    );
  }
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
    // Any OTHER variant sharing stock with this one must keep pointing at it
    // under its new name, or it silently falls back to tracking its own
    // (empty) pile instead.
    ProductModel.updateMany({ sharesStockWith: o }, { $set: { sharesStockWith: n } }),
  ]);
  invalidateStockShareCache();
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
  /** The other SKU this variant's stock is actually tracked on, if any. */
  sharesStockWith?: string | null;
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

  const pileBySku = new Map(await Promise.all(products.map(async (p) => [p.sku, await stockSkuFor(p.sku)] as const)));

  const views: GroupView[] = groups.map((g) => {
    const items = productsByGroup.get(g.code) ?? [];
    const variants: GroupVariant[] = items
      .map((p) => ({
        sku: p.sku,
        size: p.attributes?.get?.('size') ?? (p.attributes as unknown as Record<string, string>)?.size,
        color: p.attributes?.get?.('color') ?? (p.attributes as unknown as Record<string, string>)?.color,
        // Bundles show their component's pool (e.g. the set shows halter stock).
        onHand: onHandBySku.get(pileBySku.get(p.sku)!) ?? 0,
        sharesStockWith: p.sharesStockWith ?? null,
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
