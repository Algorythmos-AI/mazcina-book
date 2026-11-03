'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from 'react';
import { badgeOk, card, h2, input, link, muted, primary, secondary } from '@/components/ui';
import { parseDecimalInput, type Unit } from '@/lib/costing';
import { recordStocktake } from '../actions';

export interface CountItem {
  id: string;
  name: string;
  category: string;
  units: Unit[];
  defaultUnit: Unit;
  /** What the books say now, already formatted, or null if never recorded. */
  onBooks: string | null;
}

/** `countedAt`: when the number was typed (ms), so stock booked after that stays on top of the count. */
type Entry = { quantity: string; unit: Unit; countedAt?: number };
type Entries = Record<string, Entry>;
interface Draft {
  v: 2;
  startedAt: number;
  userEmail: string;
  entries: Entries;
}
const DRAFT_KEY = 'mazcina-stocktake-draft';
/** A draft older than this, or left by someone else, is offered rather than quietly reused. */
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

function readDraft(items: CountItem[]): Draft | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? 'null') as Partial<Draft> | Entries | null;
    if (!raw || typeof raw !== 'object') return null;
    // Drafts saved before version 2 were just the entries, with no time or name.
    const draft: Draft = 'v' in raw && raw.v === 2 ? (raw as Draft) : { v: 2, startedAt: 0, userEmail: '', entries: raw as Entries };
    const known = new Set(items.map((i) => i.id));
    const entries = Object.fromEntries(Object.entries(draft.entries ?? {}).filter(([id, e]) => known.has(id) && typeof e?.quantity === 'string' && e.quantity.trim() !== ''));
    return Object.keys(entries).length > 0 ? { ...draft, entries } : null;
  } catch {
    return null; // a broken draft is just ignored
  }
}

const whenFormat = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', hour: 'numeric', minute: '2-digit' });

const noop = () => () => {};

/**
 * A stocktake you can do walking around with a phone: type what is on the
 * shelf, leave blank what you did not count. Entries are kept on this device
 * as you go, so a dropped connection or a closed tab does not lose them.
 */
export function Stocktake({ items, userEmail }: { items: CountItem[]; userEmail: string }) {
  // The saved draft lives in this browser, so the form is only drawn once we are in it.
  const inBrowser = useSyncExternalStore(noop, () => true, () => false);
  return inBrowser ? <StocktakeForm items={items} userEmail={userEmail} /> : <p className={muted}>Loading…</p>;
}

function StocktakeForm({ items, userEmail }: { items: CountItem[]; userEmail: string }) {
  const [initial] = useState(() => readDraft(items));
  // An old draft, or someone else's, waits for a yes before it counts for anything.
  const [offered, setOffered] = useState<Draft | null>(() =>
    initial && (initial.userEmail !== userEmail || Date.now() - initial.startedAt > STALE_AFTER_MS) ? initial : null,
  );
  const [entries, setEntries] = useState<Entries>(() => (initial && !offered ? initial.entries : {}));
  const [startedAt, setStartedAt] = useState(() => (initial && !offered ? initial.startedAt : Date.now()));
  const [confirmClear, setConfirmClear] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [skipped, setSkipped] = useState<{ name: string; by: string; at: string }[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => {
    try {
      if (offered) return; // keep the offered draft until it is kept or thrown away
      const draft: Draft = { v: 2, startedAt, userEmail, entries };
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* storage full or blocked: carry on without the safety net */
    }
  }, [entries, offered, startedAt, userEmail]);

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const map = new Map<string, CountItem[]>();
    for (const item of items) {
      if (term && !item.name.toLowerCase().includes(term)) continue;
      map.set(item.category, [...(map.get(item.category) ?? []), item]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items, search]);

  const filled = Object.entries(entries).filter(([, e]) => e.quantity.trim() !== '');
  const invalid = filled.filter(([, e]) => parseDecimalInput(e.quantity.trim()) === null);
  const set = (item: CountItem, patch: Partial<{ quantity: string; unit: Unit }>) => {
    setSaved(null);
    setEntries((current) => ({
      ...current,
      [item.id]: { ...(current[item.id] ?? { quantity: '', unit: item.defaultUnit }), ...patch, countedAt: Date.now() },
    }));
  };

  const save = () =>
    start(async () => {
      setError(null);
      const result = await recordStocktake({
        lines: filled.map(([ingredientId, e]) => ({ ingredientId, quantity: e.quantity.trim(), unit: e.unit, countedAt: e.countedAt ?? null })),
      });
      if (!result.ok) return setError(result.error);
      setSaved(result.data!.counted);
      setSkipped(result.data!.skipped);
      setEntries({});
      setStartedAt(Date.now());
    });

  const keepOffered = () => {
    if (!offered) return;
    // Counts from a draft with no time on it are taken as counted now.
    setEntries(offered.entries);
    setStartedAt(offered.startedAt || Date.now());
    setOffered(null);
  };
  const dropOffered = () => {
    setOffered(null);
    setEntries({});
    setStartedAt(Date.now());
  };

  return (
    <div className="space-y-6">
      {offered && (
        <section className={`${card} border-l-4 border-mazcina-wood`} role="alert">
          <h2 className={h2}>Counts left on this phone</h2>
          <p className="mt-1">
            {Object.keys(offered.entries).length} count{Object.keys(offered.entries).length === 1 ? ' was' : 's were'} typed
            {offered.startedAt ? ` on ${whenFormat.format(offered.startedAt)}` : ' earlier'}
            {offered.userEmail && offered.userEmail !== userEmail ? ` by ${offered.userEmail}` : ''} and never saved. Stock may have changed since.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" onClick={dropOffered} className={primary}>Start a fresh count</button>
            <button type="button" onClick={keepOffered} className={secondary}>Keep those counts</button>
          </div>
        </section>
      )}

      {saved !== null && (
        <section className={card} role="status">
          <p className={badgeOk}>{saved} item{saved === 1 ? '' : 's'} counted and saved</p>
          {skipped.length > 0 && (
            <p className="mt-2 text-sm font-semibold text-red-700">
              Not saved, because someone counted them after you did:{' '}
              {skipped.map((s) => `${s.name} (${s.by}, ${whenFormat.format(new Date(s.at))})`).join(', ')}.
            </p>
          )}
          <p className="mt-2"><Link href="/stock" className={link}>See stock levels</Link></p>
        </section>
      )}

      <div>
        <label htmlFor="count-search" className="sr-only">Find an ingredient</label>
        <input id="count-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find an ingredient…" className={input} />
      </div>

      {groups.map(([category, group]) => (
        <section key={category} className={card}>
          <h2 className={h2}>{category}</h2>
          <ul className="mt-2 divide-y divide-gray-100">
            {group.map((item) => {
              const entry = entries[item.id];
              const bad = !!entry?.quantity.trim() && parseDecimalInput(entry.quantity.trim()) === null;
              return (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
                  <span className="min-w-0">
                    <span className="block font-semibold">{item.name}</span>
                    <span className={`block ${muted} tabular-nums`}>{item.onBooks ? `Should have ${item.onBooks}` : 'Not counted before'}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <label htmlFor={`count-${item.id}`} className="sr-only">Counted {item.name}</label>
                    <input
                      id={`count-${item.id}`}
                      inputMode="decimal"
                      placeholder="Count"
                      value={entry?.quantity ?? ''}
                      onChange={(e) => set(item, { quantity: e.target.value })}
                      aria-invalid={bad}
                      className={`${input} w-24 ${bad ? 'border-red-600' : ''}`}
                    />
                    <label htmlFor={`count-unit-${item.id}`} className="sr-only">Unit for {item.name}</label>
                    <select id={`count-unit-${item.id}`} value={entry?.unit ?? item.defaultUnit} onChange={(e) => set(item, { unit: e.target.value as Unit })} className={`${input} w-24`}>
                      {item.units.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className="sticky bottom-0 -mx-4 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={pending || !!offered || filled.length === 0 || invalid.length > 0} className={primary}>
            {pending ? 'Saving…' : `Save ${filled.length} count${filled.length === 1 ? '' : 's'}`}
          </button>
          {filled.length > 0 && !pending && !confirmClear && (
            <button type="button" onClick={() => setConfirmClear(true)} className={secondary}>Clear</button>
          )}
          {confirmClear && (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Clear all {filled.length} counts?</span>
              <button type="button" onClick={() => { setEntries({}); setSaved(null); setConfirmClear(false); setStartedAt(Date.now()); }} className={secondary}>
                Yes, clear
              </button>
              <button type="button" onClick={() => setConfirmClear(false)} className={secondary}>Keep them</button>
            </span>
          )}
          {invalid.length > 0 && <p className="text-sm font-semibold text-red-700">Fix the number{invalid.length === 1 ? '' : 's'} in red (type 1500 or 1.5, not 1,500).</p>}
          {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
          {filled.length === 0 && saved === null && <p className={muted}>Type a count for anything you check. Blank lines are left alone. Type 0 for nothing left.</p>}
        </div>
      </div>
    </div>
  );
}
