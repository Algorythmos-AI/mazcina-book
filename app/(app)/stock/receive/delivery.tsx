'use client';

import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore, useTransition } from 'react';
import { safely } from '@/components/action-form';
import { Affix } from '@/components/affix';
import { SearchPick } from '@/components/search-pick';
import { badgeOk, card, h2, input, label, link, muted, primary, secondary } from '@/components/ui';
import { parseDecimalInput, parseMoneyInput, type Unit } from '@/lib/costing';
import { unitName } from '@/lib/format';
import { recordDelivery } from '../actions';

export interface DeliveryItem {
  id: string;
  name: string;
  units: Unit[];
  defaultUnit: Unit;
  /** Has a price already, so a new one keeps its GST treatment. */
  priced: boolean;
}

type GstChoice = '' | 'free' | 'inc' | 'ex';

interface Line {
  key: string;
  ingredientId: string;
  quantity: string;
  unit: Unit;
  totalPaid: string;
  gst: GstChoice;
}

const amount = (raw: string) => parseMoneyInput(raw);
const isNumber = (raw: string) => parseDecimalInput(raw.trim()) !== null;
const DRAFT_KEY = 'mazcina-delivery-draft';

interface Draft {
  supplierId: string;
  lines: Line[];
  /** Sent with the save, kept for every retry, so a delivery sent twice is booked once. */
  requestKey: string;
}

function readDraft(): Draft | null {
  try {
    const draft = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? 'null') as Draft | null;
    return draft && Array.isArray(draft.lines) && typeof draft.requestKey === 'string' ? draft : null;
  } catch {
    return null;
  }
}

const noop = () => () => {};

/** Drawn only in the browser: the draft on this phone and the line ids would differ from a server render. */
export function Delivery(props: { items: DeliveryItem[]; suppliers: { id: string; name: string }[] }) {
  const inBrowser = useSyncExternalStore(noop, () => true, () => false);
  return inBrowser ? <DeliveryForm {...props} /> : <p className={muted}>Loading…</p>;
}

function DeliveryForm({ items, suppliers }: { items: DeliveryItem[]; suppliers: { id: string; name: string }[] }) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const blank = (): Line => ({ key: crypto.randomUUID(), ingredientId: '', quantity: '', unit: 'kg', totalPaid: '', gst: '' });
  const [draft] = useState(readDraft);
  const [supplierId, setSupplierId] = useState(draft?.supplierId ?? '');
  const [lines, setLines] = useState<Line[]>(() => (draft?.lines.length ? draft.lines : [blank()]));
  const [requestKey, setRequestKey] = useState(() => draft?.requestKey ?? crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ received: number; priced: number; repeat?: boolean } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    try {
      const empty = lines.every((l) => !l.ingredientId && !l.quantity.trim() && !l.totalPaid.trim());
      if (empty && !supplierId) window.localStorage.removeItem(DRAFT_KEY);
      else window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ supplierId, lines, requestKey } satisfies Draft));
    } catch {
      /* storage blocked: carry on without the safety net */
    }
  }, [supplierId, lines, requestKey]);

  const edit = (key: string, patch: Partial<Line>) => {
    setSaved(null);
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };
  const ready = lines.filter((l) => l.ingredientId && l.quantity.trim());
  // Half-filled lines would be dropped without a word; say which ones instead.
  const unfinished = lines.filter((l) => !(l.ingredientId && l.quantity.trim()) && (l.ingredientId || l.quantity.trim() || l.totalPaid.trim()));
  const needsGst = (l: Line) => !!l.totalPaid.trim() && !byId.get(l.ingredientId)?.priced;
  const problem =
    unfinished.length > 0
      ? `Line ${lines.indexOf(unfinished[0]) + 1} needs ${unfinished[0].ingredientId ? 'a quantity' : 'an ingredient'}, or remove it.`
      : ready.length === 0
      ? 'Add at least one item with a quantity.'
      : ready.some((l) => !isNumber(l.quantity) || (l.totalPaid.trim() && !isNumber(l.totalPaid)))
        ? 'One of the numbers is not clear (type 1500 or 1.5, not 1,500; prices like 22.50).'
        : ready.some((l) => l.totalPaid.trim() && Number(amount(l.totalPaid)) <= 0)
          ? 'An amount paid must be more than $0. Leave it blank if nothing was paid.'
          : ready.some((l) => needsGst(l) && !l.gst)
            ? 'Say whether each newly priced item has GST.'
            : null;

  const save = () =>
    start(async () => {
      setError(null);
      const result = await safely(() =>
        recordDelivery({
          supplierId: supplierId || null,
          requestKey,
          lines: ready.map((l) => ({ ingredientId: l.ingredientId, quantity: l.quantity.trim(), unit: l.unit, totalPaid: l.totalPaid.trim(), gst: needsGst(l) ? l.gst : '' })),
        }),
      );
      if (!result.ok) return setError(result.error);
      setSaved(result.data!);
      setLines([blank()]);
      setSupplierId('');
      setRequestKey(crypto.randomUUID());
    });

  return (
    <div className="space-y-6">
      {saved && (
        <section className={card} role="status">
          <p className={badgeOk}>
            {saved.repeat
              ? 'Already saved: this delivery went in the first time you tapped Save'
              : `${saved.received} item${saved.received === 1 ? '' : 's'} added to stock${saved.priced > 0 ? `, ${saved.priced} price${saved.priced === 1 ? '' : 's'} updated` : ''}`}
          </p>
          <p className="mt-2 flex flex-wrap gap-x-4">
            <Link href="/stock" className={link}>See stock levels</Link>
            {saved.priced > 0 && <Link href="/changes" className={link}>See which dishes changed</Link>}
          </p>
        </section>
      )}

      <section className={card}>
        <label htmlFor="delivery-supplier" className={label}>Supplier</label>
        <select id="delivery-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={`${input} max-w-sm`}>
          <option value="">Each ingredient&apos;s usual supplier</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </section>

      <section className={card}>
        <h2 className={h2}>What arrived</h2>
        <ul className="mt-2 divide-y divide-gray-100">
          {lines.map((line, index) => {
            const item = byId.get(line.ingredientId);
            return (
              <li key={line.key} className="grid grid-cols-2 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_6rem_6rem_8rem_auto]">
                <div className="col-span-2 sm:col-span-1">
                  <SearchPick
                    items={items}
                    value={line.ingredientId}
                    label={`Ingredient, line ${index + 1}`}
                    placeholder="Type an ingredient…"
                    onChange={(id) => edit(line.key, { ingredientId: id, unit: byId.get(id)?.defaultUnit ?? line.unit })}
                  />
                </div>
                <div>
                  <label htmlFor={`d-qty-${line.key}`} className="sr-only">Quantity, line {index + 1}</label>
                  <input id={`d-qty-${line.key}`} inputMode="decimal" enterKeyHint="next" placeholder="Qty" value={line.quantity} onChange={(e) => edit(line.key, { quantity: e.target.value })} className={input} />
                </div>
                <div>
                  <label htmlFor={`d-unit-${line.key}`} className="sr-only">Unit, line {index + 1}</label>
                  <select id={`d-unit-${line.key}`} value={line.unit} onChange={(e) => edit(line.key, { unit: e.target.value as Unit })} className={input}>
                    {(item?.units ?? [line.unit]).map((u) => (
                      <option key={u} value={u}>{unitName(u)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`d-paid-${line.key}`} className="sr-only">Amount paid for this line, optional</label>
                  <Affix prefix="$">
                    <input id={`d-paid-${line.key}`} inputMode="decimal" placeholder="paid" value={line.totalPaid} onChange={(e) => edit(line.key, { totalPaid: e.target.value })} className={`${input} pl-7`} />
                  </Affix>
                </div>
                <button
                  type="button"
                  onClick={() => setLines((current) => (current.length === 1 ? [blank()] : current.filter((l) => l.key !== line.key)))}
                  className={secondary}
                  aria-label={`Remove line ${index + 1}`}
                >
                  Remove
                </button>
                {needsGst(line) && (
                  <div className="col-span-2 sm:col-span-5">
                    <label htmlFor={`d-gst-${line.key}`} className={label}>First price for {item?.name}: does it have GST?</label>
                    <select id={`d-gst-${line.key}`} value={line.gst} onChange={(e) => edit(line.key, { gst: e.target.value as GstChoice })} className={`${input} max-w-md`}>
                      <option value="">Choose…</option>
                      <option value="free">No GST (fresh food)</option>
                      <option value="inc">Has GST, and the amount paid includes it</option>
                      <option value="ex">Has GST, but the amount paid is before GST</option>
                    </select>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={() => setLines((current) => [...current, blank()])} className={`mt-2 ${secondary}`}>Add another item</button>
        <p className={`mt-3 ${muted}`}>
          If you fill in what you paid for a line, that becomes the ingredient&apos;s new price from today (20 kg for $36 means $1.80 a kg), and every
          dish using it is re-costed. Leave it blank if the price has not changed.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending || !!problem} className={primary}>
          {pending ? 'Saving…' : `Add ${ready.length} item${ready.length === 1 ? '' : 's'} to stock`}
        </button>
        {problem && (ready.length > 0 || unfinished.length > 0) && <p className="text-sm font-semibold text-red-700">{problem}</p>}
        {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
      </div>
    </div>
  );
}
