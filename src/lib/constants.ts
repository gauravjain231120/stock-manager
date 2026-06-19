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
