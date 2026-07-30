/**
 * The bits of a Product a variant picker needs: which parent product it belongs
 * to, and its colour/size. Shared by the Stock Log and Ready to Ship forms so
 * both drill down the same way.
 */
export interface VariantMeta {
  groupCode?: string;
  groupName?: string;
  category?: string;
  color?: string;
  size?: string;
  imageUrl?: string;
}

/** Variant attributes as a plain object, whether Mongoose gives a Map or not. */
export function attrsOf(attributes: unknown): Record<string, string> {
  if (attributes instanceof Map) return Object.fromEntries(attributes);
  return (attributes as Record<string, string>) ?? {};
}

interface ProductDoc {
  groupCode?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  attributes?: unknown;
}

/** Pull the picker fields off a (lean) Product doc. `groupName` comes from ProductGroup. */
export function variantMeta(p: ProductDoc, groupName?: string): VariantMeta {
  const attrs = attrsOf(p.attributes);
  return {
    groupCode: p.groupCode ?? undefined,
    groupName: groupName || undefined,
    category: p.category?.trim() || undefined,
    color: attrs.color?.trim() || undefined,
    size: attrs.size?.trim() || undefined,
    imageUrl: p.imageUrl ?? undefined,
  };
}
