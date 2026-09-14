import { listClothPurchases } from '@/lib/clothPurchases';
import { ClothPurchasesPanel } from '@/components/ClothPurchasesPanel';

export const dynamic = 'force-dynamic';

export default async function ClothPurchasesPage() {
  const items = await listClothPurchases();

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8">
      <ClothPurchasesPanel initialItems={items} />
    </main>
  );
}
