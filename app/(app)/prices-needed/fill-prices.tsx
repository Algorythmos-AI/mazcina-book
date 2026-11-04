'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { badgeOk, badgeWarn, card, link, muted } from '@/components/ui';
import type { Unit } from '@/lib/costing';
import { PriceForm, type LastPrice, type PriceFormIngredient } from '../ingredients/price-form';

export interface FillRow {
  ingredient: PriceFormIngredient;
  units: Unit[];
  defaultUnit: Unit;
  defaultSupplierId: string;
  /** A price from another supplier or a later date, shown as a hint. Usually null here. */
  last: LastPrice | null;
  /** Menu items waiting on this price. */
  items: string[];
}

const SHOWN = 4;

/** The dishes waiting on a price: a few names and the rest one tap away, so the price fields stay near the top. */
function DishList({ items }: { items: string[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, SHOWN);
  const hidden = items.length - shown.length;
  return (
    <p className={`mt-1 ${muted}`}>
      {shown.join(', ')}
      {hidden > 0 && (
        <>
          {' '}
          <button type="button" onClick={() => setAll(true)} className={`${link} text-sm`}>
            and {hidden} more
          </button>
        </>
      )}
    </p>
  );
}

/**
 * One price after another, without leaving the page: each row saves on its
 * own (Enter on the price saves it), ticks off, and the next row's first
 * field is ready to type into.
 */
export function FillPrices({
  rows,
  suppliers,
  today,
  gstRegistered,
}: {
  rows: FillRow[];
  suppliers: { id: string; name: string }[];
  today: string;
  gstRegistered: boolean;
}) {
  const [done, setDone] = useState<{ name: string; summary: string }[]>([]);
  const focusNext = useRef<string | null>(null);

  // Once the saved row has left the list (the page refreshes after a save), put the cursor in the next one.
  useEffect(() => {
    if (!focusNext.current) return;
    const field = document.querySelector<HTMLInputElement>(`#fill-${focusNext.current} input[inputmode=decimal]`);
    focusNext.current = null;
    field?.focus();
    field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [rows]);

  return (
    <div className="space-y-4">
      {done.length > 0 && (
        <section className={card} role="status">
          <p className={badgeOk}>{done.length} price{done.length === 1 ? '' : 's'} saved</p>
          <ul className={`mt-2 ${muted}`}>
            {done.map((d) => (
              <li key={d.name}>
                {d.name}: {d.summary}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            <Link href="/menu" className={link}>See the menu&apos;s costs</Link>
          </p>
        </section>
      )}

      {rows.length === 0 && done.length > 0 && <p className="font-semibold">All done here.</p>}

      <ol className="grid gap-4 lg:grid-cols-2">
        {rows.map((row, index) => (
          <li key={row.ingredient.id} id={`fill-${row.ingredient.id}`} className={`${card} scroll-mt-40`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-bold">
                <Link href={`/ingredients/${row.ingredient.id}`} className="hover:text-mazcina-wood">{row.ingredient.name}</Link>
              </h3>
              <span className={badgeWarn}>
                needed by {row.items.length} {row.items.length === 1 ? 'dish' : 'dishes'}
              </span>
            </div>
            <DishList items={row.items} />
            <div className="mt-3">
              <PriceForm
                compact
                ingredient={row.ingredient}
                suppliers={suppliers}
                units={row.units}
                last={row.last}
                defaultSupplierId={row.defaultSupplierId}
                defaultUnit={row.defaultUnit}
                today={today}
                gstRegistered={gstRegistered}
                onSaved={(summary) => {
                  setDone((list) => [...list, { name: row.ingredient.name, summary }]);
                  focusNext.current = rows[index + 1]?.ingredient.id ?? null;
                }}
              />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
