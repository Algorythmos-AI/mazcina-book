import type { Metadata } from 'next';
import Link from 'next/link';
import { PrintButton } from '@/components/print-button';
import { muted } from '@/components/ui';
import { linkQrSvg } from '@/lib/gift-cards/qr';
import { primarySite } from '@/lib/gift-cards/site';
import { requireRole } from '@/lib/session';

export const metadata: Metadata = { title: 'Gift card counter sign' };

/** A printable A5 sign for the counter: customers scan it to buy a gift card on the website. */
export default async function CounterSignPage() {
  await requireRole('owner');
  // Off production the sign points at the first extra site origin (e.g. a Mac on the local network), so it can be tested end to end.
  const local = process.env.VERCEL_ENV === 'production' ? null : (process.env.GIFT_SITE_ORIGINS ?? '').split(',')[0]?.trim().replace(/\/$/, '');
  const url = `${local || primarySite()}/gift-cards`;
  const qr = await linkQrSvg(url);

  return (
    <div className="space-y-5">
      <style>{'@page { size: A5 portrait; margin: 10mm; }'}</style>
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <Link href="/cards" className={`${muted} font-semibold hover:text-mazcina-wood`}>← Gift cards</Link>
          <p className={`mt-1 ${muted}`}>Print on A5 (or A4 and trim) for the counter. The code opens the gift card page on the website.</p>
        </div>
        <PrintButton />
      </div>

      <article className="mx-auto flex max-w-md flex-col items-center rounded-md border border-gray-100 bg-white px-8 py-10 text-center shadow-sm print:max-w-none print:border-0 print:px-0 print:py-0 print:shadow-none">
        <p className="font-serif text-5xl font-bold italic leading-none tracking-tight text-mazcina-emerald">Mazcina</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.3em] text-mazcina-wood">Resto - Bar</p>

        <p className="mt-8 font-serif text-xl italic text-mazcina-wood">Gift Cards @ Mazcina</p>
        <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight text-mazcina-emerald">Give the gift of a shared table</h1>

        <div className="mt-8 w-56 [&_svg]:h-auto [&_svg]:w-full" role="img" aria-label={`QR code for ${url}`} dangerouslySetInnerHTML={{ __html: qr }} />

        <p className="mt-6 text-lg font-bold text-mazcina-emerald">Scan to buy a gift card</p>
        <p className={`mt-1 ${muted}`}>$25 to $500 · sent by email in minutes · valid for 3 years</p>
        <p className="mt-6 text-sm font-semibold text-mazcina-wood">{url.replace(/^https?:\/\//, '')}</p>
      </article>
    </div>
  );
}
