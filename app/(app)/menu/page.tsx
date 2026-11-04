import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton } from '@/components/action-button';
import { ActionForm } from '@/components/action-form';
import { ArchiveButton } from '@/components/archive-button';
import { badgeBad, badgeOk, badgeWarn, card, eyebrow, h1, h2, input, label, muted, primary, secondary } from '@/components/ui';
import { displayDate, issueText, moneyFromCents, money, percent, plain } from '@/lib/format';
import { costMenuItem, groupByCategory, menuSummary, MIN_DISHES_FOR_AVERAGE, type ItemCosting } from '@/lib/menu';
import { contextFrom, loadCostingData, loadMenus, loadSnapshot } from '@/lib/queries';
import type { MenuDto } from '@/lib/types';
import { requireRole } from '@/lib/session';
import { cloneMenu, createMenuItem, setMenuItemArchived, setMenuStatus, updateSettings } from '../actions';
import { ItemFields } from './item-fields';

export const metadata: Metadata = { title: 'Menu' };

const RATING_BADGE = { good: badgeOk, watch: badgeWarn, high: badgeBad, none: badgeWarn } as const;

function Costing({ costing }: { costing: ItemCosting }) {
  if (costing.status === 'uncosted') return <span className={`${muted} text-xs`}>Not costed</span>;
  if (costing.status === 'incomplete') {
    // Name what is really missing, looking inside preps, so "Recipe incomplete" is never the whole story.
    const prices = costing.blockers.filter((b) => b.code === 'no_price');
    const other = costing.blockers.length - prices.length;
    const named = (prices.length > 0 ? prices : costing.blockers).slice(0, 3);
    const more = costing.blockers.length - named.length;
    return (
      <span className="flex flex-col items-end gap-0.5 text-right" title={costing.blockers.map(issueText).join('\n')}>
        <span className={badgeWarn}>
          {prices.length > 0 ? `Add ${prices.length} price${prices.length === 1 ? '' : 's'} →` : 'Recipe needs a fix →'}
          {prices.length > 0 && other > 0 ? ' + a fix' : ''}
        </span>
        {named.length > 0 && (
          <span className={`${muted} text-xs`}>
            {named.map((b) => (b.code === 'no_price' ? b.subject : issueText(b))).join(', ')}
            {more > 0 ? ` +${more} more` : ''}
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className={RATING_BADGE[costing.rating]}>{costing.foodCostPct ? percent(costing.foodCostPct) : 'No price'}</span>
      {costing.estimates.length > 0 && <span className={`${muted} text-xs`} title={`Estimated yields: ${costing.estimates.join(', ')}`}>estimate</span>}
      {costing.asNeeded.length > 0 && <span className={`${muted} text-xs`} title={`Not in the cost: ${costing.asNeeded.join(', ')}`}>+ as needed</span>}
      <span className={`${muted} text-xs tabular-nums`}>cost {money(costing.cost)}</span>
    </span>
  );
}

const STATUS_LABEL = { live: 'Live menu', draft: 'Draft menu', archived: 'Archived menu' } as const;

function MenuSwitcher({ menus, current }: { menus: MenuDto[]; current: string }) {
  if (menus.length < 2) return null;
  const rank = { live: 0, draft: 1, archived: 2 } as const;
  return (
    <nav aria-label="Menus" className="flex flex-wrap gap-2">
      {[...menus].sort((a, b) => rank[a.status] - rank[b.status]).map((m) => (
        <Link
          key={m.id}
          href={`/menu?m=${m.id}`}
          aria-current={m.id === current ? 'page' : undefined}
          className={`inline-flex min-h-11 items-center gap-2 rounded-sm border-2 px-3 text-sm font-bold ${
            m.id === current ? 'border-mazcina-wood bg-mazcina-wood text-white' : 'border-mazcina-wood/40 bg-white text-mazcina-wood hover:border-mazcina-wood'
          }`}
        >
          {m.name}
          <span className="text-xs font-semibold uppercase tracking-wide opacity-80">{m.status}</span>
        </Link>
      ))}
    </nav>
  );
}

function CloneForm({ menu }: { menu: MenuDto }) {
  return (
    <ActionForm action={cloneMenu} submitLabel="Copy to a new draft" className="mt-3">
      <input type="hidden" name="sourceId" value={menu.id} />
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <div>
          <label htmlFor="clone-name" className={label}>Name of the new menu</label>
          <input id="clone-name" name="name" required maxLength={120} placeholder="Summer 2026, Mother's Day…" className={input} />
        </div>
        <div>
          <label htmlFor="clone-kind" className={label}>Kind</label>
          <select id="clone-kind" name="kind" defaultValue="seasonal" className={input}>
            <option value="seasonal">Seasonal (replaces the live menu)</option>
            <option value="special">Special (runs alongside)</option>
          </select>
        </div>
      </div>
      <p className={`mt-2 ${muted}`}>Copies every item, price and recipe link. Change it freely; the live menu is not touched.</p>
    </ActionForm>
  );
}

export default async function MenuPage({ searchParams }: PageProps<'/menu'>) {
  const user = await requireRole('owner', 'chef');
  const { m: requested } = await searchParams;
  const [data, menus] = await Promise.all([loadCostingData(), loadMenus()]);
  const menu =
    menus.find((m) => m.id === requested) ??
    menus.find((m) => m.status === 'live' && m.kind === 'seasonal') ??
    menus.find((m) => m.status !== 'archived') ??
    menus[0];

  if (!menu) {
    return (
      <div className="space-y-4">
        <h1 className={h1}>Menu</h1>
        <p className={muted}>No menu has been loaded yet.</p>
      </div>
    );
  }

  if (menu.status === 'archived') {
    const snapshot = await loadSnapshot(menu.id);
    return (
      <div className="space-y-6">
        <MenuSwitcher menus={menus} current={menu.id} />
        <div>
          <p className={eyebrow}>{STATUS_LABEL.archived}</p>
          <h1 className={h1}>{menu.name}</h1>
        </div>
        <section className={card}>
          <h2 className={h2}>Costs when it was archived{snapshot ? ` (${displayDate(snapshot.asOf)})` : ''}</h2>
          {!snapshot ? (
            <p className={`mt-2 ${muted}`}>No record was kept for this menu.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100">
              {snapshot.items.map((item) => (
                <li key={`${item.category}-${item.name}`} className="flex items-center justify-between gap-3 py-2.5">
                  <span>
                    <span className="font-semibold">{item.name}</span>
                    <span className={`block ${muted} tabular-nums`}>{item.category} · {moneyFromCents(item.sellPriceCents)}</span>
                  </span>
                  <span className="text-right tabular-nums">
                    {item.foodCostPct ? <span className="font-semibold">{percent(item.foodCostPct)}</span> : <span className={muted}>Not costed</span>}
                    {item.cost && <span className={`block ${muted}`}>cost {money(item.cost)}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className={`mt-3 ${muted}`}>These figures are frozen and do not change with later prices.</p>
        </section>
        <section className={card}>
          <h2 className={h2}>Use it again</h2>
          <CloneForm menu={menu} />
          <div className="mt-5 border-t border-gray-100 pt-4">
            <p className={`mb-2 ${muted}`}>Archived by mistake? Reopen it as a draft. The record above is kept.</p>
            <ActionButton action={setMenuStatus.bind(null, menu.id, 'draft')} label="Reopen as draft" />
          </div>
        </section>
      </div>
    );
  }

  const ctx = contextFrom(data);
  const active = menu.items.filter((i) => !i.archived);
  const trashed = menu.items.filter((i) => i.archived);
  const rows = active.map((item) => ({ item, costing: costMenuItem(item, ctx, data.settings) }));
  const { costed, incomplete, unlinked, partial, watch, high, dishes, dishesCosted, average } = menuSummary(rows);

  return (
    <div className="space-y-6">
      <MenuSwitcher menus={menus} current={menu.id} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className={eyebrow}>{STATUS_LABEL[menu.status]}{menu.kind === 'special' ? ' · special' : ''}</p>
          <h1 className={h1}>{menu.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/menu/sheet?m=${menu.id}`} className={secondary}>Costing sheet</Link>
          {menu.status === 'draft' && (
            <ActionButton
              action={setMenuStatus.bind(null, menu.id, 'live')}
              label="Make live"
              className={primary}
              confirm={
                menu.kind === 'seasonal'
                  ? `Make "${menu.name}" the live menu? The current live menu is archived with today's costs.`
                  : `Make "${menu.name}" live?`
              }
            />
          )}
          {menu.status === 'live' && <ActionButton action={setMenuStatus.bind(null, menu.id, 'draft')} label="Back to draft" />}
          <ActionButton
            action={setMenuStatus.bind(null, menu.id, 'archived')}
            label="Archive"
            confirm={`Archive "${menu.name}"? Today's costs are kept as a record and the menu can no longer be edited.`}
          />
        </div>
      </div>

      <section className={card} aria-label="Summary">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className={muted}>Items costed</dt>
            <dd className="text-2xl font-extrabold tabular-nums">{costed} of {active.length}</dd>
          </div>
          <div>
            <dt className={muted}>Average food cost</dt>
            <dd className="text-2xl font-extrabold tabular-nums">{average ? percent(average) : '—'}</dd>
            <dd className={`${muted} text-xs`}>
              {average ? `across ${dishesCosted} of ${dishes} dishes` : `not enough dishes costed yet (${dishesCosted} of ${dishes})`}
            </dd>
          </div>
          <div>
            <dt className={muted}>Target</dt>
            <dd className="text-2xl font-extrabold tabular-nums">{percent(data.settings.targetFoodCostPct)}</dd>
          </div>
          <div>
            <dt className={muted}>Over target</dt>
            <dd className="text-2xl font-extrabold tabular-nums">{costed > 0 ? high + watch : '—'}</dd>
            {costed > 0 && <dd className={`${muted} text-xs`}>{high} well over, {watch} a little over</dd>}
          </div>
        </dl>
        <p className={`mt-3 ${muted}`}>
          Food cost % is the cost of one serve against the menu price{data.settings.gstRegistered ? ' with GST taken off' : ''}. The average
          leaves out add-ons and anything not fully costed, and appears once at least {MIN_DISHES_FOR_AVERAGE} dishes and half of all dishes
          are costed, so a few cheap items cannot stand in for the whole menu.
        </p>
        {(incomplete > 0 || unlinked > 0) && (
          <p className={`mt-2 ${badgeWarn}`}>
            {[
              incomplete > 0 && `${incomplete} ${incomplete === 1 ? 'item needs' : 'items need'} a supplier price or a fix to its recipe`,
              unlinked > 0 && `${unlinked} ${unlinked === 1 ? 'item has' : 'items have'} no recipe linked`,
            ]
              .filter(Boolean)
              .join(' · ')}
            .{' '}
            <Link href={`/prices-needed?m=${menu.id}`} className="underline">Fill in what is missing</Link>
          </p>
        )}
        {partial > 0 && (
          <p className={`mt-2 ${muted}`}>
            {partial} costed {partial === 1 ? 'item uses' : 'items use'} ingredients &ldquo;as needed&rdquo; (salt, oil, ...) that are not in the cost, so
            {partial === 1 ? ' its' : ' their'} food cost % reads slightly low.
          </p>
        )}
      </section>

      {groupByCategory(rows.map((r) => ({ ...r, category: r.item.category }))).map(([category, group]) => (
        <section key={category} className={card}>
          <h2 className={h2}>{category}</h2>
          <ul className="mt-2 divide-y divide-gray-100">
            {group.map(({ item, costing }) => (
              <li key={item.id} className="flex min-h-14 items-center justify-between gap-3 py-2">
                <Link href={`/menu/${item.id}`} className="min-w-0 flex-1 py-1 hover:text-mazcina-wood">
                  <span className="font-semibold">{item.name}</span>
                  <span className={`block ${muted} tabular-nums`}>{moneyFromCents(item.sellPriceCents)}</span>
                </Link>
                {costing.status === 'incomplete' && menu.status !== 'archived' ? (
                  <Link href={`/prices-needed?m=${menu.id}&item=${item.id}`} className="rounded-sm hover:opacity-80" aria-label={`Fix the costing for ${item.name}`}>
                    <Costing costing={costing} />
                  </Link>
                ) : (
                  <Link href={`/menu/${item.id}`} tabIndex={-1} aria-hidden>
                    <Costing costing={costing} />
                  </Link>
                )}
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

      <section className={card}>
        <h2 className={h2}>New season or special</h2>
        <CloneForm menu={menu} />
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
                <input type="checkbox" name="gstRegistered" defaultChecked={data.settings.gstRegistered} className="size-6 shrink-0 accent-mazcina-wood" />
                Mazcina is registered for GST
              </label>
            </div>
            <p className={`mt-2 ${muted}`}>
              Changing either one re-costs every dish. When Mazcina is not registered for GST, GST is kept in ingredient costs because it
              cannot be claimed back.
            </p>
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
