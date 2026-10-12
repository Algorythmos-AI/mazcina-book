import type { Metadata } from 'next';
import Link from 'next/link';
import DecimalJs from 'decimal.js';
import { ActionForm } from '@/components/action-form';
import { ArchiveButton } from '@/components/archive-button';
import { badgeBad, badgeOk, badgeWarn, card, eyebrow, h1, h2, input, label, muted } from '@/components/ui';
import { moneyFromCents, money, percent, plain } from '@/lib/format';
import { costMenuItem, groupByCategory, type ItemCosting } from '@/lib/menu';
import { contextFrom, loadCostingData, loadMenus } from '@/lib/queries';
import { requireRole } from '@/lib/session';
import { createMenuItem, setMenuItemArchived, updateSettings } from '../actions';
import { ItemFields } from './item-fields';

export const metadata: Metadata = { title: 'Menu' };

const RATING_BADGE = { good: badgeOk, watch: badgeWarn, high: badgeBad, none: badgeWarn } as const;

function Costing({ costing }: { costing: ItemCosting }) {
  if (costing.status === 'uncosted') return <span className={`${muted} text-xs`}>Not costed</span>;
  if (costing.status === 'incomplete') return <span className={badgeWarn}>Recipe incomplete</span>;
  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className={RATING_BADGE[costing.rating]}>{costing.foodCostPct ? percent(costing.foodCostPct) : 'No price'}</span>
      <span className={`${muted} text-xs tabular-nums`}>cost {money(costing.cost)}</span>
    </span>
  );
}

export default async function MenuPage() {
  const user = await requireRole('owner', 'chef');
  const [data, menus] = await Promise.all([loadCostingData(), loadMenus()]);
  const menu = menus.find((m) => m.status === 'live') ?? menus[0];

  if (!menu) {
    return (
      <div className="space-y-4">
        <h1 className={h1}>Menu</h1>
        <p className={muted}>No menu has been loaded yet.</p>
      </div>
    );
  }

  const ctx = contextFrom(data);
  const target = new DecimalJs(data.settings.targetFoodCostPct);
  const active = menu.items.filter((i) => !i.archived);
  const trashed = menu.items.filter((i) => i.archived);
  const rows = active.map((item) => ({ item, costing: costMenuItem(item, ctx, data.settings) }));
  const costed = rows.flatMap((r) => (r.costing.status === 'ok' && r.costing.foodCostPct ? [r.costing] : []));
  const average = costed.length > 0 ? costed.reduce((sum, c) => sum.plus(c.foodCostPct!), new DecimalJs(0)).div(costed.length) : null;
  const overTarget = costed.filter((c) => c.rating === 'high').length;

  return (
    <div className="space-y-6">
      <div>
        <p className={eyebrow}>{menu.status === 'live' ? 'Live menu' : 'Draft menu'}</p>
        <h1 className={h1}>{menu.name}</h1>
      </div>

      <section className={card} aria-label="Summary">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className={muted}>Items costed</dt>
            <dd className="text-2xl font-extrabold tabular-nums">{costed.length} of {active.length}</dd>
          </div>
          <div>
            <dt className={muted}>Average food cost</dt>
            <dd className="text-2xl font-extrabold tabular-nums">{average ? percent(average) : '—'}</dd>
          </div>
          <div>
            <dt className={muted}>Target</dt>
            <dd className="text-2xl font-extrabold tabular-nums">{percent(target)}</dd>
          </div>
          <div>
            <dt className={muted}>Well over target</dt>
            <dd className="text-2xl font-extrabold tabular-nums">{overTarget}</dd>
          </div>
        </dl>
        <p className={`mt-3 ${muted}`}>
          Food cost % is the cost of one serve against the menu price{data.settings.gstRegistered ? ' with GST taken off' : ''}. Only fully
          costed items count towards the average.
        </p>
      </section>

      {groupByCategory(rows.map((r) => ({ ...r, category: r.item.category }))).map(([category, group]) => (
        <section key={category} className={card}>
          <h2 className={h2}>{category}</h2>
          <ul className="mt-2 divide-y divide-gray-100">
            {group.map(({ item, costing }) => (
              <li key={item.id}>
                <Link href={`/menu/${item.id}`} className="flex min-h-14 items-center justify-between gap-3 py-2 hover:text-mazcina-wood">
                  <span>
                    <span className="font-semibold">{item.name}</span>
                    <span className={`block ${muted} tabular-nums`}>{moneyFromCents(item.sellPriceCents)}</span>
                  </span>
                  <Costing costing={costing} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className={card}>
        <h2 className={h2}>Add a menu item</h2>
        <ActionForm action={createMenuItem} submitLabel="Add item" savedLabel="Added" resetOnSuccess className="mt-3">
          <input type="hidden" name="menuId" value={menu.id} />
          <ItemFields recipes={data.recipes} categories={active.map((i) => i.category)} />
        </ActionForm>
      </section>

      {user.role === 'owner' && (
        <section className={card}>
          <h2 className={h2}>Costing settings</h2>
          <ActionForm action={updateSettings} submitLabel="Save settings" className="mt-3" key={`${data.settings.targetFoodCostPct}-${data.settings.gstRegistered}`}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="settings-target" className={label}>Target food cost %</label>
                <input id="settings-target" name="targetFoodCostPct" inputMode="decimal" required defaultValue={plain(data.settings.targetFoodCostPct)} className={input} />
              </div>
              <label className="flex min-h-11 items-center gap-2 self-end text-sm font-semibold">
                <input type="checkbox" name="gstRegistered" defaultChecked={data.settings.gstRegistered} className="size-5 accent-mazcina-wood" />
                Mazcina is registered for GST
              </label>
            </div>
          </ActionForm>
        </section>
      )}

      {trashed.length > 0 && (
        <section className={card}>
          <h2 className={h2}>Trash</h2>
          <ul className="mt-2 divide-y divide-gray-100">
            {trashed.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <p className="font-semibold">{item.name}</p>
                <ArchiveButton action={setMenuItemArchived.bind(null, item.id)} archived />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
