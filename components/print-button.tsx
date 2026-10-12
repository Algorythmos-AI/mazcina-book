'use client';

import { primary } from './ui';

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={`${primary} print:hidden`}>
      Print or save as PDF
    </button>
  );
}
