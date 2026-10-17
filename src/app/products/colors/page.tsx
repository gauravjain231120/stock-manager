import Link from 'next/link';
import { ArrowLeft, Palette } from 'lucide-react';
import { listClothColors } from '@/lib/clothColors';
import { ClothColorsManager } from '@/components/ClothColorsManager';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function ClothColorsPage() {
  const colors = await listClothColors();

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 max-w-7xl mx-auto">
      <div className="mb-2">
        <Link
          href="/products"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition mb-3"
        >
          <ArrowLeft size={14} /> Back to Products
        </Link>
      </div>

      <PageHeader
        title="Cloth Colors"
        subtitle="Catalog of all your fabric and cloth colors with photos — easy visual reference for your team."
      />

      <div className="mt-6">
        <ClothColorsManager initialColors={colors} />
      </div>
    </main>
  );
}
