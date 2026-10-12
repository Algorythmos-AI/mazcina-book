import type { Metadata } from 'next';
import Link from 'next/link';
import { badgeOk, badgeWarn, card, h1, h2, input, label, muted, primary } from '@/components/ui';
import { displayDate, money, moneyFromCents, percent, unitPrice } from '@/lib/format';
import { daysAgo, priceImpact } from '@/lib/impact';
import { loadCostingData, loadMenus } from '@/lib/queries';
import { requireRole } from '@/lib/session';

export const metadata: Metadata = { title: 'Price changes' };

export default async function ChangesPage({ searchParams }: PageProps<'/changes'>) {
  await requireRole('owner', 'chef');
  const [data, menus] = await Promise.all([loadCostingData(), loadMenus()]);
  const { since: requested } = await searchParams;
  const since =
    typeof requested === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= data.asOf ? requested : daysAgo(data.asOf, 7);
  const live = menus.filter((m) => m.status === 'live').flatMap((m) => m.items);
  const { ingredients, dishes } = priceImpact(data, live, since);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/ingredients" className={`${muted} font-semibold hover:text-mazcina-wood`}>← Ingredients</Link>
        <h1 className={`mt-1 ${h1}`}>Price changes</h1>
      </div>

      <form method="get" className={`${card} flex flex-wrap items-end gap-3`}>
        <div>
          <label htmlFor="since" className={label}>Show changes since</label>
          <input id="since" name="since" type="date" defaultValue={since} max={data.asOf} className={input} />
        </div>
        <button type="submit" className={primary}>Show</button>
        <p className={`basis-full ${muted}`}>
          Compares today&apos;s costs with the prices that applied before {displayDate(since)}. Recipes are taken as they are now.
        </p>
      </form>

      <section className={card}>
        <h2 className={h2}>Ingredients ({ingredients.length})</h2>
        {ingredients.length === 0 ? (
          <p className={`mt-2 ${muted}`}>No supplier prices changed in this period.</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100">
            {ingredients.map((i) => (
              <li key={i.id}>
                <Link href={`/ingredients/${i.id}`} className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 py-2 hover:text-mazcina-wood">
                  <span className="font-semibold">{i.name}</span>
                  <span className="tabular-nums">
                    {i.before ? <span className={muted}>{unitPrice(i.before, i.baseUnit)} → </span> : null}
                    <span className="font-semibold">{unitPrice(i.after, i.baseUnit)}</span>
                    {i.changePct ? (
                      <span className={`ml-2 ${i.changePct.gt(0) ? badgeWarn : badgeOk}`}>
                        {i.changePct.gt(0) ? '+' : ''}{percent(i.changePct)}
                      </span>
                    ) : (
                      <span className={`ml-2 ${badgeOk}`}>First price</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className={h2}>Dishes and preps that moved ({dishes.length})</h2>
        {dishes.length === 0 ? (
          <p className={`mt-2 ${muted}`}>No costed recipe changed cost in this period.</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100">
            {dishes.map((d) => (
              <li key={d.recipeId} className="py-3">
                <Link href={`/recipes/${d.recipeId}`} className="flex flex-wrap items-center justify-between gap-x-4 hover:text-mazcina-wood">
                  <span className="font-semibold">{d.name}</span>
                  <span className="tabular-nums">
                    <span className={muted}>{money(d.before)} → </span>
                    <span className="font-semibold">{money(d.after)}</span>
                    <span className={`ml-2 ${d.delta.gt(0) ? badgeWarn : badgeOk}`}>
                      {d.delta.gt(0) ? '+' : '−'}{money(d.delta.abs())} a serve
                    </span>
                  </span>
                </Link>
                {d.menuItems.map((m) => (
                  <p key={m.id} className={`mt-1 ${muted} tabular-nums`}>
                    On the menu as {m.name} at {moneyFromCents(m.sellPriceCents)}: food cost{' '}
                    {m.beforePct ? percent(m.beforePct) : '—'} → <span className="font-semibold text-mazcina-emerald">{m.afterPct ? percent(m.afterPct) : '—'}</span>
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
