import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { ArchiveButton } from '@/components/archive-button';
import { badgeWarn, card, h1, h2, muted } from '@/components/ui';
import { ingredientUnitCost } from '@/lib/costing';
import { issueText, unitPrice } from '@/lib/format';
import { contextFrom, loadCostingData } from '@/lib/queries';
import { requireRole } from '@/lib/session';
import { createIngredient, setIngredientArchived } from '../actions';
import { IngredientFields } from './ingredient-fields';

export const metadata: Metadata = { title: 'Ingredients' };

export default async function IngredientsPage() {
  await requireRole('owner', 'chef');
  const data = await loadCostingData();
  const ctx = contextFrom(data);
  const active = data.ingredients.filter((i) => !i.archived);
  const trashed = data.ingredients.filter((i) => i.archived);
  const supplierName = new Map(data.suppliers.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-6">
      <h1 className={h1}>Ingredients</h1>

      <section className={card}>
        <h2 className={h2}>All ingredients ({active.length})</h2>
        {active.length === 0 ? (
          <p className={`mt-2 ${muted}`}>None yet. Add your first ingredient below.</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100">
            {active.map((i) => {
              const cost = ingredientUnitCost(i.id, ctx);
              return (
                <li key={i.id}>
                  <Link href={`/ingredients/${i.id}`} className="flex min-h-14 items-center justify-between gap-3 py-2">
                    <span>
                      <span className="font-semibold">{i.name}</span>
                      <span className={`block ${muted}`}>
                        {[i.category, i.preferredSupplierId && supplierName.get(i.preferredSupplierId)].filter(Boolean).join(' · ') || ' '}
                      </span>
                    </span>
                    {cost.ok ? (
                      <span className="shrink-0 font-semibold tabular-nums">{unitPrice(cost.value, i.baseUnit)}</span>
                    ) : (
                      <span className={`shrink-0 ${badgeWarn}`}>{cost.issue.code === 'no_price' ? 'No price' : issueText({ ...cost.issue, subject: 'Price' })}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className={h2}>Add an ingredient</h2>
        <ActionForm action={createIngredient} submitLabel="Add ingredient" className="mt-3">
          <IngredientFields suppliers={data.suppliers} />
        </ActionForm>
      </section>

      {trashed.length > 0 && (
        <section className={card}>
          <h2 className={h2}>Trash</h2>
          <ul className="mt-2 divide-y divide-gray-100">
            {trashed.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <p className="font-semibold">{i.name}</p>
                <ArchiveButton action={setIngredientArchived.bind(null, i.id)} archived />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
