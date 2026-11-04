import type { ReactNode } from 'react';

/**
 * Shows a "$" before a field or its unit after it, so nobody types "$22.50"
 * or "5kg" into a number. Give the input `pl-7` for a prefix and `pr-12` for
 * a suffix so the text clears it.
 */
export function Affix({ prefix, suffix, children }: { prefix?: string; suffix?: string; children: ReactNode }) {
  return (
    <div className="relative">
      {prefix && (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-base text-mazcina-green">
          {prefix}
        </span>
      )}
      {children}
      {suffix && (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-semibold text-mazcina-green">
          {suffix}
        </span>
      )}
    </div>
  );
}
