/**
 * Shared class strings, matching the public site: wood-brown actions with
 * squared corners, emerald text, white surfaces. Touch targets are at least
 * 44px tall for use on a phone. Buttons are in sentence case: easier to read
 * at a glance than capitals.
 */
export const input =
  'block w-full min-h-11 rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-mazcina-emerald outline-none focus:border-mazcina-wood focus:ring-2 focus:ring-mazcina-wood/25';
export const label = 'block text-sm font-semibold';
/** Checkboxes and radios: big enough to hit with a thumb. */
export const checkbox = 'size-6 shrink-0 accent-mazcina-wood';
export const primary =
  'inline-flex min-h-11 items-center justify-center rounded-sm bg-mazcina-wood px-5 py-2 text-base font-bold text-white shadow-sm transition-colors hover:bg-mazcina-wood-dark disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-mazcina-wood/40';
export const secondary =
  'inline-flex min-h-11 items-center justify-center rounded-sm border-2 border-mazcina-wood bg-white px-4 py-2 text-base font-bold text-mazcina-wood transition-colors hover:bg-mazcina-wood hover:text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-mazcina-wood/40';
export const card = 'rounded-md border border-gray-100 bg-mazcina-surface p-4 shadow-sm sm:p-6';
export const h1 = 'text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl';
export const eyebrow = 'font-serif text-xl italic text-mazcina-wood';
export const h2 = 'text-lg font-bold';
export const muted = 'text-sm text-mazcina-green';
export const link = 'font-semibold text-mazcina-wood underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-mazcina-wood/40';
export const badgeWarn = 'inline-block rounded-sm bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900';
export const badgeOk = 'inline-block rounded-sm bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-900';
export const badgeBad = 'inline-block rounded-sm bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-900';
