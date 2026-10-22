import type { Metadata } from 'next';
import Link from 'next/link';
import { h1, muted } from '@/components/ui';
import { unitsForIngredient } from '@/lib/format';
import { loadCostingData } from '@/lib/queries';
import { requireRole } from '@/lib/session';
import { countUnit } from '@/lib/stock';
import { Delivery } from './delivery';

export const metadata: Metadata = { title: 'Receive a delivery' };

export default async function ReceivePage() {
  await requireRole('owner', 'chef');
  const data = await loadCostingData();
  const priced = new Set(data.prices.map((p) => p.ingredientId));
  const items = data.ingredients
    .filter((i) => !i.archived)
    .map((i) => ({ id: i.id, name: i.name, units: unitsForIngredient(i), defaultUnit: countUnit(i.baseUnit), priced: priced.has(i.id) }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/stock" className={`${muted} font-semibold hover:text-mazcina-wood`}>← Stock</Link>
        <h1 className={`mt-1 ${h1}`}>Receive a delivery</h1>
      </div>
      {items.length === 0 ? (
        <p className={muted}>No ingredients yet.</p>
      ) : (
        <Delivery items={items} suppliers={data.suppliers.filter((s) => !s.archived).map((s) => ({ id: s.id, name: s.name }))} />
      )}
    </div>
  );
}
