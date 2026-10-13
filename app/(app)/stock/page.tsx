import type { Metadata } from 'next';
import Link from 'next/link';
import DecimalJs from 'decimal.js';
import { badgeBad, badgeOk, badgeWarn, card, h1, h2, muted, primary, secondary } from '@/components/ui';
import { ingredientUnitCost } from '@/lib/costing';
import { money } from '@/lib/format';
import { contextFrom, loadCostingData, loadStock } from '@/lib/queries';
import { requireRole } from '@/lib/session';
import { formatStock, stockLine, type StockStatus } from '@/lib/stock';

export const metadata: Metadata = { title: 'Stock' };

const STATUS: Record<StockStatus, { label: string; badge: string }> = {
  out: { label: 'Out', badge: badgeBad },
  low: { label: 'Low', badge: badgeWarn },
  ok: { label: 'OK', badge: badgeOk },
  no_par: { label: 'No minimum set', badge: 'inline-block rounded-sm bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-gray-700' },
  uncounted: { label: 'Not counted', badge: 'inline-block rounded-sm bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-gray-700' },
};
const ORDER: StockStatus[] = ['out', 'low', 'uncounted', 'no_par', 'ok'];

export default async function StockPage() {
  await requireRole('owner', 'chef');
  const [data, stock] = await Promise.all([loadCostingData(), loadStock()]);
  const ctx = contextFrom(data);
  const supplierName = new Map(data.suppliers.map((s) => [s.id, s.name]));
  const when = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short' });

  const rows = data.ingredients
    .filter((i) => !i.archived)
    .map((ingredient) => {
      const level = stock.get(ingredient.id);
      const cost = ingredientUnitCost(ingredient.id, ctx);
      return { ingredient, level, line: stockLine({ onHand: level?.onHand ?? null, parLevel: ingredient.parLevel, unitCost: cost.ok ? cost.value : null }) };
    })
    .sort((a, b) => ORDER.indexOf(a.line.status) - ORDER.indexOf(b.line.status) || a.ingredient.name.localeCompare(b.ingredient.name));

  const total = rows.reduce((sum, r) => (r.line.value ? sum.plus(r.line.value) : sum), new DecimalJs(0));
  const unpriced = rows.filter((r) => r.line.onHand && r.line.onHand.gt(0) && !r.line.value).length;
  const toOrder = rows.filter((r) => r.line.toOrder && r.line.status !== 'uncounted');
  const lastCount = [...stock.values()].reduce<Date | null>((latest, s) => (s.lastCountedAt && (!latest || s.lastCountedAt > latest) ? s.lastCountedAt : latest), null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className={h1}>Stock</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/stock/receive" className={secondary}>Receive a delivery</Link>
          <Link href="/stock/count" className={primary}>Do a stocktake</Link>
        </div>
      </div>

      <section className={card} aria-label="Summary">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className={muted}>Stock value</dt>
            <dd className="text-2xl font-extrabold tabular-nums">{money(total)}</dd>
          </div>
          <div>
            <dt className={muted}>Out or low</dt>
            <dd className="text-2xl font-extrabold tabular-nums">{rows.filter((r) => r.line.status === 'out' || r.line.status === 'low').length}</dd>
          </div>
          <div>
            <dt className={muted}>Not counted yet</dt>
            <dd className="text-2xl font-extrabold tabular-nums">{rows.filter((r) => r.line.status === 'uncounted').length}</dd>
          </div>
          <div>
            <dt className={muted}>Last stocktake</dt>
            <dd className="text-2xl font-extrabold">{lastCount ? when.format(lastCount) : 'Never'}</dd>
          </div>
        </dl>
        <p className={`mt-3 ${muted}`}>
          Stock only changes when a delivery, waste or a count is recorded here. It does not go down as dishes are sold, so it is as fresh as
          the last stocktake. Value is before GST{unpriced > 0 ? `, and leaves out ${unpriced} item${unpriced === 1 ? '' : 's'} with no price` : ''}.
        </p>
      </section>

      {toOrder.length > 0 && (
        <section className={card}>
          <h2 className={h2}>To order ({toOrder.length})</h2>
          <ul className="mt-2 divide-y divide-gray-100">
            {toOrder.map(({ ingredient, line }) => (
              <li key={ingredient.id} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5">
                <span>
                  <span className="font-semibold">{ingredient.name}</span>
                  {ingredient.preferredSupplierId && <span className={muted}> · {supplierName.get(ingredient.preferredSupplierId)}</span>}
                </span>
                <span className="tabular-nums">
                  <span className="font-semibold">{formatStock(line.toOrder!, ingredient.baseUnit)}</span>
                  <span className={muted}> to reach {formatStock(ingredient.parLevel!, ingredient.baseUnit)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={card}>
        <h2 className={h2}>All stock ({rows.length})</h2>
        {rows.length === 0 ? (
          <p className={`mt-2 ${muted}`}>
            No ingredients yet. <Link href="/ingredients" className="font-semibold text-mazcina-wood underline">Add ingredients</Link> first.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100">
            {rows.map(({ ingredient, line }) => (
              <li key={ingredient.id}>
                <Link href={`/ingredients/${ingredient.id}#stock`} className="flex min-h-14 items-center justify-between gap-3 py-2 hover:text-mazcina-wood">
                  <span>
                    <span className="font-semibold">{ingredient.name}</span>
                    <span className={`block ${muted} tabular-nums`}>
                      {line.onHand ? formatStock(line.onHand, ingredient.baseUnit) : 'No stock recorded'}
                      {ingredient.parLevel && Number(ingredient.parLevel) > 0 ? ` · keep ${formatStock(ingredient.parLevel, ingredient.baseUnit)}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className={STATUS[line.status].badge}>{STATUS[line.status].label}</span>
                    {line.value && <span className={`${muted} text-xs tabular-nums`}>{money(line.value)}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
