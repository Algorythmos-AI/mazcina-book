'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { badgeWarn, card, h2, input, muted, secondary } from '@/components/ui';
import type { Unit } from '@/lib/costing';
import { displayDate, money, unitName, unitPrice } from '@/lib/format';
import { PriceForm, type LastPrice, type PriceFormIngredient } from '../ingredients/price-form';

export interface PriceRow {
  ingredient: PriceFormIngredient;
  category: string | null;
  units: Unit[];
  defaultUnit: Unit;
  defaultSupplierId: string;
  /** The price in use today, or null when there is none yet. */
  last: LastPrice | null;
  /** The day the price in use started. */
  since: string | null;
  /** Recipes (dishes and preps) that use it. */
  usedIn: number;
}

export interface PriceGroup {
  /** Supplier id, or "none" for ingredients with no price yet. */
  key: string;
  name: string;
  rows: PriceRow[];
}

function Row({
  row,
  open,
  onToggle,
  saved,
  onSaved,
  suppliers,
  today,
  gstRegistered,
}: {
  row: PriceRow;
  open: boolean;
  onToggle: () => void;
  saved: string | null;
  onSaved: (summary: string) => void;
  suppliers: { id: string; name: string }[];
  today: string;
  gstRegistered: boolean;
}) {
  const { ingredient, last } = row;
  const details = [row.category, row.usedIn > 0 ? `in ${row.usedIn} recipe${row.usedIn === 1 ? '' : 's'}` : 'not in a recipe'].filter(Boolean).join(' · ');
  return (
    <li id={`price-${ingredient.id}`} className="scroll-mt-40 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-48">
          <Link href={`/ingredients/${ingredient.id}`} className="font-semibold hover:text-mazcina-wood">{ingredient.name}</Link>
          <span className={`block ${muted}`}>{details}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right tabular-nums">
            {last ? (
              <>
                <span className="block font-semibold">
                  {money(last.packPrice)} for {last.packSize} {unitName(last.packUnit)}
                </span>
                <span className={`block ${muted}`}>
                  {last.unitCost ? unitPrice(last.unitCost, ingredient.baseUnit) : 'needs a conversion'}
                  {row.since ? ` · since ${displayDate(row.since)}` : ''}
                </span>
              </>
            ) : (
              <span className={badgeWarn}>No price</span>
            )}
            {saved && !open && (
              <span role="status" className="block text-sm font-semibold text-emerald-700">Saved: {saved}</span>
            )}
          </div>
          <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={`price-form-${ingredient.id}`} className={`${secondary} shrink-0`}>
            {open ? 'Close' : last ? 'Change' : 'Add price'}
          </button>
        </div>
      </div>
      {open && (
        <div id={`price-form-${ingredient.id}`} className="mt-3 rounded-md border border-gray-200 bg-white p-3">
          <PriceForm
            compact
            ingredient={ingredient}
            suppliers={suppliers}
            units={row.units}
            last={last}
            defaultSupplierId={row.defaultSupplierId}
            defaultUnit={row.defaultUnit}
            today={today}
            gstRegistered={gstRegistered}
            onSaved={onSaved}
          />
        </div>
      )}
    </li>
  );
}

/**
 * The price list, filtered to one supplier when working through their
 * invoice, or searched by name. One row opens at a time, with the same price
 * form as the ingredient's page: type the new pack price and press Enter.
 */
export function PriceList({
  groups,
  priced,
  suppliers,
  today,
  gstRegistered,
}: {
  groups: PriceGroup[];
  priced: number;
  suppliers: { id: string; name: string }[];
  today: string;
  gstRegistered: boolean;
}) {
  const fieldId = useId();
  const [query, setQuery] = useState('');
  const [only, setOnly] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});

  const term = query.trim().toLowerCase();
  const matches = (row: PriceRow) => !term || `${row.ingredient.name} ${row.category ?? ''}`.toLowerCase().includes(term);
  const shown = groups
    .filter((g) => !only || g.key === only)
    .map((g) => ({ ...g, rows: g.rows.filter(matches) }))
    .filter((g) => g.rows.length > 0);
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const count = shown.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="space-y-4">
      <div>
        <p className={muted}>
          {priced} of {total} ingredients have a price.
        </p>
        <label htmlFor={fieldId} className="sr-only">Find an ingredient</label>
        <input id={fieldId} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an ingredient…" className={`${input} mt-3`} />
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Supplier">
          {[{ key: '', name: 'All', size: total }, ...groups.map((g) => ({ key: g.key, name: g.name, size: g.rows.length }))].map((chip) => (
            <button
              key={chip.key}
              type="button"
              aria-pressed={only === chip.key}
              onClick={() => setOnly(chip.key)}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${only === chip.key ? 'border-mazcina-wood bg-mazcina-wood text-white' : 'border-gray-300 bg-white'}`}
            >
              {chip.name} <span className="tabular-nums opacity-75">{chip.size}</span>
            </button>
          ))}
        </div>
        {(term || only) && (
          <p className="mt-2 text-sm font-semibold" aria-live="polite">{count === 0 ? 'Nothing matches.' : `${count} shown`}</p>
        )}
      </div>

      {shown.map((group) => (
        <section key={group.key} className={card} aria-labelledby={`group-${group.key}`}>
          <h2 id={`group-${group.key}`} className={h2}>
            {group.name} <span className={`font-normal ${muted}`}>({group.rows.length})</span>
          </h2>
          {group.key === 'none' && (
            <p className={`mt-1 ${muted}`}>
              The ones holding back the menu are on <Link href="/prices-needed" className="font-semibold text-mazcina-wood underline">To do</Link>, most needed first.
            </p>
          )}
          <ul className="mt-1 divide-y divide-gray-100">
            {group.rows.map((row) => (
              <Row
                key={row.ingredient.id}
                row={row}
                open={open === row.ingredient.id}
                onToggle={() => setOpen((current) => (current === row.ingredient.id ? null : row.ingredient.id))}
                saved={saved[row.ingredient.id] ?? null}
                onSaved={(summary) => {
                  setSaved((all) => ({ ...all, [row.ingredient.id]: summary }));
                  setOpen(null);
                }}
                suppliers={suppliers}
                today={today}
                gstRegistered={gstRegistered}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
