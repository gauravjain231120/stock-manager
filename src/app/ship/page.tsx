import { listPending, shipProducts } from '@/lib/shipping';
import { PageHeader, StatCard } from '@/components/ui';
import { AddPendingForm } from '@/components/AddPendingForm';
import { ShipQueue } from '@/components/ShipQueue';
import { ToMakeTable } from '@/components/ToMakeTable';
import { num } from '@/lib/format';
import { PLATFORMS, PLATFORM_LABELS, Platform } from '@/lib/constants';

export const dynamic = 'force-dynamic';

function platformLabel(c?: string | null) {
  if (!c) return '—';
  return PLATFORM_LABELS[c as Platform] ?? c;
}

export default async function ShipPage({ searchParams }: { searchParams: Promise<{ platform?: string }> }) {
  const [pending, products] = await Promise.all([listPending(), shipProducts()]);
  const units = pending.reduce((a, p) => a + p.qty, 0);
  // Total queued units per PHYSICAL stock pool — a product can appear on >1 row
  // (different platforms), and a bundle draws from its component's pool, so
  // "After ship" reflects what's left once ALL queued units of that pool ship.
  const queuedBySku = new Map<string, number>();
  for (const p of pending) queuedBySku.set(p.stockSku, (queuedBySku.get(p.stockSku) ?? 0) + p.qty);

  // Orders/units waiting per platform, busiest first.
  const perPlatform = new Map<string, { orders: number; units: number }>();
  for (const p of pending) {
    const key = p.channel ?? '';
    const e = perPlatform.get(key) ?? { orders: 0, units: 0 };
    e.orders += 1;
    e.units += p.qty;
    perPlatform.set(key, e);
  }
  const platformStats = [...perPlatform.entries()].sort((a, b) => b[1].units - a[1].units);

  // The sewing list: per physical pile, what the whole queue needs minus what's
  // on hand. Deliberately built from `pending` rather than the filtered view —
  // production is production, and hiding a shortfall behind a platform filter is
  // how an order misses its ship-by date.
  const nameBySku = new Map(products.map((p) => [p.sku, p.name]));
  const onHandByStockSku = new Map(pending.map((p) => [p.stockSku, p.onHand]));
  const toMake = [...queuedBySku.entries()]
    .map(([stockSku, needed]) => {
      const onHand = onHandByStockSku.get(stockSku) ?? 0;
      return { stockSku, name: nameBySku.get(stockSku) ?? stockSku, onHand, needed, make: needed - onHand };
    })
    .filter((m) => m.make > 0)
    .sort((a, b) => b.make - a.make || a.name.localeCompare(b.name));
  const makeUnits = toMake.reduce((a, m) => a + m.make, 0);

  // Optional platform filter (?platform=AMAZON). Narrows only the visible queue.
  const sp = await searchParams;
  const platform = PLATFORMS.includes(sp.platform as Platform) ? (sp.platform as Platform) : null;
  const shown = platform ? pending.filter((p) => p.channel === platform) : pending;
  const rows = shown.map((p) => ({
    id: p.id,
    sku: p.sku,
    stockSku: p.stockSku,
    name: p.name,
    category: p.category,
    qty: p.qty,
    channel: p.channel,
    onHand: p.onHand,
    info: p.info,
    orderId: p.orderId,
    trackingId: p.trackingId,
    after: p.onHand - (queuedBySku.get(p.stockSku) ?? p.qty),
    short: (queuedBySku.get(p.stockSku) ?? 0) > p.onHand,
  }));

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title="Ready to Ship" subtitle="Add each order as it comes in; hit Ship when you pack it. Stock is reserved until shipped." />

      <div className="mb-6">
        <AddPendingForm products={products} />
      </div>

      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Orders to pack" value={pending.length} tone={pending.length ? 'warn' : 'good'} />
        <StatCard label="Units to ship" value={num(units)} />
        <StatCard
          label="Units to make"
          value={num(makeUnits)}
          hint={`${toMake.length} item${toMake.length === 1 ? '' : 's'}`}
          tone={makeUnits ? 'danger' : 'good'}
        />
        {platformStats.map(([channel, s]) => (
          <StatCard
            key={channel || 'none'}
            label={platformLabel(channel || null)}
            value={num(s.units)}
            hint={`${s.orders} order${s.orders === 1 ? '' : 's'}`}
          />
        ))}
      </section>

      <ShipQueue
        rows={rows}
        totalCount={pending.length}
        platform={platform}
        products={products.map((p) => ({ sku: p.sku, name: p.name }))}
      />

      {pending.length === 0 ? (
        <p className="mt-3 px-1 text-xs text-neutral-400">Nothing to pack right now. Add an order above as soon as it comes in. ✨</p>
      ) : platform && rows.length === 0 ? (
        <p className="mt-3 px-1 text-xs text-neutral-400">No {PLATFORM_LABELS[platform]} orders in the queue — switch the filter to “All platforms”.</p>
      ) : null}

      {pending.length > 0 ? (
        <div className="mt-6">
          <ToMakeTable rows={toMake} />
        </div>
      ) : null}
    </main>
  );
}
