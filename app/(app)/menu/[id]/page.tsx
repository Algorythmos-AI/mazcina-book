import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/action-form';
import { ArchiveButton } from '@/components/archive-button';
import { badgeBad, badgeOk, badgeWarn, card, h1, h2, link, muted } from '@/components/ui';
import { issueText, money, moneyFromCents, percent, plain } from '@/lib/format';
import { costMenuItem } from '@/lib/menu';
import { contextFrom, loadCostingData, loadMenus } from '@/lib/queries';
import { requireRole } from '@/lib/session';
import { setMenuItemArchived, updateMenuItem } from '../../actions';
import { ItemFields } from '../item-fields';

export const metadata: Metadata = { title: 'Menu item' };

const RATING = {
  good: { badge: badgeOk, text: 'On target' },
  watch: { badge: badgeWarn, text: 'A little over target' },
  high: { badge: badgeBad, text: 'Well over target' },
  none: { badge: badgeWarn, text: 'No menu price' },
} as const;

export default async function MenuItemPage({ params }: PageProps<'/menu/[id]'>) {
  await requireRole('owner', 'chef');
  const { id } = await params;
  const [data, menus] = await Promise.all([loadCostingData(), loadMenus()]);
  const menu = menus.find((m) => m.items.some((i) => i.id === id));
  const item = menu?.items.find((i) => i.id === id);
  if (!menu || !item) notFound();

  const costing = costMenuItem(item, contextFrom(data), data.settings);
  const recipe = data.recipes.find((r) => r.id === item.recipeId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/menu" className={`${muted} font-semibold hover:text-mazcina-wood`}>← {menu.name}</Link>
        <h1 className={`mt-1 ${h1}`}>{item.name}</h1>
        <p className={`mt-1 ${muted}`}>{item.category} · {moneyFromCents(item.sellPriceCents)}</p>
      </div>

      <section className={card} aria-label="Costing">
        <h2 className={h2}>Costing</h2>
        {costing.status === 'uncosted' && (
          <p className={`mt-2 ${muted}`}>
            No recipe linked yet. Build it under <Link href="/recipes" className={link}>Recipes</Link>, then choose it below.
          </p>
        )}
        {costing.status === 'incomplete' && (
          <div className="mt-2">
            <p className={badgeWarn}>Recipe incomplete: no cost shown until this is fixed</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {[...new Set(costing.issues.map(issueText))].map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        )}
        {costing.status === 'ok' && (
          <>
            <p className={`mt-2 ${RATING[costing.rating].badge}`}>{RATING[costing.rating].text}</p>
            <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className={muted}>Food cost</dt>
                <dd className="text-2xl font-extrabold tabular-nums">{costing.foodCostPct ? percent(costing.foodCostPct) : '—'}</dd>
              </div>
              <div>
                <dt className={muted}>Cost per serve</dt>
                <dd className="text-2xl font-extrabold tabular-nums">{money(costing.cost)}</dd>
              </div>
              <div>
                <dt className={muted}>Profit per serve</dt>
                <dd className="text-2xl font-extrabold tabular-nums">{money(costing.grossProfit)}</dd>
              </div>
              {costing.suggestedCents !== null && (
                <div>
                  <dt className={muted}>Price at {plain(data.settings.targetFoodCostPct)}%</dt>
                  <dd className="text-2xl font-extrabold tabular-nums">{moneyFromCents(costing.suggestedCents)}</dd>
                </div>
              )}
            </dl>
            {costing.estimates.length > 0 && (
              <p className={`mt-3 ${badgeWarn}`}>
                Estimate: {costing.estimates.join(', ')} {costing.estimates.length === 1 ? 'has' : 'have'} an estimated batch yield. Weigh a finished batch to make this exact.
              </p>
            )}
            <p className={`mt-3 ${muted}`}>Cost and profit are before GST. Profit is before wages, rent and other running costs.</p>
          </>
        )}
        {recipe && (
          <p className="mt-3">
            <Link href={`/recipes/${recipe.id}`} className={link}>Open recipe: {recipe.name}</Link>
          </p>
        )}
      </section>

      {!item.archived && (
        <section className={card}>
          <h2 className={h2}>Details</h2>
          <ActionForm action={updateMenuItem} submitLabel="Save" className="mt-3" key={item.version}>
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="version" value={item.version} />
            <ItemFields item={item} recipes={data.recipes} categories={menu.items.map((i) => i.category)} />
          </ActionForm>
        </section>
      )}

      <ArchiveButton action={setMenuItemArchived.bind(null, item.id)} archived={item.archived} redirectTo="/menu" />
    </div>
  );
}
