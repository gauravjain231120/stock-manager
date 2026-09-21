import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PrintButton } from '@/components/PrintButton';

export const dynamic = 'force-dynamic';

// Chrome names the saved file after the document title.
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ sku?: string }> }) {
  const sp = await searchParams;
  return { title: sp.sku ? `SKU ${sp.sku}` : 'SKU label' };
}

/**
 * A single SKU tag — category + SKU, nothing else — for sticking on the
 * physical item or box. Screen chrome carries `no-print`, same pattern as
 * the other print pages (§ /ship/queue-print, /inventory/print).
 */
export default async function ProductSkuPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ print?: string; sku?: string; category?: string }>;
}) {
  const sp = await searchParams;
  const sku = sp.sku?.trim() || '';
  const category = sp.category?.trim() || '';

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
        <PrintButton auto={sp.print === '1'} label="Print label" />
      </div>

      <div className="print-sheet flex justify-center">
        {sku ? (
          <div className="inline-flex flex-col items-center gap-1 rounded-xl border border-black/20 px-8 py-6 dark:border-white/20">
            {category ? (
              <div className="text-xs font-medium uppercase tracking-wide text-neutral-500 print-muted">{category}</div>
            ) : null}
            <div className="font-mono text-xl font-bold tracking-wide">{sku}</div>
          </div>
        ) : (
          <p className="py-8 text-sm text-neutral-400">No SKU given.</p>
        )}
      </div>
    </main>
  );
}
