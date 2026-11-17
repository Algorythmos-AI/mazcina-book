import type { Metadata } from 'next';
import Link from 'next/link';
import { h1, link, muted, secondary } from '@/components/ui';
import { ingredientUnitCost, selectPrice } from '@/lib/costing';
import { unitsForIngredient } from '@/lib/format';
import { contextFrom, loadCostingData } from '@/lib/queries';
import { requireRole } from '@/lib/session';
import { countUnit } from '@/lib/stock';
import { lastPrice } from '../ingredients/last-price';
import { PriceList, type PriceGroup, type PriceRow } from './price-list';

export const metadata: Metadata = { title: 'Price list' };

const NO_PRICE = 'none';

/**
 * Every price in use on one page, grouped by the supplier it comes from, so a
 * delivery invoice can be worked through line by line. Changing a price here
 * is the same as on the ingredient's own page: every recipe that uses it
 * picks up the new cost straight away.
 */
export default async function PriceListPage() {
  await requireRole('owner', 'chef');
  const data = await loadCostingData();
  const ctx = contextFrom(data);
  const suppliers = data.suppliers.filter((s) => !s.archived).map((s) => ({ id: s.id, name: s.name }));
  const supplierName = new Map(data.suppliers.map((s) => [s.id, s.name]));

  const usedIn = new Map<string, number>();
  for (const recipe of data.recipes) {
    if (recipe.archived) continue;
    for (const id of new Set(recipe.lines.map((l) => l.ingredientId).filter(Boolean))) {
      usedIn.set(id!, (usedIn.get(id!) ?? 0) + 1);
    }
  }

  const groups = new Map<string, PriceGroup>();
  for (const ingredient of data.ingredients) {
    if (ingredient.archived) continue;
    const current = selectPrice(
      data.prices.filter((p) => p.ingredientId === ingredient.id),
      ingredient.preferredSupplierId,
      data.asOf,
    );
    const cost = ingredientUnitCost(ingredient.id, ctx);
    const key = current?.supplierId ?? NO_PRICE;
    const row: PriceRow = {
      ingredient: {
        id: ingredient.id,
        name: ingredient.name,
        baseUnit: ingredient.baseUnit,
        gramsPerEach: ingredient.gramsPerEach ?? null,
        gramsPerMl: ingredient.gramsPerMl ?? null,
        gramsPerBunch: ingredient.gramsPerBunch ?? null,
      },
      category: ingredient.category ?? null,
      units: unitsForIngredient(ingredient),
      defaultUnit: current?.packUnit ?? countUnit(ingredient.baseUnit),
      defaultSupplierId: ingredient.preferredSupplierId ?? suppliers[0]?.id ?? '',
      last: lastPrice(current, supplierName, cost.ok ? cost.value.toString() : null),
      since: current?.effectiveDate ?? null,
      usedIn: usedIn.get(ingredient.id) ?? 0,
    };
    const group = groups.get(key) ?? {
      key,
      name: key === NO_PRICE ? 'No price yet' : (supplierName.get(key) ?? 'Unknown supplier'),
      rows: [],
    };
    group.rows.push(row);
    groups.set(key, group);
  }

  const ordered = [...groups.values()]
    .map((g) => ({ ...g, rows: g.rows.sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name)) }))
    .sort((a, b) => (a.key === NO_PRICE ? 1 : b.key === NO_PRICE ? -1 : a.name.localeCompare(b.name)));
  const priced = ordered.filter((g) => g.key !== NO_PRICE).reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className={h1}>Price list</h1>
          <p className={`mt-1 ${muted}`}>
            Every price in use, by supplier. Change one here and every recipe that uses it is re-costed straight away.
          </p>
        </div>
        <Link href="/ingredients/import" className={secondary}>Paste a whole list</Link>
      </div>

      {suppliers.length === 0 ? (
        <p className={muted}>
          Add a supplier first on the <Link href="/suppliers" className={link}>Suppliers</Link> page.
        </p>
      ) : ordered.length === 0 ? (
        <p className={muted}>
          No ingredients yet. Add them on the <Link href="/ingredients" className={link}>Ingredients</Link> page.
        </p>
      ) : (
        <PriceList groups={ordered} priced={priced} suppliers={suppliers} today={data.asOf} gstRegistered={data.settings.gstRegistered} />
      )}
    </div>
  );
}
