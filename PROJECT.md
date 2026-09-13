# Stock Manager — Deep Dive

Internal reference doc for this project — "everything you need to know to work on this without
re-discovering it." See `README.md` for quick-start.

## 1. What this project is for

Multichannel inventory/production/shipping management for Rangrooh, a manufacturing business
selling on Amazon, Flipkart, and Myntra, self-shipping every order. It is the single source of
truth for stock levels, and the operational tool for the day-to-day workflow: log production,
queue orders to ship, pack and ship them, and process returns.

**Important reality check (see §7 for full detail): the "automated multichannel sync" half of
this app — pulling orders/returns directly from marketplace APIs and pushing stock levels back —
is built but effectively dormant in production.** The actual live order flow today is entirely
via the sister **order-alert bot** project (`~/Desktop/myntra-order-alert-web`), which detects
new Myntra/Amazon orders itself and pushes them straight into this app's Ready-to-Ship queue
over HTTP. Don't assume `/orders`, `/reports`, or the marketplace adapters reflect real sales —
they mostly don't yet.

## 2. Stack

Next.js 16 (App Router), React 19, **Mongoose** (not the raw driver — unlike the sister
project), Zod for validation, Tailwind 4, `lucide-react` icons, `@vercel/blob` for backups,
deployed on Vercel at `stock-manager-niko.vercel.app`.

Mongoose transactions require a MongoDB **replica set** — Atlas always is one, but a bare local
`mongod` isn't. Local dev scripts spin up a single-node replica set on port 27018:
`npm run db:up` then `db:init` (see `package.json`; `db:status` to check). Nearly every write in
`stock.ts`/`shipping.ts` uses a transaction, so local writes will fail without this.

## 3. Data model (`src/models/`)

The stock/production/shipping core:

| Model | Key fields | Purpose |
|---|---|---|
| `ProductGroup` | `code` (unique — the SKU prefix), `name`, `category`, `colors[]`, `sizes[]`, `mrp`, `costPrice` | A parent "style"; variants are `code-COLOR-SIZE` |
| `Product` | `sku` (unique), `groupCode`, `attributes` (Map: size/color), `imageUrl`, `costPrice`, `mrp`, `active`, `sharesStockWith` (string\|null) | One row per real sellable SKU/variant. `sharesStockWith` replaces the old hardcoded bundle map — editable per-variant from the Products page, resolved via `stockSkuFor` (§4) |
| `SkuStock` | `(sku, locationCode)` unique compound, `onHand`, `reserved`, `buffer`; virtual `available = onHand - reserved` | Live stock cache, kept in sync with the ledger |
| `StockMovement` | `sku`, `locationCode`, `qty` (**signed**), `type`, `channel`, `refType/refId`, `orderId`, `trackingId`, `condition` | **Append-only ledger — the actual source of truth.** Never updated/deleted; corrections are compensating `ADJUSTED` rows |
| `Location` | `code` (unique), `kind` (`SELLABLE`\|`QUARANTINE`\|`DAMAGED`) | Only `SELLABLE` locations count toward publishable/available stock |
| `PendingShipment` | `sku`, `qty`, `channel`, `orderId`, `trackingId`, `buyer`, `ready`, `placedAt`, `shipByAt` | **The Ready-to-Ship queue** — this is what the sister order-alert bot writes into |
| `Bom` | `sku` (unique), `components[]` (`materialCode`, `qtyPerUnit`) | Bill of materials for production |
| `RawMaterial` | `code` (unique), `onHand`, `reorderPoint`, `costPerUnit` | A production input (fabric, zips, thread...) |
| `RawMaterialMovement` | `materialCode`, `qty` (signed), `type` (`PURCHASED`\|`CONSUMED`\|`ADJUSTED`) | Append-only ledger, mirrors StockMovement, for raw materials |
| `ProductionBatch` | `sku`, `qty`, `locationCode`, `materialsConsumed[]` | One manufacturing run — posts a PRODUCED movement + CONSUMED raw-material movements, one transaction |
| `ReorderPolicy` | `sku` (unique), `safetyStock`, `leadTimeDays` (default 7) | Drives the replenishment reorder-point formula |
| `Note` | `_id: 'main'`, `text` | A single free-text scratchpad shown on the Dashboard — no structure, just whatever's currently typed |

The multichannel-sync / automated-order half (dormant in production, §7):

| Model | Key fields | Purpose |
|---|---|---|
| `ChannelListing` | unique on `(channel, channelSku)` and `(sku, channel)` | Maps internal SKU ↔ one marketplace's own SKU/listing/price |
| `ChannelInventoryState` | `(channel, channelSku)`, `publishedQty`, `lastPushedAt`, `lastError` | Last stock qty actually pushed to that channel — drift-detection cache |
| `MarketplaceOrder` | unique `(channel, channelOrderId)`, `lines[]` (each with `issue`: `UNMAPPED`\|`INSUFFICIENT_STOCK`) | A normalized order from `ingestOrders` — **separate pipeline from PendingShipment**, not the live order path |
| `ReturnRecord` | unique `(channel, channelReturnId)`, `status` (`RECEIVED`\|`GRADED`) | Automated marketplace-adapter returns — separate from the manual `ReturnShipment` flow actually used |
| `SimulatedEvent` | `kind` (`ORDER`\|`RETURN`), `payload`, `consumed` | Fake order/return queue for the `SimulatorAdapter` (dev/testing) |
| `SyncState` | `key` (e.g. `"AMAZON:orders"`), `lastSyncAt` | Polling cursor for the adapter pipeline |

The manual returns workflow actually used day-to-day:

| Model | Key fields | Purpose |
|---|---|---|
| `ReturnShipment` | `trackingId` (unique), `sku`, `channel` (incl. `OWN_SITE`), `status` (`EXPECTED`\|`RECEIVED`), `condition` (`GOOD`\|`BAD`\|`WRONG`) | Log an expected return, then scan+grade it on arrival. `OVERDUE_DAYS = 14` |
| `ReturnReport` | `platform`, `reportDate`, `items[]` (`trackingId` globally unique index, `settled`) | A platform's own "these are coming back" report, reconciled against logged returns |

## 4. Core business logic (`src/lib/`)

**`constants.ts`** — the domain vocabulary. Exact values worth knowing:
- `Channel` (AMAZON/FLIPKART/MYNTRA — the sync pipeline) vs. the broader `PLATFORMS`
  (…+ `OWN_SITE` — used by Stock Log/Returns/PendingShipment's free-text channel field). Don't
  confuse the two enums.
- `MovementType`: PRODUCED/SOLD/RETURNED/ADJUSTED/TRANSFERRED (all real ledger rows) plus
  RESERVED/RELEASED (counter-only in practice — reservation today is inline `SkuStock.reserved`
  math, not its own ledger row).
- `SIZE_ORDER` sort helper; `STANDARD_SIZES = [XS..3XL]` (client-safe, pure array — used by the
  Products page's "also add sizes" chips); `MAX_TRACKING_LEN=20` + `normalizeTracking` (strip
  non-alnum, uppercase) so a scanned tracking number always matches a typed one.
- `infoStockFor(sku)` (still here, pure/no DB) — a **display-only** companion stock shown next to
  a bundle line, never actually deducted.
- **`BUNDLE_STOCK_PREFIX` no longer exists.** Bundle/shared-stock mapping used to be this
  hardcoded constant; it's now `Product.sharesStockWith` (DB field, editable per-variant from the
  Products page) resolved via **`lib/stockShare.ts`**'s `stockSkuFor(sku)` — see below. **The
  sister order-alert project's own duplicated copy (`BUNDLE_CODE_MAP` in its `lib/stock.js`) is
  now a static guess at what used to be a static source of truth — it is not automatically kept
  in sync with this DB field, and there is currently no code that reconciles them.** If sharing
  configuration changes on this side (adding/removing a shared-stock pairing via the Products
  page), the sister project's hardcoded map must still be updated by hand, or — better — that
  project should be changed to read `sharesStockWith` from its existing read-only DB connection
  instead of hardcoding it (see PROJECT.md's improvement list / ask the user).

**`stockShare.ts`** — `stockSkuFor(sku): Promise<string>`, the single place that resolves which
physical pile a SKU's stock actually lives in (itself, unless `sharesStockWith` points elsewhere;
follows chains, e.g. A→B→C resolves to C). Used by ~30 call sites across `stock.ts`,
`shipping.ts`, `register.ts`, `queries.ts`, `products.ts` — anywhere stock is read or written.
**Server-only on purpose**: it's kept out of `constants.ts` specifically so a `'use client'`
component importing `constants.ts` for pure exports (PLATFORMS etc.) never pulls Mongoose into
the browser bundle.
- 5-second in-memory cache (`loadStockShareMap`), invalidated explicitly
  (`invalidateStockShareCache()`) after any write to `sharesStockWith`.
- **Single-flight, not just cached** — a real bug found and fixed in production: a cache miss
  used to let *every* concurrent caller (e.g. all ~400+ products in one `Promise.all` on the
  Inventory/Register/Ship pages) independently kick off its own identical DB query before the
  first one returned, flooding Mongoose's connection pool (`maxPoolSize: 10` in `db.ts`) with
  hundreds of redundant queries and making those pages feel hung. Fixed by making a cache miss
  share one in-flight promise across all concurrent callers. **If a page ever feels slow again,
  check for this exact pattern first** (a `Promise.all(items.map(async i => ... await
  someCachedLookup(i) ...))` where the cache doesn't dedupe concurrent misses) before assuming
  it's a genuinely slow query.

**`stock.ts`** ("StockService") — **the only code allowed to mutate stock.** Every other module
goes through this:
- `postMovement` — the building block: one signed `StockMovement` row + `$inc` on the matching
  `SkuStock.onHand` (using `stockSkuFor`, so bundle sales ledger stays separate from where
  physical units actually move).
- `applyMovement` — wraps `postMovement` in its own transaction (PRODUCED/ADJUSTED/RETURNED/TRANSFERRED).
- `sellUnits` — the oversell guard: `findOneAndUpdate` with
  `$expr:{$gte:[{$subtract:['$onHand','$reserved']},qty]}`; throws `InsufficientStockError` and
  aborts the transaction if it fails. This is what makes two concurrent sales physically unable
  to both take the last unit.
- `transferStock` — atomic move between two locations (used by return grading: QUARANTINE→MAIN
  on GOOD, QUARANTINE→DAMAGED on BAD).
- `setStock` — manual physical-count correction (diffs and posts one ADJUSTED row).
- `reconcileFromLedger()` — recomputes onHand straight from the StockMovement ledger and diffs
  against the SkuStock cache. **The integrity-check tool** — run this if stock ever looks wrong;
  the ledger is truth, the cache can in principle drift.

**`shipping.ts`** — the full Ready-to-Ship lifecycle (this is the part the sister project talks
to over HTTP — never call these functions' underlying writes any other way from outside):
- `addPending({sku, qty, channel, orderId, trackingId, placedAt, shipByAt})` — reserves stock on
  `stockSkuFor(sku)`; **merges** into an existing row only on an exact `(sku, channel, orderId)`
  match — different customers buying the same SKU never merge, and rows without an `orderId`
  never merge either. If the exact SKU doesn't exist, falls back to matching by **suffix**
  (everything after the first `-`) so `RR-`/`R-`/`RRC-` are treated as the same brand prefix — a
  marketplace-listed SKU with an inconsistent prefix still resolves instead of failing with
  "Product not found."
- `reconcileReservedStock()` — recomputes every `SkuStock.reserved` from the actual sum of
  `PendingShipment.qty` per pool, correcting drift and creating any missing `SkuStock` doc.
  Exposed via `POST /api/stock/reconcile`. Written after `reserved` counters were found to have
  drifted on 19 SKUs with no audit trail (orphaned reservations) — run this if "on hand" and
  "available" ever disagree with what's actually in the queue.
- `listPending()` / `queueRows(pending)` — builds display rows with **FIFO stock allocation per
  physical pile** (`stockSku`): whoever queued first gets the stock; only the leftover is
  flagged `short`. **Must always run over the full unfiltered queue before narrowing by
  platform** — a garment's claim on stock can't depend on which tab happens to be open.
- `shipPending(id, qty?, trackingId?, orderId?)` — packs/ships (default: the whole row): posts a
  SOLD movement, decrements `reserved`, deletes the row on a full ship or reduces `qty` on a
  partial one (**and clears `trackingId`** on partial — the remainder needs its own label).
- `editPending(id, changes)` — fix sku/qty/channel/orderId/trackingId/**shipByAt** on a
  still-queued row; moves the reservation to the new `stockSkuFor` pool if a SKU edit crosses
  bundle pools. The queue's per-row Produce button was removed (producing more stock now happens
  from the Ready-to-Ship page's "To make" list only, individually or via "Produce all").
- `setPendingReady(id, ready)` — pure "packed & set aside" print-list flag, no stock effect.
- `cancelPending(id, qty?)` — releases the reservation by qty; full or partial; returns an
  `undo` payload so the UI can offer one-click re-add.
- `shipOrder(orderId, trackingId?)` — ships every queued line of one order as a single parcel.
- `shipSelectedPending(ids[])` / `shipAllPending(channel?)` — bulk-ship helpers.
- `findOrderIdUses(orderId)` — warns (doesn't block) if an order number is already queued or
  already shipped — the dup-check the manual add-form and the sister project's own
  `alreadyTracked()` both call via `GET /api/pending/check`.

**`stockAfter.ts`** — `stockAfterQueue()`: "what's left after the whole queue ships," computed
**per physical pile** so a bundle and its component report identical numbers and aren't
double-counted. Flags `unlisted` queued stock against SKUs with no active product (e.g. a
retired variant still sitting in the queue).

**`products.ts`** — Product/ProductGroup CRUD. Notable: `removeVariant` **hard-deletes** that
SKU's SkuStock/StockMovement/ChannelListing/ChannelInventoryState history (also now refuses if
another variant's `sharesStockWith` points at it — deleting the target would leave that variant's
stock resolving nowhere); `renameVariantSku` propagates the rename across **11 collections**
(PendingShipment, MarketplaceOrder, ReturnRecord, ReturnShipment, ProductionBatch, Bom,
ReorderPolicy, and more, including now `Product.sharesStockWith` pointers) via separate
`updateMany` calls — **not wrapped in one transaction**, so a mid-operation failure could leave
some collections renamed and others not. Same caveat likely applies to `deleteProductGroup`.
- `editVariantAttributes(sku, {color, size})` — edits colour/size (not the SKU string itself),
  keeping the parent group's colour/size dropdown lists in sync.
- `setSharesStockWith(sku, targetSku|null)` — points a variant at another SKU's physical pile, or
  clears it back to its own. Chains are allowed (any number of variants pointing through each
  other, `stockSkuFor` follows the whole chain); only an actual loop is blocked.
- `setSharesStockWithForColorGroup(sku, targetSku)` — applies the above to every sibling size of
  the same colour in one call, size-swapping the target SKU per sibling; sizes with no matching
  target are skipped and reported back, not failed.
- `addVariantsForColor(code, {color, size, sku, openingQty, extraSizes})` — creates one variant,
  then loops `extraSizes`, swapping the given SKU's size segment per size — the "add colour, tick
  the sizes you want, one SKU auto-fills the rest" flow on the Products page.
- `listProductOptions()` — flat `{sku, name, color, size}[]` of every active product, used to
  populate the searchable SKU picker when reassigning a return to a different product.

**`variants.ts`** — `variantMeta(product, groupName?)`: shared picker-field helper (color/size/
image) used by both the Stock Log and Ready-to-Ship "+Add" forms.

**`orders.ts` + `lib/marketplace/*`** — the automated multichannel pipeline. See §7 for why this
is dormant in production. Structure: `types.ts` defines the `MarketplaceAdapter` contract
(`isConfigured`, `pullOrders`, `pullReturns`, `pushStock`); `registry.ts`'s `getAdapter(channel)`
returns the `SimulatorAdapter` unless `MARKETPLACE_MODE=live` **and** the real adapter reports
configured; `amazon.ts`/`flipkart.ts`/`myntra.ts` are **unimplemented skeletons** (every method
throws `"...not implemented"`); `simulator.ts` sources fake orders/returns from the
`SimulatedEvent` queue for testing. `ingestOrders(channel)` is idempotent on
`(channel, channelOrderId)`, resolves each line's `ChannelListing`, then calls `sellUnits`
directly (**no Ready-to-Ship staging** — this is a completely different write path from how real
orders flow today) — unmapped SKUs or oversells mark the line/order as `NEEDS_STOCK` rather than
silently dropping it.

**`replenishment.ts`** — `reorderPoint = avgDailySales(SOLD movements) × leadTimeDays +
safetyStock` (defaults: 7-day lead, 0 safety stock without a `ReorderPolicy` row).

**`production.ts`** — `receiveRawMaterial` (+onHand, PURCHASED ledger row); creating a
`ProductionBatch` consumes BOM materials (CONSUMED rows, guarded by
`InsufficientMaterialError`) and posts one PRODUCED finished-goods movement, all in one
transaction.

**`returns.ts`** — the automated marketplace-adapter return pipeline (`ingestReturns`, idempotent
on `channel+channelReturnId`): landed units go to QUARANTINE, creates a `ReturnRecord`.

**`returnShipments.ts`** — **the manual returns workflow actually used**: log an `EXPECTED`
return by tracking ID, then scan-and-grade on arrival — `GOOD` → sellable stock via
`transferStock`, `BAD` → DAMAGED location, `WRONG` → no stock added. Tracking IDs are normalized
so a barcode scan always matches whatever was typed when logging it.

**`returnReports.ts`** — reconciles a platform's own "these parcels are coming back" report
against logged returns (exact match, or partial match if ≥8 chars). Tracking numbers are
**globally unique across all saved reports** (DB-enforced) — a clear `DUPLICATE_MESSAGE` error
surfaces instead of a raw Mongo duplicate-key error.

**`register.ts`** ("Stock Log") — the simplest recording UI: PRODUCE (+stock)/SHIP (-stock, via
`sellUnits`, refused if insufficient)/RETURN (+stock). An exchange is logged as one Return + one
Ship entry. Only PRODUCED/SOLD/RETURNED show in "All entries" (opening-balance ADJUSTED rows are
hidden); PRODUCED/SOLD/RETURNED/ADJUSTED are editable/deletable from the log.
- `deleteEntry`/`restoreEntry` — delete-with-undo, now also exposed from the Shipped and Returns
  list pages (`MovementTable`'s Delete column), not just the Stock Log itself.
- `editEntry` accepts an optional `sku` — **only on a RETURNED row** — to reassign a return to a
  different product, moving the whole quantity off the old product's pile onto the new one's. The
  UI picks the new SKU from a searchable dropdown (`SearchableSelect` + `listProductOptions()`),
  and the dialog's header re-derives from whichever SKU is currently selected instead of staying
  pinned to the row's original product.
- `registerTotals(range?: {from?, to?})` — per-product shipped/produced/returned totals; `range`
  narrows shipped/returned/produced to that window (used by the Inventory page's date filter).
  **On-hand/available are never date-filtered** — they're the current physical count, not a
  historical quantity, so they ignore `range` entirely.

**`movements.ts`** — powers the Shipped/Returns list pages; resolves product name/color/size per
ledger row; "today" is pinned to India time for the day-picker default.

**`reports.ts`** — `reportBundle(days)`: sales-by-channel/revenue, fast/slow movers,
damaged-by-SKU, return rate. **Sourced from `MarketplaceOrder` (the dormant automated-ingest
pipeline's data) — not from Stock Log or Ready-to-Ship.** In the current live setup this means
`/reports` and `/orders` will show little to no real data. Flag this to the user if they ever
expect these pages to reflect actual sales.

**`sync.ts`** — the channel stock-push engine: `publishableQty = max(0, sellableAvailable -
buffer)` (deliberately pushes *less* than true stock, never more — the safe direction against
overselling), pushes to every `ChannelListing` a SKU has via its adapter's `pushStock`.

**`cron.ts`** — `isAuthorizedCron()` checks `Authorization: Bearer $CRON_SECRET`; **if
`CRON_SECRET` is unset, it always returns true.** Confirm this env var is actually set in the
Vercel project — leaving it unset makes `/api/cron/poll` (and part of `/api/backup`'s guard)
wide open.

**`csv.ts`** — Excel-safe export: forces long digit strings (order/tracking numbers) into
literal-text cells so Excel doesn't mangle them as scientific notation; prepends a UTF-8 BOM.

**`db.ts`** — `connectDB()` caches the Mongoose connection (and in-flight connect promise) on
`globalThis` to survive warm Lambda invocations; `bufferCommands:false` (fail fast rather than
silently queue while disconnected), `connectTimeoutMS`/`serverSelectionTimeoutMS: 8000` (fail
inside Vercel's function time limit instead of hanging).

**`format.ts`** — `inr`/`num` (en-IN formatting), `dateTime`/`dateOnly`/`dayKey` all explicitly
pinned to `Asia/Kolkata` (never rely on server-local time for "today").

## 5. API surface (`src/app/api/`)

| Route | Methods | Purpose |
|---|---|---|
| `/api/backup` | GET | Dumps every collection to JSON (Vercel Blob in prod, local `backups/` folder in dev); guarded by CRON_SECRET bearer OR the `auth` cookie OR (dev-only, no secret set) always-allow. Prunes blobs >30 days old. |
| `/api/bom` | GET, PUT | Read/set a SKU's bill of materials |
| `/api/channel-listings` | GET, POST | List / create SKU↔marketplace listing mappings |
| `/api/cron/poll` | GET, POST | Runs the full `ingestAllOrders` + `ingestAllReturns` + `syncAll` cycle. **Not wired to any scheduler in `vercel.json`** (§7) |
| `/api/health` | GET | Basic healthcheck |
| `/api/login` | POST | Sets the `auth` cookie |
| `/api/logout` | POST | Clears the `auth` cookie |
| `/api/notes` | GET, PATCH | Read/replace the Dashboard's free-text scratchpad (`Note` model) |
| `/api/orders` | GET | Recent `MarketplaceOrder` history (automated-pipeline data only) |
| `/api/orders/ingest` | POST | Manually trigger `ingestAllOrders` |
| `/api/orders/simulate` | POST | Seed a fake order via the SimulatedEvent queue |
| **`/api/pending`** | GET, POST | GET → `{count}` only. **POST → `addPending` — the endpoint the sister order-alert bot calls for every new order** |
| **`/api/pending/[id]`** | POST, PATCH, PUT, DELETE | ship / edit / ready-toggle / cancel (optional partial qty) |
| **`/api/pending/check`** | GET | `?orderId=` → where that order number is already queued/shipped — the sister project's idempotency check |
| `/api/pending/ship-all` | POST | Ship the whole queue (optionally one channel) |
| `/api/pending/ship-order` | POST | Ship every line of one order as one parcel |
| `/api/pending/ship-selected` | POST | Ship a chosen set of queue row ids |
| `/api/production` | GET, POST | List / create production batches |
| `/api/products` | GET, POST | Product groups with per-variant stock / create a group |
| `/api/products/[code]` | PATCH, DELETE | Edit / delete a product group |
| `/api/products/[code]/variant` | PATCH, POST, DELETE | PATCH handles `newSku` (rename), `color`/`size` (attributes), and `sharesStockWith`/`applyToColorGroup` (stock sharing) in one request, applied in that order. POST handles a single variant or, with `extraSizes[]`, a whole batch of sizes at once. DELETE removes one variant (refused if something shares its stock) |
| `/api/raw-materials` | GET, POST | List / create raw materials |
| `/api/raw-materials/receive` | POST | Receive stock from a supplier |
| `/api/register` | POST | Record one Stock Log entry |
| `/api/register/[id]` | PATCH, DELETE | Edit / delete a Stock Log entry |
| `/api/register/restore` | POST | Undo a just-deleted Stock Log entry |
| `/api/replenishment` | GET, POST | Reorder suggestions / upsert a ReorderPolicy |
| `/api/reports` | GET | `?days=30` sales/returns/movers bundle |
| `/api/return-reports` | POST | Save a platform's return report |
| `/api/return-reports/[id]` | PATCH, DELETE | Edit / delete a saved report |
| `/api/return-shipments` | GET, POST | Outstanding-parcel count / log an EXPECTED return |
| `/api/return-shipments/[id]` | POST, PATCH, DELETE | Grade/receive, edit, delete |
| `/api/return-shipments/scan` | POST | `{trackingId}` → matching parcel or 404 (scan-to-grade flow) |
| `/api/returns` | GET | `?status=RECEIVED|GRADED` list |
| `/api/returns/grade` | POST | Grade a `ReturnRecord` (automated pipeline) |
| `/api/returns/ingest` | POST | Pull returns from all channels into QUARANTINE |
| `/api/returns/simulate` | POST | Seed a fake return |
| `/api/skus` | GET, POST | Flat SKU list/lookup + create |
| `/api/stock` | GET, PATCH | Read stock / manually set on-hand |
| `/api/stock/reconcile` | POST | Recompute every `SkuStock.reserved` from actual `PendingShipment` sums, fixing drift |
| `/api/sync` | GET, POST | What's last published per channel / trigger a full resync |
| `/api/upload` | POST | Product image upload |

## 6. Pages (`src/app/`)

**Sidebar nav (day-to-day use)**: `/register` "Stock Log", `/ship` "Ready to Ship" (queue,
pack/ship, ship-by filter, "To make" list with per-item and "Produce all" buttons),
`/shipped`/`/returns` (SOLD/RETURNED ledgers — both support delete-with-undo; Returns also
supports reassigning a return to a different product), `/products` (manage groups/variants/
photos/stock-sharing), `/inventory` (stock levels — category filter reveals a colour filter
scoped to that category, plus a from/to date range that narrows Shipped/Returned only; on-hand/
available always show the current count), `/produce` (create a production batch).

- `/inventory/print` — printable inventory sheet (one category per page, two colour-tables per
  row), reachable from Inventory's Print button; carries the same category/colour filter as
  `&category=`/`&color=` query params.
- The Shipped, Returns, Stock Log, and Inventory pages all hide their headline numbers behind a
  "Show numbers" toggle by default (`RevealableStats` — pure client state, no request either way)
  — every fresh page load starts hidden.
- The Dashboard has a free-text Notes scratchpad (`NotesPanel` / `Note` model) at the bottom —
  no structure, just whatever's typed, saved on demand.

**Reachable by direct URL, not in the sidebar** (secondary/dev tools): `/dashboard`, `/orders`
(MarketplaceOrder history — automated pipeline), `/channels` (ChannelListing management),
`/replenishment`, `/reports`, `/production` (batch history, distinct from `/produce`),
`/returns/marketplace` (automated ReturnRecord grading, separate from `/returns`),
`/ship/queue-print` (printable queue sheet), `/ship/stock-report` (printable post-queue PDF),
`/login`, home `/`.

## 7. Known constraints & gotchas — read before assuming automated sync works

- **The automated multichannel pipeline is effectively dormant in production.**
  `vercel.json` only schedules `/api/backup` (daily 20:30 UTC / 02:00 IST) —
  **`/api/cron/poll` has no scheduler wired to it at all.** `MARKETPLACE_MODE` defaults to
  `simulate`, and all three real adapters (`amazon.ts`/`flipkart.ts`/`myntra.ts`) are
  unimplemented skeletons that throw on every call. So even if `/api/cron/poll` were called,
  `getAdapter()` would fall back to the `SimulatorAdapter`, which only processes fake
  `SimulatedEvent` queue data.
  - **Practical consequence**: `/api/reports` and the `/orders` page read from
    `MarketplaceOrder`, which real orders never populate — expect them to show little/no real
    data. **Real orders flow entirely through the sister order-alert bot → `POST /api/pending`
    → the Ready-to-Ship queue** (§8), a completely separate path from this dormant pipeline.
- **Auth is a single shared fixed-secret cookie, not a signed session.**
  `middleware.ts` does a plain string `===` against `TOKEN = AUTH_TOKEN env, or the hardcoded
  fallback 'rangrooh-stock-authed-9c4458'` — no signature, no per-user distinction, no
  server-side revocation beyond the cookie's own 60-day expiry. `AUTH_USERNAME`/`AUTH_PASSWORD`
  also fall back to hardcoded defaults (`rangrooh` / `rangrooh@123`) if unset. **Confirm
  `AUTH_TOKEN`, `AUTH_USERNAME`, `AUTH_PASSWORD`, and `CRON_SECRET` are all actually set in the
  Vercel project's env vars** — if any are left unset, that endpoint's protection silently
  degrades to a hardcoded default or an always-allow.
- **Multi-collection operations that aren't wrapped in one transaction**: `renameVariantSku`
  touches 11 collections via separate `updateMany` calls; `removeVariant`/`deleteProductGroup`
  are similarly multi-step. A crash mid-operation could leave things partially updated. Worth
  wrapping in a session/transaction if this ever becomes a real pain point.
- **Local dev needs a replica set.** Plain local `mongod` will fail almost every write in
  `stock.ts`/`shipping.ts` (they use `mongoose.startSession()` transactions, which require a
  replica set — Atlas always is one). Run `npm run db:up && npm run db:init` first.
- **`removeVariant` hard-deletes history** (SkuStock/StockMovement/ChannelListing/
  ChannelInventoryState) for that SKU — there is no undo.

## 8. Integration boundary with the sister order-alert project

`~/Desktop/myntra-order-alert-web` is a separate Next.js app that detects new Myntra/Amazon
orders (via unofficial session-replay polling) and alerts on Telegram. It pushes every detected
order into **this** app's Ready-to-Ship queue over plain HTTP — it never touches this
codebase or database directly.

- Auth: it sends `Cookie: auth=<STOCK_MANAGER_AUTH_TOKEN>` on every call. That value must be the
  **exact same string** as this app's `AUTH_TOKEN` (or the hardcoded fallback if `AUTH_TOKEN` is
  unset here) — `middleware.ts` compares it with plain `===`, nothing fancier.
- It only ever calls two endpoints: `GET /api/pending/check?orderId=` (dup-check before adding)
  and `POST /api/pending` (`addPending`).
- It **never** touches `/api/cron/poll`, `/api/orders/ingest`, or anything in the
  marketplace-adapter pipeline. **The two order systems are completely independent and never
  need to reconcile** — the sister bot is a self-contained "detect → push to Ready to Ship"
  path that bypasses the dormant `ingestOrders`/`MarketplaceOrder`/`sellUnits` pipeline entirely.
- `addPending`'s merge rule — same `(sku, channel, orderId)` triple merges quantity into one row,
  anything else creates a new row — is exactly why the sister bot must aggregate an order's line
  items by SKU (summing quantities) **before** calling this API. If it ever calls `addPending`
  once per raw physical unit instead of once per unique SKU with the correct total qty, the
  first call reserves correctly but a naive dup-check on the caller's side can incorrectly block
  the second call instead of letting it merge — this exact bug happened once and was fixed on
  the sister project's side (see that project's `PROJECT.md` §12), not here.
- **Stock-sharing is now DB-driven here (`Product.sharesStockWith`, §4), but the sister
  project still hardcodes its own guess** (`BUNDLE_CODE_MAP` in its `lib/stock.js`). These two are
  no longer generated from the same source and nothing keeps them in sync — if sharing is
  reconfigured on this side (e.g. via the Products page), the sister project's hardcoded map goes
  stale silently. Worth fixing properly on that side (it already has read-only access to this
  app's DB via `STOCK_MONGODB_URI` — it could just read `sharesStockWith` directly instead of
  hardcoding).

## 9. File map

```
src/models/           one file per Mongoose model (§3)
src/lib/
  db.ts                 Mongoose connection caching + transaction sessions
  constants.ts           PLATFORMS/CHANNELS, MovementType, STANDARD_SIZES, etc. — client-safe, no DB (§4)
  stockShare.ts           stockSkuFor() — DB-backed, single-flight-cached stock-sharing resolution (§4)
  stock.ts                StockService — the only code allowed to mutate stock (§4)
  shipping.ts             Ready-to-Ship queue lifecycle — the sister project's integration surface (§4, §8)
  stockAfter.ts           "what's left after the queue ships" projections
  products.ts             Product/ProductGroup CRUD, SKU rename/remove
  variants.ts             shared variant-picker field helpers
  orders.ts               ingestOrders — the automated (dormant) order pipeline
  marketplace/            per-channel adapters (amazon/flipkart/myntra — unimplemented), registry, simulator, types
  replenishment.ts         reorder-point suggestions
  production.ts            raw material receiving + production batches
  returns.ts               automated marketplace-adapter returns (dormant path)
  returnShipments.ts        the manual returns workflow actually used
  returnReports.ts          platform return-report reconciliation
  register.ts               "Stock Log" — Produce/Ship/Return manual entries
  movements.ts               Shipped/Returns list-page data
  reports.ts                 sales/returns dashboard bundle (sourced from the dormant pipeline's data)
  sync.ts                    channel stock-push engine
  cron.ts                    isAuthorizedCron() bearer-token check
  csv.ts                     Excel-safe CSV export
  format.ts                  IST-pinned date/number formatting
  notes.ts                   the Dashboard scratchpad's read/write (§3)
src/app/
  api/                    one folder per route (§5)
  register|ship|shipped|returns|products|inventory|produce/   sidebar pages (§6)
  dashboard|orders|channels|replenishment|reports|production|returns/marketplace|ship/queue-print|ship/stock-report|login/   non-sidebar pages (§6)
middleware.ts             the `auth` cookie gate on every route except login/logout/backup (§7)
vercel.json                only schedules /api/backup — no cron for the marketplace pipeline (§7)
```

## 10. Deployment workflow

1. Test locally first (`npm run db:up && npm run db:init` if it's a fresh checkout, then
   `npm run dev`). Nearly every write path is transactional and will fail without the local
   replica set running.
2. `npm run build` must succeed before pushing.
3. Commit, `git push origin main` → `https://github.com/gauravbhandari23/stock-manager.git`.
4. Vercel auto-deploys on push to the `stock-manager-niko` project.
5. If a change touches the `/api/pending*` routes, verify the sister order-alert project's
   integration still works end to end (its `PROJECT.md` §16 has its own test workflow) — that's
   the one external caller with zero visibility into this app's internals.
