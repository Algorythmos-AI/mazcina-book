'use client';

import { useEffect } from 'react';

const FIELDS = 'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])';

/**
 * On a phone keypad, "Next" on a field marked `enterKeyHint="next"` moves to
 * the next field in the same form instead of submitting half a form.
 */
export function EnterMovesToNext() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const field = event.target;
      if (event.key !== 'Enter' || !(field instanceof HTMLInputElement) || field.enterKeyHint !== 'next') return;
      const scope = field.form ?? field.closest('section') ?? document.body;
      const fields = [...scope.querySelectorAll<HTMLElement>(FIELDS)].filter((el) => el.offsetParent !== null);
      const next = fields[fields.indexOf(field) + 1];
      if (!next) return;
      event.preventDefault();
      next.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return null;
}
