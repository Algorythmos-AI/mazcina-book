'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { input } from './ui';

export interface ListSort {
  key: string;
  label: string;
  /** Highest first instead of lowest first. */
  descending?: boolean;
}

const noop = () => () => {};

function readSaved(storageKey: string, sorts: ListSort[]): string {
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved && sorts.some((s) => s.key === saved)) return saved;
  } catch {
    /* storage blocked */
  }
  return sorts[0]?.key ?? '';
}

/**
 * Search, a quick filter and a sort for a list drawn on the server. Items are
 * `<li data-search="…" data-flags="…" data-sort-<key>="…">` inside the list;
 * this only hides and reorders them, so the list still works without it.
 * The chosen sort is remembered on this device.
 */
export function ListFilter({
  id,
  placeholder,
  flags = [],
  sorts = [],
  children,
}: {
  /** Names the list for remembering the sort. */
  id: string;
  placeholder: string;
  flags?: { key: string; label: string }[];
  sorts?: ListSort[];
  children: ReactNode;
}) {
  const fieldId = useId();
  const box = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [flag, setFlag] = useState('');
  const storageKey = `mazcina-sort-${id}`;
  // The remembered sort is only known in the browser; the server draws the default.
  const saved = useSyncExternalStore(
    noop,
    () => readSaved(storageKey, sorts),
    () => sorts[0]?.key ?? '',
  );
  const [picked, setSort] = useState<string | null>(null);
  const sort = picked ?? saved;
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    const items = [...(box.current?.querySelectorAll<HTMLElement>('li[data-search]') ?? [])];
    const term = query.trim().toLowerCase();
    let visible = 0;
    for (const li of items) {
      const match = (!term || (li.dataset.search ?? '').toLowerCase().includes(term)) && (!flag || (li.dataset.flags ?? '').split(' ').includes(flag));
      li.hidden = !match;
      if (match) visible++;
    }
    const chosen = sorts.find((s) => s.key === sort);
    const attr = `sort${sort.charAt(0).toUpperCase()}${sort.slice(1)}`;
    const ranked = chosen
      ? [...items].sort((a, b) => {
          const x = a.dataset[attr] ?? '';
          const y = b.dataset[attr] ?? '';
          const nx = Number(x);
          const ny = Number(y);
          // Items with nothing to sort on (no price yet) always go last.
          if (x === '' || y === '') return x === y ? 0 : x === '' ? 1 : -1;
          const diff = Number.isFinite(nx) && Number.isFinite(ny) ? nx - ny : x.localeCompare(y);
          return chosen.descending ? -diff : diff;
        })
      : items;
    ranked.forEach((li, index) => (li.style.order = String(index)));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the count comes from the DOM this effect just filtered
    setShown(term || flag ? visible : null);
    try {
      window.localStorage.setItem(storageKey, sort);
    } catch {
      /* storage blocked */
    }
  }, [query, flag, sort, sorts, storageKey]);

  return (
    <div ref={box}>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor={fieldId} className="sr-only">{placeholder}</label>
        <input id={fieldId} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} className={`${input} min-w-0 flex-1 basis-48`} />
        {sorts.length > 1 && (
          <>
            <label htmlFor={`${fieldId}-sort`} className="sr-only">Sort by</label>
            <select id={`${fieldId}-sort`} value={sort} onChange={(e) => setSort(e.target.value)} className={`${input} w-auto`}>
              {sorts.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </>
        )}
      </div>
      {flags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Show">
          {[{ key: '', label: 'All' }, ...flags].map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={flag === f.key}
              onClick={() => setFlag(f.key)}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${flag === f.key ? 'border-mazcina-wood bg-mazcina-wood text-white' : 'border-gray-300 bg-white'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      {shown !== null && <p className="mt-2 text-sm font-semibold" aria-live="polite">{shown === 0 ? 'Nothing matches.' : `${shown} shown`}</p>}
      {children}
    </div>
  );
}
