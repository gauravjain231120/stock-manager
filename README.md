# Stock Manager

Multichannel inventory management for an in-house manufacturer selling on **Amazon, Flipkart, and Myntra** (self-ship). One app is the single source of truth for stock; it answers **how many made / sold / returned / left** and keeps channels in sync so you never oversell.

**Stack:** Next.js 16 (React + API routes) · MongoDB (Mongoose) · TypeScript · Tailwind. Deploys as **one app on Vercel**; MongoDB Atlas in production.

> Full architecture & phase roadmap: `~/.claude/plans/ok-so-i-am-distributed-wren.md`

---

## The core idea: an immutable stock ledger

Stock is **not** a single editable number. Every change is an append-only row in `stock_movement` (`src/models/StockMovement.ts`). Current stock = the running sum. This makes the numbers auditable and answers made/sold/returned for free.

- `SkuStock` (`src/models/SkuStock.ts`) is a fast live cache of on-hand per (SKU, location).
- The cache is kept exactly in step with the ledger by writing both **inside one MongoDB transaction** (`applyMovement` / `sellUnits` in `src/lib/stock.ts`).
- Sales use an **atomic guarded decrement** (`onHand - reserved >= qty`) so two simultaneous orders can never both grab the last unit. This is why we run MongoDB as a **replica set** (transactions require it).

---

## Local setup

Requires Node 20+ and MongoDB 6+ installed locally (`mongod`, `mongosh`).

```bash
npm install

# 1. Start the dev database (single-node replica set on :27018). Leave running.
npm run db:up        # in its own terminal
npm run db:init      # one-time: initialise the replica set

# 2. Seed locations + sample SKUs and opening stock
npm run import       # or: npm run import -- path/to/your.csv

# 3. Prove the foundation works (production/sale/anti-oversell/ledger-sync)
npm run verify

# 4. Run the app
npm run dev          # http://localhost:3000
```

Config is in `.env.local` (`MONGODB_URI`). See `.env.example` for the Atlas string to use on Vercel.

### Import CSV format

`data/sample-skus.csv` shows the columns:

```
sku, name, size, color, category, costPrice, mrp, openingQty, locationCode
```

`openingQty` seeds your current physical count as an opening-balance `ADJUSTED` movement. Re-running `import` is safe (products upsert; each opening balance posts at most once).

---

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build (what Vercel runs) |
| `npm run db:up` | Start the local replica-set MongoDB on :27018 |
| `npm run db:init` | Initialise the replica set (one time) |
| `npm run db:status` | Print replica-set member state |
| `npm run setup:locations` | Create the system locations (MAIN / QUARANTINE / DAMAGED) |
| `npm run import` | Import SKUs + opening stock from CSV |
| `npm run seed:demo` | Add demo materials, BOMs, channel mappings, reorder policies |
| `npm run verify` | Phase 0 acceptance test (ledger + anti-oversell) |
| `npm run verify:e2e` | Full pipeline test across all phases |

## API (Route Handlers)

| Route | Purpose |
|---|---|
| `GET /api/health` | DB connectivity check |
| `GET /api/stock` | Inventory overview (summary + per-SKU rows) |
| `GET /api/skus` | List products |
| `POST /api/skus` | Create a SKU (optional opening stock) |

---

## Project layout

```
src/
  lib/
    constants.ts   movement types, channels, system locations
    db.ts          serverless-safe cached Mongoose connection
    stock.ts       StockService — the only thing that changes stock
    queries.ts     read queries for the dashboard/API
  models/          Product, Location, ChannelListing, SkuStock, StockMovement
  app/
    page.tsx       dashboard (server component, live from the ledger)
    api/           route handlers
scripts/           setup-locations, import, verify-phase0
data/              sample CSV
```

## Status — all phases built, but see the caveat below

> **Reality check**: the automated multichannel sync described below (Phases 2–4) is built but
> **not actually wired up in production** — no scheduler calls `/api/cron/poll`, and the real
> Amazon/Flipkart/Myntra adapters are unimplemented skeletons. Real orders today flow entirely
> through a separate sister project (`myntra-order-alert-web`) straight into the Ready-to-Ship
> queue over HTTP. See `PROJECT.md` §7 for the full detail before assuming `/orders`/`/reports`
> reflect real sales.

- **Phase 0** Single source of truth: schemas, ledger engine, import, dashboard.
- **Phase 1** Manufacturing: raw materials, BOM, production batches (`PRODUCED`).
- **Phase 2–3** Order ingestion via a common `MarketplaceAdapter` (Amazon/Flipkart/Myntra) → auto `SOLD`.
- **Phase 4** Stock sync engine: publishable = available − buffer, auto-resync after every stock change.
- **Phase 5** Returns & damage grading (QUARANTINE → sellable/damaged).
- **Phase 6** Replenishment (reorder points, suggested production) + reports.

Verified by `npm run verify` (8 checks) and `npm run verify:e2e` (21 checks across all phases).

### Simulated vs. live marketplaces

Out of the box `MARKETPLACE_MODE=simulate` uses a built-in **channel simulator** so the whole pipeline runs with **no credentials**. To go live, set `MARKETPLACE_MODE=live` and add a channel's credentials (see `.env.example`); the registry uses the real adapter once configured and falls back to the simulator otherwise. The real adapters in `src/lib/marketplace/{amazon,flipkart,myntra}.ts` are documented skeletons — fill in the API calls. **Myntra is hardest (PPMP / Increff / Unicommerce) — do it last.**

### Background jobs on Vercel

`vercel.json` schedules `GET /api/cron/poll` (every 15 min) to pull orders/returns and resync — the serverless-native replacement for always-on workers. Set `CRON_SECRET` in Vercel to protect it. For per-SKU durable retries at high volume, move the resync onto **Inngest/QStash** later (the resync already runs synchronously after each sale, so this is an enhancement, not a correctness fix).

## Pages

The nav is split into **Everyday** (Stock Log · Products · Inventory) and **Advanced** (Dashboard · Production · Channels · Orders · Returns grading · Replenishment · Reports).

### Stock Log — the simple everyday flow

`/register` is the easy day-to-day screen: pick a product, choose **Produce / Ship / Return / Exchange**, type a quantity. Stock updates automatically and a per-product table shows the four totals + current stock. Produce `+`, Ship `−` (refused if not enough stock), Return `+`, Exchange = net-zero (counted only). Everything else (channels, sync, reports) stays available under Advanced but you don't need it for basic stock keeping. Try **Simulate sales → Process orders** on the Dashboard to watch stock drop and channels resync.

### Products (add with photo + size/colour variants)

The **Products** page lets you add a product visually: name, category, price, a **photo** (upload a file or paste a URL), and its **colours + sizes**. It auto-creates one tracked SKU per colour×size combination (e.g. `POLO-BLACK-M`) with opening stock, and shows a product grid with photos and per-variant stock. Image uploads use local disk in dev and **Vercel Blob** in production (set `BLOB_READ_WRITE_TOKEN`). Existing CSV-imported SKUs still work and appear in Inventory.

## Recent Updates (Oct 2026)
- **Products UI Redesign**: The `/products` page has been redesigned. Replaced vertical CSS masonry grids with full-width horizontal cards.
- **Bulk Inline Editing**: Built a strict CSS-Grid based inline bulk variant editor inside `ProductCard.tsx` that lets you instantly edit SKU names, colors, sizes, and shared-stock mappings for all variants at once without side-scrolling overflow.
- **Ship Queue UI**: Added exact item counts to the Category and Colour filtering dropdowns (e.g., `Coord set (12)`) in the Ready-to-Ship Queue.
