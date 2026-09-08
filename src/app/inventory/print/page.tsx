import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getInventoryOverview } from '@/lib/queries';
import { PrintButton } from '@/components/PrintButton';
import { compareVariant, dateTime, groupVariants } from '@/lib/format';

export const dynamic = 'force-dynamic';

// Chrome names the saved file after the document title, so put the filter in it.
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const sp = await searchParams;
  return { title: `Rangrooh Inventory${sp.category ? ` — ${sp.category}` : ''}` };
}

function sizeFromSku(sku: string) {
  return sku.split('-').pop() ?? '';
}

const th = 'border-b-2 border-black/40 px-1.5 py-0.5 text-left font-semibold dark:border-white/40';
const thR = `${th} text-right`;
const td = 'border-b border-black/10 px-1.5 py-0.5 align-top dark:border-white/10';
const tdR = `${td} text-right tabular-nums`;

/**
 * The whole inventory (or one category of it) on one printable sheet — one
 * table per colour, same grouping the on-screen Inventory page already uses
 * (groupVariants keys on everything but the size suffix), so a colour's
 * sizes read together instead of one long undifferentiated list. Screen
 * chrome carries `no-print`, so "Save as PDF" gives you just the sheet, same
 * pattern as the Ready-to-Ship print page.
 */
export default async function InventoryPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ print?: string; category?: string }>;
}) {
  const sp = await searchParams;
  const category = sp.category?.trim() || null;
  const { rows } = await getInventoryOverview();
  const filtered = rows
    .filter((r) => !category || r.category === category)
    .sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      if (a.name !== b.name) return a.name.localeCompare(b.name);
      return compareVariant(a.sku, b.sku);
    });
  const groups = groupVariants(filtered, (r) => sizeFromSku(r.sku));
  const totalAvailable = filtered.reduce((a, r) => a + Math.max(0, r.available), 0);
  const generated = dateTime(new Date());

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 print:p-0">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/inventory"
          className="flex items-center gap-1.5 rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-black/5 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10"
        >
          <ArrowLeft size={14} />
          Back to Inventory
        </Link>
        <PrintButton auto={sp.print === '1'} />
      </div>

      <div className="print-sheet">
        <p className="mb-3 text-[10px] text-neutral-500 print-muted">
          {filtered.length} SKU{filtered.length === 1 ? '' : 's'} · {totalAvailable} available · {generated}
          {category ? ` · ${category}` : ''}
        </p>

        {groups.map((g) => {
          const groupAvailable = g.rows.reduce((a, r) => a + r.available, 0);
          return (
            <table key={g.key} className="mb-4 w-full border-collapse text-[10px] leading-tight">
              <thead>
                <tr>
                  <th colSpan={2} className={`${th} text-[11px]`}>{g.title}</th>
                </tr>
                <tr>
                  <th className={th}>Size</th>
                  <th className={thR}>Available</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.sku}>
                    <td className={td}>{sizeFromSku(r.sku)}</td>
                    <td className={`${tdR} ${r.available <= 0 ? 'print-short text-red-600' : ''}`}>{r.available}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className={td}>Total</td>
                  <td className={tdR}>{groupAvailable}</td>
                </tr>
              </tbody>
            </table>
          );
        })}

        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-400">
            {category ? `No products in ${category}.` : 'No products yet.'}
          </p>
        ) : null}
      </div>
    </main>
  );
}
