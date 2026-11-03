'use client';

import { useId, useMemo, useState } from 'react';
import { input } from './ui';

/**
 * Choose one item from a long list by typing a few letters: a phone-friendly
 * stand-in for a <select> with hundreds of options. Shows the chosen name,
 * tap it to search again.
 */
export function SearchPick({
  items,
  value,
  onChange,
  label,
  placeholder = 'Type to find…',
}: {
  items: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  /** Read by screen readers; the visible label is the caller's. */
  label: string;
  placeholder?: string;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const chosen = items.find((i) => i.id === value);
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items.slice(0, 8);
    const starts = items.filter((i) => i.name.toLowerCase().startsWith(term));
    const contains = items.filter((i) => !i.name.toLowerCase().startsWith(term) && i.name.toLowerCase().includes(term));
    return [...starts, ...contains].slice(0, 8);
  }, [items, query]);

  if (chosen && !open) {
    return (
      <button
        type="button"
        onClick={() => {
          setQuery('');
          setOpen(true);
        }}
        className={`${input} text-left font-semibold`}
        aria-label={`${label}: ${chosen.name}. Tap to change.`}
      >
        {chosen.name}
      </button>
    );
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="search"
        autoFocus={open}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) {
            e.preventDefault();
            onChange(matches[0].id);
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        aria-label={label}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        role="combobox"
        autoComplete="off"
        className={input}
      />
      {open && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {matches.length === 0 && <li className="px-3 py-3 text-sm">Nothing matches “{query}”</li>}
          {matches.map((item) => (
            <li key={item.id} role="option" aria-selected={item.id === value}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
                className="block min-h-11 w-full px-3 py-2 text-left hover:bg-mazcina-surface focus:bg-mazcina-surface"
              >
                {item.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
