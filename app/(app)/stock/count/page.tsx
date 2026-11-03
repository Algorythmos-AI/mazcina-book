import type { Metadata } from 'next';
import Link from 'next/link';
import { h1, muted } from '@/components/ui';
import { unitsForIngredient } from '@/lib/format';
import { loadCostingData, loadStock } from '@/lib/queries';
import { requireRole } from '@/lib/session';
import { countUnit, formatStock } from '@/lib/stock';
import { Stocktake, type CountItem } from './stocktake';

export const metadata: Metadata = { title: 'Stocktake' };

export default async function StocktakePage() {
  const user = await requireRole('owner', 'chef');
  const [data, stock] = await Promise.all([loadCostingData(), loadStock()]);
  const items: CountItem[] = data.ingredients
    .filter((i) => !i.archived)
    .map((i) => {
      const level = stock.get(i.id);
      return {
        id: i.id,
        name: i.name,
        category: i.category?.trim() || 'Other',
        units: unitsForIngredient(i),
        defaultUnit: countUnit(i.baseUnit),
        onBooks: level ? formatStock(level.onHand, i.baseUnit) : null,
      };
    });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/stock" className={`${muted} font-semibold hover:text-mazcina-wood`}>← Stock</Link>
        <h1 className={`mt-1 ${h1}`}>Stocktake</h1>
      </div>
      {items.length === 0 ? <p className={muted}>No ingredients yet.</p> : <Stocktake items={items} userEmail={user.email} />}
    </div>
  );
}
