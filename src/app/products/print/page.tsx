import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getProductGroups } from '@/lib/products';
import { PrintButton } from '@/components/PrintButton';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Rangrooh Product SKUs' };

const td = 'border border-black px-2 py-1.5 align-top break-words';

// A SKU's own product code sits right after the brand prefix, e.g.
// "RRC-009-CO-J-GRN-XS" -> "009". Used both to number each box and to sort
// the sheet ascending (001, 002, ...) instead of alphabetically by name.
function skuCode(sku: string): string | null {
  const seg = sku.split('-')[1];
  return seg && /^\d+$/.test(seg) ? seg : null;
}

/**
 * Every product's name + one real variant SKU (any single colour/size —
 * group.code is just an internal group id, not an actual trackable SKU), each
 * in its OWN small bordered table, numbered by the product code embedded in
 * its SKU and sorted ascending by that same number (001, 002, ...). Laid out
 * 2-up so several fit per printed page. Screen chrome carries `no-print`,
 * same pattern as the other print pages (§ /ship/queue-print, /inventory/print).
 */
export default async function ProductSkuPrintPage({ searchParams }: { searchParams: Promise<{ print?: string }> }) {
  const sp = await searchParams;
  const { groups } = await getProductGroups();
  const rows = [...groups]
    .map((g) => ({ ...g, code3: skuCode(g.variants[0]?.sku ?? ''), sampleSku: g.variants[0]?.sku ?? '' }))
    .sort((a, b) => {
      if (a.code3 && b.code3) return Number(a.code3) - Number(b.code3);
      if (a.code3) return -1;
      if (b.code3) return 1;
      return a.name.localeCompare(b.name);
    });

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
          <div className="grid grid-cols-2 gap-3">
            {rows.map((g) => (
              <table key={g.code} className="w-full min-w-0 table-fixed border-collapse text-sm">
                <tbody>
                  <tr>
                    <td className={td}>
                      {g.code3 ? <span className="mr-2 text-xl font-bold">{g.code3}</span> : null}
                      <span className="font-bold">{g.name}</span>
                    </td>
                  </tr>
                  <tr>
                    <td className={`${td} font-mono font-bold`}>{g.sampleSku || '—'}</td>
                  </tr>
                </tbody>
              </table>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-neutral-400">No products yet.</p>
        )}
      </div>
    </main>
  );
}
