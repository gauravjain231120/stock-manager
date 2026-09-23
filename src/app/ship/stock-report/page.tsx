import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { stockAfterQueue } from '@/lib/stockAfter';
import { PrintButton } from '@/components/PrintButton';
import { dateTime, dayKey, num } from '@/lib/format';

export const dynamic = 'force-dynamic';

// Chrome names the saved file after the document title, so put the date in it.
export async function generateMetadata() {
  return { title: `Rangrooh stock after Ready to Ship ${dayKey(new Date())}` };
}

const th = 'border-b-2 border-black/40 px-2 py-1.5 text-left font-semibold dark:border-white/40';
const thR = `${th} text-right`;
const td = 'border-b border-black/10 px-2 py-1 align-top dark:border-white/10';
const tdR = `${td} text-right tabular-nums`;

const tabCls = (on: boolean) =>
  `rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
    on
      ? 'border-brand-600 bg-brand-600 text-white'
      : 'border-black/15 text-neutral-600 hover:bg-black/5 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10'
  }`;

/**
 * The stock sheet: what's on the shelf now, what the Ready-to-Ship queue has
 * claimed, and what's left when it all goes out. Built to be printed — the
 * screen chrome carries `no-print`, so "Save as PDF" gives you the table and
 * nothing else.
 */
export default async function StockReportPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; print?: string }>;
}) {
  const sp = await searchParams;
  const onlyQueued = sp.scope === 'queued';
  const { rows, totals, unlisted } = await stockAfterQueue();
  const shown = onlyQueued ? rows.filter((r) => r.queued > 0) : rows;
  const generated = dateTime(new Date());

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 print:p-0">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/ship"
          className="flex items-center gap-1.5 rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-black/5 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10"
        >
          <ArrowLeft size={14} />
          Back to Ready to Ship
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/ship/stock-report" className={tabCls(!onlyQueued)}>
            All products ({rows.length})
          </Link>
          <Link href="/ship/stock-report?scope=queued" className={tabCls(onlyQueued)}>
            Only queued ({rows.filter((r) => r.queued > 0).length})
          </Link>
          <PrintButton auto={sp.print === '1'} />
        </div>
      </div>

      <div className="print-sheet">
        <header className="mb-4">
          <h1 className="text-xl font-bold">Stock after Ready to Ship</h1>
          <p className="text-sm text-neutral-500 print-muted">
            What each product is left with once every queued order has shipped ·{' '}
            {onlyQueued ? 'products with queued orders only' : 'all products'} · {generated}
          </p>
        </header>

        <p className="mb-4 text-sm print-muted">
          <strong>{num(totals.onHand)}</strong> in stock · <strong>{num(totals.queued)}</strong> claimed by the queue ·{' '}
          <strong>{num(totals.after)}</strong> left after shipping
          {totals.short > 0 ? (
            <>
              {' '}
              · <strong className="print-short text-red-600">{num(totals.short)} short</strong> across{' '}
              {totals.shortSkus} product{totals.shortSkus === 1 ? '' : 's'} — make these before the queue can go out
            </>
          ) : null}
        </p>

        <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className={th}>SKU</th>
              <th className={th}>Product</th>
              <th className={th}>Colour</th>
              <th className={th}>Size</th>
              <th className={thR}>In stock</th>
              <th className={thR}>In queue</th>
              <th className={thR}>Stock after</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.sku}>
                <td className={`${td} font-mono text-xs`}>{r.sku}</td>
                <td className={td}>
                  {r.name}
                  {r.shared ? (
                    <div className="text-[11px] text-neutral-500 print-muted">
                      ships {r.stockName ?? 'another product'} stock ({r.stockSku})
                    </div>
                  ) : null}
                </td>
                <td className={td}>{r.color || '—'}</td>
                <td className={td}>{r.size || '—'}</td>
                <td className={tdR}>{r.onHand}</td>
                <td className={tdR}>
                  {r.queued || '—'}
                  {r.shared && r.queued !== r.queuedOwn ? (
                    <div className="text-[11px] text-neutral-500 print-muted">{r.queuedOwn} of them this SKU</div>
                  ) : null}
                </td>
                <td className={`${tdR} font-semibold ${r.after < 0 ? 'print-short text-red-600' : ''}`}>
                  {r.after}
                  {r.after < 0 ? <div className="text-[11px] font-normal">make {-r.after}</div> : null}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-2 pt-2 text-xs font-semibold" colSpan={4}>
                Total ({shown.length} {shown.length === 1 ? 'product' : 'products'}, shared piles counted once)
              </td>
              <td className="px-2 pt-2 text-right text-xs font-semibold tabular-nums">{num(totals.onHand)}</td>
              <td className="px-2 pt-2 text-right text-xs font-semibold tabular-nums">{num(totals.queued)}</td>
              <td className="px-2 pt-2 text-right text-xs font-semibold tabular-nums">{num(totals.after)}</td>
            </tr>
          </tfoot>
        </table>
        </div>

        {shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-400">
            Nothing queued right now — switch to “All products” for the full stock sheet.
          </p>
        ) : null}

        <footer className="mt-4 space-y-1 text-[11px] text-neutral-500 print-muted">
          <p>
            Stock is sellable stock at MAIN — the pile the ship queue reserves against. Quarantined returns aren’t counted.
          </p>
          <p>
            Rows marked “ships … stock” are the same physical garments as the product they draw on, so the totals count
            each pile once rather than adding those rows twice.
          </p>
          {unlisted > 0 ? (
            <p className="print-short text-red-600">
              {unlisted} queued unit{unlisted === 1 ? '' : 's'} belong to products that are no longer active and are not
              listed above.
            </p>
          ) : null}
        </footer>
      </div>
    </main>
  );
}
