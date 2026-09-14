import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { listClothPurchases } from '@/lib/clothPurchases';
import { ClothPurchasesPanel } from '@/components/ClothPurchasesPanel';

export const dynamic = 'force-dynamic';

export default async function ClothPurchasesPage() {
  const items = await listClothPurchases();

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4">
        <Link
          href="/account"
          className="flex w-fit items-center gap-1.5 rounded-lg border border-black/15 px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:bg-black/5 dark:border-white/20 dark:text-neutral-300 dark:hover:bg-white/10"
        >
          <ArrowLeft size={14} />
          Back to Expense
        </Link>
      </div>
      <ClothPurchasesPanel initialItems={items} />
    </main>
  );
}
