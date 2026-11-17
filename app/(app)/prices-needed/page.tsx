import type { Metadata } from 'next';
import Link from 'next/link';
import { badgeWarn, card, h1, h2, link, muted } from '@/components/ui';
import { selectPrice } from '@/lib/costing';
import { issueText, moneyFromCents, unitsForIngredient } from '@/lib/format';
import { menuBlockers, type MenuBlocker } from '@/lib/menu';
import { contextFrom, loadCostingData, loadMenus } from '@/lib/queries';
import { requireRole } from '@/lib/session';
import { countUnit } from '@/lib/stock';
import { FillPrices, type FillRow } from './fill-prices';

export const metadata: Metadata = { title: 'Fill in prices' };

function BlockerList({ list }: { list: MenuBlocker[] }) {
  return (
    <ul className="mt-2 divide-y divide-gray-100">
      {list.map((b) => {
        const href = b.ingredientId ? `/ingredients/${b.ingredientId}` : b.recipeId ? `/recipes/${b.recipeId}` : null;
        return (
        <li key={b.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
          <span>
            {href ? (
              <Link href={href} className={link}>{issueText(b)}</Link>
            ) : (
              <span className="font-semibold">{issueText(b)}</span>
            )}
            <span className={`block ${muted}`}>{b.items.map((i) => i.name).join(', ')}</span>
          </span>
          <span className={badgeWarn}>
            {b.items.length} {b.items.length === 1 ? 'item' : 'items'}
          </span>
        </li>
        );
      })}
    </ul>
  );
}

/**
 * The fastest way to make the menu's costs real: every missing ingredient
 * price, biggest win first, each with its own price form right here. Below,
 * the other fixes and the items with no recipe. `?item=` narrows it to one dish.
 */
export default async function PricesNeededPage({ searchParams }: PageProps<'/prices-needed'>) {
  await requireRole('owner', 'chef');
  const { m: requested, item: itemId } = await searchParams;
  const [data, menus] = await Promise.all([loadCostingData(), loadMenus()]);
  const open = menus.filter((m) => m.status !== 'archived');
  const menu = open.find((m) => m.id === requested) ?? open.find((m) => m.status === 'live' && m.kind === 'seasonal') ?? open[0];

  if (!menu) {
    return (
      <div className="space-y-4">
        <h1 className={h1}>Fill in prices</h1>
        <p className={muted}>No menu has been loaded yet.</p>
      </div>
    );
  }

  const ctx = contextFrom(data);
  const items = menu.items.filter((i) => !i.archived);
  const focus = typeof itemId === 'string' ? items.find((i) => i.id === itemId) : undefined;
  const unlinked = focus ? [] : items.filter((i) => !i.recipeId);
  const all = menuBlockers(focus ? [focus] : items, ctx, { ingredients: data.ingredients, recipes: data.recipes });
  const prices = all.filter((b) => b.code === 'no_price' && b.ingredientId);
  const other = all.filter((b) => !(b.code === 'no_price' && b.ingredientId));

  const suppliers = data.suppliers.filter((s) => !s.archived).map((s) => ({ id: s.id, name: s.name }));
  const ingredientById = new Map(data.ingredients.map((i) => [i.id, i]));
  const rows: FillRow[] = prices.flatMap((b) => {
    const ingredient = ingredientById.get(b.ingredientId!);
    if (!ingredient) return [];
    // A price dated after today is not in use yet, but its pack details are the best guess for this one.
    const future = selectPrice(data.prices.filter((p) => p.ingredientId === ingredient.id), ingredient.preferredSupplierId, '9999-12-31');
    return [
      {
        ingredient: { id: ingredient.id, name: ingredient.name, baseUnit: ingredient.baseUnit, gramsPerEach: ingredient.gramsPerEach, gramsPerMl: ingredient.gramsPerMl, gramsPerBunch: ingredient.gramsPerBunch },
        units: unitsForIngredient(ingredient),
        defaultUnit: future?.packUnit ?? countUnit(ingredient.baseUnit),
        defaultSupplierId: ingredient.preferredSupplierId ?? suppliers[0]?.id ?? '',
        last: null,
        items: b.items.map((i) => i.name),
      },
    ];
  });

  const usedOnMenu = new Set(prices.map((b) => b.ingredientId));
  const pricedIds = new Set(data.prices.filter((p) => p.effectiveDate <= data.asOf).map((p) => p.ingredientId));
  const offMenu = focus ? [] : data.ingredients.filter((i) => !i.archived && !pricedIds.has(i.id) && !usedOnMenu.has(i.id));

  return (
    <div className="space-y-6">
      <div>
        <Link href={focus ? `/menu/${focus.id}` : `/menu?m=${menu.id}`} className={`${muted} font-semibold hover:text-mazcina-wood`}>
          ← {focus ? focus.name : menu.name}
        </Link>
        <h1 className={`mt-1 ${h1}`}>{focus ? `Prices for ${focus.name}` : 'Fill in prices'}</h1>
        <p className={`mt-1 ${muted}`}>
          {focus
            ? `What ${focus.name} is waiting on before it can be costed.`
            : `Everything that stops ${menu.name} from being fully costed. The prices that hold back the most dishes are at the top.`}{' '}
          Type the pack size and price from the supplier&apos;s invoice or list, then press Save (or Enter).
        </p>
        {focus && (
          <p className="mt-2">
            <Link href={`/prices-needed?m=${menu.id}`} className={link}>Show everything missing on {menu.name}</Link>
          </p>
        )}
      </div>

      <section>
        <h2 className={h2}>Prices needed ({prices.length})</h2>
        {prices.length === 0 ? (
          <p className={`mt-2 ${muted}`}>{focus ? `Every ingredient in ${focus.name} has a price.` : 'Every ingredient on this menu has a price.'}</p>
        ) : suppliers.length === 0 ? (
          <p className={`mt-2 ${muted}`}>
            Add a supplier first on the <Link href="/suppliers" className={link}>Suppliers</Link> page, then come back here.
          </p>
        ) : (
          <div className="mt-3">
            <FillPrices rows={rows} suppliers={suppliers} today={data.asOf} gstRegistered={data.settings.gstRegistered} />
            <p className={`mt-4 ${muted}`}>
              Have a whole price list from a supplier? <Link href="/ingredients/import" className={link}>Paste it in at once</Link>.
            </p>
          </div>
        )}
      </section>

      {other.length > 0 && (
        <section className={card}>
          <h2 className={h2}>Other fixes ({other.length})</h2>
          <p className={`mt-1 ${muted}`}>A missing conversion, an ingredient in the trash, or a prep that needs finishing.</p>
          <BlockerList list={other} />
        </section>
      )}

      {!focus && (
        <section className={card}>
          <h2 className={h2}>No recipe linked ({unlinked.length})</h2>
          {unlinked.length === 0 ? (
            <p className={`mt-2 ${muted}`}>Every item has a recipe.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100">
              {unlinked.map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-3 py-2.5">
                  <Link href={`/menu/${item.id}`} className={link}>{item.name}</Link>
                  <span className={`${muted} tabular-nums`}>{item.category} · {moneyFromCents(item.sellPriceCents)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {offMenu.length > 0 && (
        <section className={card}>
          <details>
            <summary className={`${h2} cursor-pointer`}>No price, not on this menu ({offMenu.length})</summary>
            <ul className="mt-2 columns-1 gap-6 sm:columns-2">
              {offMenu.map((i) => (
                <li key={i.id} className="py-1">
                  <Link href={`/ingredients/${i.id}`} className={link}>{i.name}</Link>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </div>
  );
}
