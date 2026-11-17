'use client';

import DecimalJs from 'decimal.js';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useRef, useState, useTransition } from 'react';
import { isConnectionError, OFFLINE_MESSAGE } from '@/components/action-form';
import { Affix } from '@/components/affix';
import { checkbox, input, label, muted, primary, secondary } from '@/components/ui';
import { parseDecimalInput, parseMoneyInput, type BaseUnit, type Unit } from '@/lib/costing';
import { money, plain, unitName, unitPrice } from '@/lib/format';
import { priceWarnings, typedUnitCost, type GstMode, type PriceWarning } from '@/lib/price-check';
import { addPrice, quickAddSupplier } from '../actions';

export interface PriceFormIngredient {
  id: string;
  name: string;
  baseUnit: BaseUnit;
  gramsPerEach: string | null;
  gramsPerMl: string | null;
  gramsPerBunch: string | null;
}

export interface LastPrice {
  supplierId: string;
  supplierName: string;
  packSize: string;
  packUnit: Unit;
  packPrice: string;
  gst: GstMode;
  /** Cost per base unit, as a string, for the "is this right?" check. */
  unitCost: string | null;
}

/** The supplier picker's last option: opens the "new supplier" field instead of choosing one. */
const NEW_SUPPLIER = '__new';

const GST_CHOICES: { value: GstMode; label: string; hint: string }[] = [
  { value: 'free', label: 'No GST on this item', hint: 'fresh fruit, veg, meat, fish' },
  { value: 'inc', label: 'Has GST, price includes it', hint: 'the shelf or invoice total' },
  { value: 'ex', label: 'Has GST, price is before GST', hint: 'a wholesale list "ex GST"' },
];

function warningText(w: PriceWarning, last: LastPrice | null, next: DecimalJs | null, baseUnit: BaseUnit): string {
  if (w.kind === 'jump') {
    const was = last?.unitCost ? unitPrice(last.unitCost, baseUnit) : 'the last price';
    const now = next ? unitPrice(next, baseUnit) : 'this';
    return `${now} is about ${Math.round(w.ratio)} times ${w.higher ? 'more' : 'less'} than last time (${was}). Check the pack size and the unit.`;
  }
  if (w.kind === 'future') return `The price starts in ${w.days} day${w.days === 1 ? '' : 's'}, so costs will not change until then.`;
  return `The date is ${w.days} days ago. A newer price may already be in use, so this one might never count.`;
}

/**
 * Typing a supplier price: shows what it works out to per kg, litre or each
 * while you type, and asks before saving anything that looks like a slip
 * (ten times the last price, a date far off). What was typed is kept when
 * a save fails.
 */
export function PriceForm({
  ingredient,
  suppliers,
  units,
  last,
  defaultSupplierId,
  defaultUnit,
  today,
  gstRegistered,
  compact = false,
  onSaved,
}: {
  ingredient: PriceFormIngredient;
  suppliers: { id: string; name: string }[];
  units: Unit[];
  last: LastPrice | null;
  defaultSupplierId: string;
  defaultUnit: Unit;
  today: string;
  gstRegistered: boolean;
  /** One row in a list: no date field and no free tick. */
  compact?: boolean;
  onSaved?: (summary: string) => void;
}) {
  const router = useRouter();
  const id = useId();
  const priceRef = useRef<HTMLInputElement>(null);
  const [supplierId, setSupplierId] = useState(last?.supplierId ?? defaultSupplierId);
  const [packSize, setPackSize] = useState(last?.packSize ?? '');
  const [packUnit, setPackUnit] = useState<Unit>(last?.packUnit ?? defaultUnit);
  const [packPrice, setPackPrice] = useState('');
  const [gst, setGst] = useState<GstMode>(last?.gst ?? 'free');
  const [date, setDate] = useState(today);
  const [free, setFree] = useState(false);
  const [confirming, setConfirming] = useState<PriceWarning[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [bunchWeight, setBunchWeight] = useState('');
  const [added, setAdded] = useState<{ id: string; name: string }[]>([]);
  const [newSupplier, setNewSupplier] = useState<string | null>(null);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [adding, startAdding] = useTransition();

  // Added here, kept until the page's own list catches up after the refresh.
  const supplierList = [...suppliers, ...added.filter((a) => !suppliers.some((s) => s.id === a.id))];
  // Anything weighed can be bought by the bunch; the first bunch price asks what one weighs.
  const unitChoices: Unit[] = ingredient.baseUnit === 'g' && !units.includes('bunch') ? [...units, 'bunch'] : units;
  const needsBunchWeight = packUnit === 'bunch' && !ingredient.gramsPerBunch;
  const gramsInBunch = packUnit === 'bunch' ? (needsBunchWeight ? parseDecimalInput(bunchWeight) : ingredient.gramsPerBunch) : null;

  const next = useMemo(
    () => typedUnitCost({ ...ingredient, gramsPerBunch: gramsInBunch }, { packSize, packUnit, packPrice, gst }, gstRegistered),
    [ingredient, gramsInBunch, packSize, packUnit, packPrice, gst, gstRegistered],
  );
  const perBunch = next && gramsInBunch ? next.times(gramsInBunch) : null;

  const addSupplier = () => {
    if (newSupplier === null) return;
    setSupplierError(null);
    startAdding(async () => {
      try {
        const result = await quickAddSupplier(newSupplier);
        if (!result.ok) return setSupplierError(result.error);
        setAdded((list) => [...list, result.data!]);
        setSupplierId(result.data!.id);
        setNewSupplier(null);
        router.refresh();
      } catch (error) {
        if (!isConnectionError(error)) throw error;
        setSupplierError(OFFLINE_MESSAGE);
      }
    });
  };
  const lastCost = last?.unitCost ? new DecimalJs(last.unitCost) : null;
  // Said while typing, not after Save: "1,234" could be 1234 or 1.234.
  const unclearPrice = packPrice.trim() !== '' && parseMoneyInput(packPrice) === null;

  const save = (checked: boolean) => {
    setError(null);
    setSaved(null);
    if (!checked) {
      const warnings = priceWarnings({ next, last: lastCost, date: compact ? today : date, today });
      if (warnings.length > 0) return setConfirming(warnings);
    }
    setConfirming(null);
    const form = new FormData();
    form.set('ingredientId', ingredient.id);
    form.set('supplierId', supplierId);
    form.set('packSize', packSize);
    form.set('packUnit', packUnit);
    form.set('packPrice', packPrice);
    form.set('gst', gst);
    form.set('effectiveDate', compact ? today : date);
    if (needsBunchWeight) form.set('gramsPerBunch', bunchWeight);
    if (free) form.set('free', 'on');
    start(async () => {
      try {
        const result = await addPrice(null, form);
        if (!result.ok) return setError(result.error);
        const summary = next ? unitPrice(next, ingredient.baseUnit) : 'Saved';
        setSaved(summary);
        setPackPrice('');
        onSaved?.(summary);
        router.refresh();
      } catch (error) {
        if (!isConnectionError(error)) throw error;
        setError(OFFLINE_MESSAGE);
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(false);
      }}
      className={compact ? '' : 'mt-3'}
    >
      <p id={`${id}-how`} className={`mb-3 ${muted}`}>
        Type what you pay for the whole pack, as on the invoice: for example 5 kg for $22.50. We work out the cost per gram.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2">
          <label htmlFor={`${id}-supplier`} className={label}>Supplier</label>
          <select
            id={`${id}-supplier`}
            value={supplierId}
            onChange={(e) => (e.target.value === NEW_SUPPLIER ? setNewSupplier('') : setSupplierId(e.target.value))}
            className={input}
          >
            {supplierList.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
            <option value={NEW_SUPPLIER}>+ New supplier…</option>
          </select>
          {newSupplier !== null && (
            <div className="mt-2">
              <div className="flex gap-2">
                <input
                  aria-label="New supplier's name"
                  autoFocus
                  enterKeyHint="done"
                  placeholder="Name"
                  value={newSupplier}
                  onChange={(e) => setNewSupplier(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter adds the supplier; it must not save the price as well.
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSupplier();
                    }
                  }}
                  className={`${input} min-w-0 flex-1`}
                />
                <button type="button" onClick={addSupplier} disabled={adding} className={primary}>
                  {adding ? 'Adding…' : 'Add'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewSupplier(null);
                    setSupplierError(null);
                  }}
                  className={secondary}
                >
                  Cancel
                </button>
              </div>
              {supplierError && (
                <p role="alert" className="mt-1 text-sm font-semibold text-red-700">{supplierError}</p>
              )}
            </div>
          )}
        </div>
        <div>
          <label htmlFor={`${id}-size`} className={label}>Pack size</label>
          <input
            id={`${id}-size`}
            inputMode="decimal"
            enterKeyHint="next"
            required
            placeholder="e.g. 5"
            value={packSize}
            onChange={(e) => setPackSize(e.target.value)}
            className={input}
          />
        </div>
        <div>
          <label htmlFor={`${id}-unit`} className={label}>Unit</label>
          <select id={`${id}-unit`} value={packUnit} onChange={(e) => setPackUnit(e.target.value as Unit)} className={input}>
            {unitChoices.map((u) => (
              <option key={u} value={u}>{unitName(u)}</option>
            ))}
          </select>
        </div>
        {packUnit === 'bunch' &&
          (needsBunchWeight ? (
            <div className="col-span-2">
              <label htmlFor={`${id}-bunch`} className={label}>One bunch weighs</label>
              <Affix suffix="g">
                <input
                  id={`${id}-bunch`}
                  inputMode="decimal"
                  enterKeyHint="next"
                  required
                  placeholder="e.g. 80"
                  value={bunchWeight}
                  onChange={(e) => setBunchWeight(e.target.value)}
                  aria-describedby={`${id}-bunch-hint`}
                  className={`${input} pr-12`}
                />
              </Affix>
              <p id={`${id}-bunch-hint`} className={`mt-1 text-sm ${muted}`}>
                Weigh one bunch once. Recipes can then use grams or part of a bunch.
              </p>
            </div>
          ) : (
            <p className={`col-span-2 self-end pb-2 text-sm ${muted}`}>1 bunch weighs {plain(ingredient.gramsPerBunch)} g</p>
          ))}
        <div className={compact ? 'col-span-2' : ''}>
          <label htmlFor={`${id}-price`} className={label}>Price for the whole pack</label>
          <Affix prefix="$">
            <input
              ref={priceRef}
              id={`${id}-price`}
              inputMode="decimal"
              enterKeyHint={compact ? 'done' : 'next'}
              required
              placeholder={last ? undefined : 'e.g. 22.50'}
              value={packPrice}
              onChange={(e) => setPackPrice(e.target.value)}
              aria-describedby={`${id}-how ${id}-preview`}
              className={`${input} pl-7`}
            />
          </Affix>
        </div>
        {!compact && (
          <div>
            <label htmlFor={`${id}-date`} className={label}>From</label>
            <input id={`${id}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          </div>
        )}
      </div>

      <p id={`${id}-preview`} className="mt-3 min-h-6 tabular-nums" aria-live="polite">
        {unclearPrice ? (
          <span className="block font-semibold text-amber-800">Type the price like 22.50 or 1234.50</span>
        ) : next ? (
          <span className="block rounded-md border-l-4 border-emerald-600 bg-emerald-50 px-3 py-2 text-lg font-bold text-emerald-900">
            Works out to {unitPrice(next, ingredient.baseUnit)}
            {perBunch ? `, ${money(perBunch)} a bunch` : ''}
            {gstRegistered && gst !== 'free' ? ' before GST' : ''}
          </span>
        ) : null}
        {last && (
          <span className={`mt-1 block ${muted}`}>
            last {money(last.packPrice)} for {last.packSize} {last.packUnit} from {last.supplierName}
            {last.unitCost ? ` (${unitPrice(last.unitCost, ingredient.baseUnit)})` : ''}
          </span>
        )}
      </p>

      <fieldset className="mt-2">
        <legend className={label}>GST</legend>
        <div className="mt-1 grid gap-1 sm:grid-cols-3">
          {GST_CHOICES.map((choice) => (
            <label key={choice.value} className="flex min-h-11 items-start gap-2 rounded-md border border-gray-200 bg-white p-2 text-sm has-checked:border-mazcina-wood">
              <input type="radio" name={`${id}-gst`} value={choice.value} checked={gst === choice.value} onChange={() => setGst(choice.value)} className={checkbox} />
              <span>
                <span className="block font-semibold">{choice.label}</span>
                <span className={muted}>{choice.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {!compact && (
        <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} className={checkbox} />
          This costs nothing (only with a $0 price: tap water, herbs from the garden)
        </label>
      )}

      {confirming ? (
        <div role="alert" className="mt-3 rounded-md border-l-4 border-amber-500 bg-amber-50 p-3">
          <p className="font-bold">Is this right?</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {confirming.map((w) => (
              <li key={w.kind}>{warningText(w, last, next, ingredient.baseUnit)}</li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" onClick={() => save(true)} disabled={pending} className={primary}>Yes, save it</button>
            <button
              type="button"
              onClick={() => {
                setConfirming(null);
                priceRef.current?.focus();
              }}
              className={secondary}
            >
              Let me fix it
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={primary}>
            {pending ? 'Saving…' : 'Save price'}
          </button>
          {!pending && error && (
            <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>
          )}
          {!pending && saved && (
            <p role="status" className="text-sm font-semibold text-emerald-700">Saved: {saved}</p>
          )}
        </div>
      )}
    </form>
  );
}
