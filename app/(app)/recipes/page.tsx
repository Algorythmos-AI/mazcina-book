import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { ListFilter } from '@/components/list-filter';
import { ArchiveButton } from '@/components/archive-button';
import { badgeWarn, card, h1, h2, input, label, muted } from '@/components/ui';
import { costRecipe } from '@/lib/costing';
import { money } from '@/lib/format';
import { contextFrom, loadCostingData } from '@/lib/queries';
import { requireRole } from '@/lib/session';
import type { RecipeDto } from '@/lib/types';
import { createRecipe, setRecipeArchived } from '../actions';

export const metadata: Metadata = { title: 'Recipes' };

export default async function RecipesPage() {
  await requireRole('owner', 'chef');
  const data = await loadCostingData();
  const ctx = contextFrom(data);
  const active = data.recipes.filter((r) => !r.archived);
  const trashed = data.recipes.filter((r) => r.archived);

  const list = (title: string, recipes: RecipeDto[], empty: string) => (
    <section className={card}>
      <h2 className={h2}>{title} ({recipes.length})</h2>
      {recipes.length === 0 ? (
        <p className={`mt-2 ${muted}`}>{empty}</p>
      ) : (
        <ListFilter
          id={`recipes-${title}`}
          placeholder={`Find a ${title === 'Preps' ? 'prep' : 'dish'}…`}
          flags={[{ key: 'incomplete', label: 'Not costed yet' }]}
          sorts={[{ key: 'name', label: 'A to Z' }, { key: 'cost', label: 'Dearest first', descending: true }]}
        >
        <ul className="mt-2 flex flex-col divide-y divide-gray-100">
          {recipes.map((r) => {
            const cost = costRecipe(r.id, ctx);
            return (
              <li
                key={r.id}
                data-search={r.name}
                data-flags={cost.status === 'ok' ? '' : 'incomplete'}
                data-sort-name={r.name.toLowerCase()}
                data-sort-cost={cost.status === 'ok' ? cost.costPerPortion.toFixed(4) : ''}
              >
                <Link href={`/recipes/${r.id}`} className="flex min-h-14 items-center justify-between gap-3 py-2">
                  <span className="font-semibold">{r.name}</span>
                  {cost.status === 'ok' ? (
                    <span className="shrink-0 text-right">
                      <span className="font-semibold tabular-nums">{money(cost.costPerPortion)}</span>
                      <span className={`block ${muted}`}>{cost.estimates.length > 0 || r.yieldEstimated ? 'estimate, per portion' : 'per portion'}</span>
                    </span>
                  ) : (
                    <span className={`shrink-0 ${badgeWarn}`}>Not costed yet</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        </ListFilter>
      )}
    </section>
  );

  return (
    <div className="space-y-6">
      <h1 className={h1}>Recipes</h1>

      <section className={card}>
        <h2 className={h2}>New recipe</h2>
        <ActionForm action={createRecipe} submitLabel="Create and open" className="mt-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
            <div>
              <label htmlFor="new-recipe-name" className={label}>Name</label>
              <input id="new-recipe-name" name="name" required maxLength={120} className={input} />
            </div>
            <div>
              <label htmlFor="new-recipe-type" className={label}>Kind</label>
              <select id="new-recipe-type" name="type" defaultValue="dish" className={input}>
                <option value="dish">Dish</option>
                <option value="prep">Prep (sauce, stock, mix)</option>
              </select>
              <p className={`mt-1 ${muted}`}>A dish goes on the menu. A prep is made in a batch and used inside dishes, like a sauce or a stock.</p>
            </div>
          </div>
        </ActionForm>
      </section>

      {list('Dishes', active.filter((r) => r.type === 'dish'), 'No dishes yet. Create the first one above.')}
      {list('Preps', active.filter((r) => r.type === 'prep'), 'No preps yet. A prep is something you make once and use in several dishes.')}

      {trashed.length > 0 && (
        <section className={card}>
          <h2 className={h2}>Trash</h2>
          <ul className="mt-2 divide-y divide-gray-100">
            {trashed.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <p className="font-semibold">{r.name}</p>
                <ArchiveButton action={setRecipeArchived.bind(null, r.id)} archived />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
