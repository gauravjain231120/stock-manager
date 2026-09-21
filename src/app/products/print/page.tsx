import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getProductGroups } from '@/lib/products';
import { PrintButton } from '@/components/PrintButton';
import { STANDARD_SIZES } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Rangrooh Product SKUs' };

const td = 'border border-black px-2 py-1.5 align-top';

// A SKU's own product code sits right after the brand prefix, e.g.
// "RRC-009-CO-J-GRN-XS" -> "009". Used both to number each box and to sort
// the sheet ascending (001, 002, ...) instead of alphabetically by name.
function skuCode(sku: string): string | null {
  const seg = sku.split('-')[1];
  return seg && /^\d+$/.test(seg) ? seg : null;
}

function sizeRank(size?: string) {
  const i = size ? (STANDARD_SIZES as readonly string[]).indexOf(size.toUpperCase()) : -1;
  return i === -1 ? STANDARD_SIZES.length : i;
}

// One row per colour — the smallest available size represents that colour,
// rather than picking just one SKU for the whole product.
function colorRows(variants: { sku: string; color?: string; size?: string }[]) {
  const byColor = new Map<string, { sku: string; size?: string }>();
  for (const v of variants) {
    const key = v.color || '—';
    const existing = byColor.get(key);
    if (!existing || sizeRank(v.size) < sizeRank(existing.size)) byColor.set(key, { sku: v.sku, size: v.size });
  }
  return [...byColor.entries()].map(([color, v]) => ({ color, sku: v.sku }));
}

/**
 * Every product's name + one real SKU per colour (any single size — the
 * smallest available represents each colour), each in its OWN small bordered
 * table, numbered by the product code embedded in its SKU and sorted
 * ascending by that same number (001, 002, ...). Laid out 2-up so several fit
 * per printed page. Screen chrome carries `no-print`, same pattern as the
 * other print pages (§ /ship/queue-print, /inventory/print).
 */
export default async function ProductSkuPrintPage({ searchParams }: { searchParams: Promise<{ print?: string }> }) {
  const sp = await searchParams;
  const { groups } = await getProductGroups();
  const rows = [...groups]
    .map((g) => ({ ...g, code3: skuCode(g.variants[0]?.sku ?? ''), colors: colorRows(g.variants) }))
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
              <table key={g.code} className="w-full border-collapse text-sm">
                <tbody>
                  <tr>
                    <td className={td}>
                      {g.code3 ? <span className="mr-2 font-bold">{g.code3}</span> : null}
                      <span className="font-bold">{g.name}</span>
                    </td>
                  </tr>
                  {g.colors.length > 0 ? (
                    g.colors.map((c) => (
                      <tr key={c.sku}>
                        <td className={`${td} font-mono font-bold`}>
                          {c.color}
                          {c.color !== '—' ? '  ' : ''}
                          {c.sku}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className={`${td} font-bold`}>—</td>
                    </tr>
                  )}
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
