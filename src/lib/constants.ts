// Shared domain constants for the inventory system.

/**
 * Every change to stock is one of these movement types. The `qty` on a
 * StockMovement is a SIGNED delta applied to on-hand at a (sku, location).
 *
 *  PRODUCED     +  finished goods made in-house             -> MAIN (sellable)
 *  SOLD         -  a unit shipped to a customer
 *  RETURNED     +  a unit came back from a customer          -> QUARANTINE
 *  ADJUSTED     ±  opening balance / cycle-count fix / write-off / correction
 *  TRANSFERRED  ±  moved between locations (two rows: - at source, + at dest).
 *                  Used to grade returns: QUARANTINE -> MAIN (sellable) or
 *                  QUARANTINE -> DAMAGED.
 *  RESERVED     (reserved counter only) held for an unshipped order
 *  RELEASED     (reserved counter only) reservation cancelled
 */
export const MovementType = {
  PRODUCED: 'PRODUCED',
  SOLD: 'SOLD',
  RETURNED: 'RETURNED',
  ADJUSTED: 'ADJUSTED',
  TRANSFERRED: 'TRANSFERRED',
  RESERVED: 'RESERVED',
  RELEASED: 'RELEASED',
} as const;

export type MovementType = (typeof MovementType)[keyof typeof MovementType];

export const MOVEMENT_TYPES = Object.values(MovementType);

/** Sales channels we sell on. */
export const Channel = {
  AMAZON: 'AMAZON',
  FLIPKART: 'FLIPKART',
  MYNTRA: 'MYNTRA',
} as const;

export type Channel = (typeof Channel)[keyof typeof Channel];

export const CHANNELS = Object.values(Channel);

/** Where a sale/return happened — chosen in the simple Stock Log. */
export const PLATFORMS = ['AMAZON', 'FLIPKART', 'MYNTRA', 'OWN_SITE'] as const;
export type Platform = (typeof PLATFORMS)[number];
export const PLATFORM_LABELS: Record<Platform, string> = {
  AMAZON: 'Amazon',
  FLIPKART: 'Flipkart',
  MYNTRA: 'Myntra',
  OWN_SITE: 'Own Site',
};

/**
 * Bundle products that ship another SKU's physical stock. Keyed by SKU prefix:
 * a matching SKU keeps its own ledger entries (so its sales stay visible), but
 * every on-hand / reserved effect lands on the mapped SKU (same colour+size
 * suffix). RRC-012 "Halter with Palazzos" contains the RRC-002 Halter top —
 * shipping a set takes one halter from the halter pile.
 */
export const BUNDLE_STOCK_PREFIX: Record<string, string> = {
  'RRC-012-': 'RRC-002-',
};

/** The SKU whose physical stock a given SKU uses (itself unless it's a bundle). */
export function stockSkuFor(sku: string): string {
  for (const [prefix, target] of Object.entries(BUNDLE_STOCK_PREFIX)) {
    if (sku.startsWith(prefix)) return target + sku.slice(prefix.length);
  }
  return sku;
}

/**
 * Info-only companion stock shown next to a bundle in the ship queue (never
 * deducted): the palazzo for a RRC-012 set comes from the matching Co-ord Set,
 * so its count is displayed for reference.
 */
const BUNDLE_INFO_PREFIX: Record<string, { prefix: string; label: string }> = {
  'RRC-012-': { prefix: 'RRC-001-', label: 'Co-ord Set' },
};

/** Companion SKU + label to display for a bundle SKU, or null for normal SKUs. */
export function infoStockFor(sku: string): { sku: string; label: string } | null {
  for (const [from, info] of Object.entries(BUNDLE_INFO_PREFIX)) {
    if (sku.startsWith(from)) return { sku: info.prefix + sku.slice(from.length), label: info.label };
  }
  return null;
}

/** Special location codes the system relies on, plus normal warehouse codes. */
export const SystemLocation = {
  /** Main sellable warehouse stock. */
  MAIN: 'MAIN',
  /** Returns landed but not yet graded. */
  QUARANTINE: 'QUARANTINE',
  /** Graded-damaged / write-off stock. */
  DAMAGED: 'DAMAGED',
} as const;

export type SystemLocation = (typeof SystemLocation)[keyof typeof SystemLocation];
