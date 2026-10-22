import type { Metadata } from 'next';
import Link from 'next/link';
import { badgeWarn, card, h1, h2, link, muted } from '@/components/ui';
import type { IssueCode } from '@/lib/costing';
import { issueText, moneyFromCents } from '@/lib/format';
import { rootIssues } from '@/lib/menu';
import { contextFrom, loadCostingData, loadMenus } from '@/lib/queries';
import { requireRole } from '@/lib/session';

export const metadata: Metadata = { title: 'What is missing' };

interface Blocker {
  key: string;
  code: IssueCode;
  subject: string;
  /** Where to go to fix it, when it is an ingredient or a recipe. */
  href: string | null;
  items: string[];
}

function BlockerList({ list }: { list: Blocker[] }) {
  return (
    <ul className="mt-2 divide-y divide-gray-100">
      {list.map((b) => (
        <li key={b.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
          <span>
            {b.href ? (
              <Link href={b.href} className={link}>{b.code === 'no_price' ? b.subject : issueText(b)}</Link>
            ) : (
              <span className="font-semibold">{issueText(b)}</span>
            )}
            <span className={`block ${muted}`}>{b.items.join(', ')}</span>
          </span>
          <span className={badgeWarn}>
            {b.items.length} {b.items.length === 1 ? 'item' : 'items'}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Everything standing between the menu and a full set of costs, biggest win
 * first: the ingredient prices (and other fixes) each menu item is waiting on,
 * and the items with no recipe linked at all.
 */
export default async function PricesNeededPage({ searchParams }: PageProps<'/prices-needed'>) {
  await requireRole('owner', 'chef');
  const { m: requested } = await searchParams;
  const [data, menus] = await Promise.all([loadCostingData(), loadMenus()]);
  const open = menus.filter((m) => m.status !== 'archived');
  const menu = open.find((m) => m.id === requested) ?? open.find((m) => m.status === 'live' && m.kind === 'seasonal') ?? open[0];

  if (!menu) {
    return (
      <div className="space-y-4">
        <h1 className={h1}>What is missing</h1>
        <p className={muted}>No menu has been loaded yet.</p>
      </div>
    );
  }

  const ctx = contextFrom(data);
  const ingredientByName = new Map(data.ingredients.map((i) => [i.name, i]));
  const recipeByName = new Map(data.recipes.map((r) => [r.name, r]));
  const items = menu.items.filter((i) => !i.archived);
  const unlinked = items.filter((i) => !i.recipeId);

  const blockers = new Map<string, Blocker>();
  for (const item of items) {
    if (!item.recipeId) continue;
    for (const issue of rootIssues(item.recipeId, ctx)) {
      const subject = issue.subject ?? item.name;
      const key = `${issue.code}|${subject}`;
      const ingredient = ingredientByName.get(subject);
      const recipe = recipeByName.get(subject);
      const href = ingredient ? `/ingredients/${ingredient.id}` : recipe ? `/recipes/${recipe.id}` : null;
      const entry = blockers.get(key) ?? { key, code: issue.code, subject, href, items: [] };
      if (!entry.items.includes(item.name)) entry.items.push(item.name);
      blockers.set(key, entry);
    }
  }
  const ranked = [...blockers.values()].sort((a, b) => b.items.length - a.items.length || a.subject.localeCompare(b.subject));
  const prices = ranked.filter((b) => b.code === 'no_price');
  const other = ranked.filter((b) => b.code !== 'no_price');

  const usedOnMenu = new Set(prices.map((b) => b.subject));
  const pricedIds = new Set(data.prices.filter((p) => p.effectiveDate <= data.asOf).map((p) => p.ingredientId));
  const offMenu = data.ingredients.filter((i) => !i.archived && !pricedIds.has(i.id) && !usedOnMenu.has(i.name));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/menu?m=${menu.id}`} className={`${muted} font-semibold hover:text-mazcina-wood`}>← {menu.name}</Link>
        <h1 className={`mt-1 ${h1}`}>What is missing</h1>
        <p className={`mt-1 ${muted}`}>
          What stops each item on {menu.name} from being costed. Start at the top: each line shows how many menu items it holds back.
        </p>
      </div>

      <section className={card}>
        <h2 className={h2}>Prices needed ({prices.length})</h2>
        {prices.length === 0 ? (
          <p className={`mt-2 ${muted}`}>Every ingredient on this menu has a price.</p>
        ) : (
          <>
            <p className={`mt-1 ${muted}`}>Open an ingredient to add its price, or add many at once with the price list import.</p>
            <BlockerList list={prices} />
            <p className="mt-3">
              <Link href="/ingredients/import" className={link}>Import a price list</Link>
            </p>
          </>
        )}
      </section>

      {other.length > 0 && (
        <section className={card}>
          <h2 className={h2}>Other fixes ({other.length})</h2>
          <p className={`mt-1 ${muted}`}>A missing conversion, an archived ingredient or a recipe that needs finishing.</p>
          <BlockerList list={other} />
        </section>
      )}

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
