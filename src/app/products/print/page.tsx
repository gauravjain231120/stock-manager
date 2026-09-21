import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getProductGroups } from '@/lib/products';
import { PrintButton } from '@/components/PrintButton';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Rangrooh Product SKUs' };

const th = 'border border-black px-2 py-1 text-left font-semibold';
const td = 'border border-black px-2 py-1 align-top';

/**
 * Every product's name + one real variant SKU (any single colour/size —
 * group.code is just an internal group id, not an actual trackable SKU),
 * one row each, on one printable sheet — no per-product buttons, just this
 * one page for the whole catalog. Screen chrome carries `no-print`, same
 * pattern as the other print pages (§ /ship/queue-print, /inventory/print).
 */
export default async function ProductSkuPrintPage({ searchParams }: { searchParams: Promise<{ print?: string }> }) {
  const sp = await searchParams;
  const { groups } = await getProductGroups();
  const rows = [...groups]
    .map((g) => ({ ...g, sampleSku: g.variants[0]?.sku ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 print:p-0">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/products"
          className="flex items-center gap-1.5 rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-black/5 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10"
        >
          <ArrowLeft size={14} />
          Back to Products
        </Link>
        <PrintButton auto={sp.print === '1'} label="Print SKUs" />
      </div>

      <div className="print-sheet">
        <p className="mb-3 text-[10px] text-neutral-500 print-muted">
          {rows.length} product{rows.length === 1 ? '' : 's'}
        </p>

        {rows.length > 0 ? (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className={th}>Product</th>
                <th className={th}>SKU</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.code}>
                  <td className={td}>{g.name}</td>
                  <td className={`${td} font-mono`}>{g.sampleSku || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="py-8 text-center text-sm text-neutral-400">No products yet.</p>
        )}
      </div>
    </main>
  );
}
