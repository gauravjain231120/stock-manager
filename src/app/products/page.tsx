import Link from 'next/link';
import { Printer, Palette } from 'lucide-react';
import { getProductGroups } from '@/lib/products';
import { PageHeader, StatCard } from '@/components/ui';
import { AddProductForm } from '@/components/AddProductForm';
import { ProductCard } from '@/components/ProductCard';
import { num } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const { groups } = await getProductGroups();
  const totalVariants = groups.reduce((a, g) => a + g.variantCount, 0);
  const totalUnits = groups.reduce((a, g) => a + g.totalStock, 0);
  const categories = [...new Set(groups.map((g) => g.category).filter(Boolean))].sort() as string[];

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Products"
        subtitle="Add a product with a photo and its colours & sizes — each variant gets its own tracked stock."
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/products/colors"
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-500/30 bg-brand-50/50 px-3 py-1.5 text-sm font-medium text-brand-700 transition hover:bg-brand-100/50 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-300 dark:hover:bg-brand-500/20 shadow-sm"
            >
              <Palette size={14} className="text-brand-600 dark:text-brand-400" /> Cloth Colors
            </Link>
            <Link
              href="/products/print?print=1"
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium transition hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              <Printer size={14} /> Print SKU
            </Link>
          </div>
        }
      />

      <section className="mb-6 grid grid-cols-3 gap-2 sm:max-w-2xl sm:gap-4">
        <StatCard label="Products" value={groups.length} />
        <StatCard label="Variants" value={totalVariants} hint="colour × size" />
        <StatCard label="Units in stock" value={num(totalUnits)} />
      </section>

      <div className="mb-8">
        <AddProductForm />
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-neutral-400">No products yet. Click <b>+ Add product</b> above to create one.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <ProductCard key={g.code} group={g} categories={categories} />
          ))}
        </div>
      )}
    </main>
  );
}
