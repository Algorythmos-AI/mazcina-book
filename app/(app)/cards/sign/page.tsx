import type { Metadata } from 'next';
import Link from 'next/link';
import { PrintButton } from '@/components/print-button';
import { link, muted } from '@/components/ui';
import { linkQrSvg } from '@/lib/gift-cards/qr';
import { COUNTER_URL } from '@/lib/gift-cards/counter';
import { requireRole } from '@/lib/session';

export const metadata: Metadata = { title: 'Gift card counter sign' };

/** A printable A5 sign for the counter: customers scan it to buy a gift card on the website. */
export default async function CounterSignPage() {
  await requireRole('owner');
  // Production shows the frozen, committed QR (it is printed and on the counter). Off production the
  // sign is drawn live for the first extra site origin (e.g. a Mac on the local network) so it can be tested.
  const local = process.env.VERCEL_ENV === 'production' ? '' : ((process.env.GIFT_SITE_ORIGINS ?? '').split(',')[0]?.trim().replace(/\/$/, '') ?? '');
  const url = local ? `${local}/gift-cards` : COUNTER_URL;
  const liveQr = local ? (await linkQrSvg(url)).replace('<svg ', '<svg width="224" height="224" ') : null;

  return (
    <div className="space-y-5">
      <style>{'@page { size: A5 portrait; margin: 10mm; }'}</style>
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <Link href="/cards" className={`${muted} font-semibold hover:text-mazcina-wood`}>← Gift cards</Link>
          <p className={`mt-1 ${muted}`}>Print on A5 (or A4 and trim) for the counter. The code opens the gift card page on the website and never changes, so a printed sign keeps working.</p>
          {!local && (
            <p className={`mt-1 ${muted}`}>
              For a print shop: <a href="/counter-sign/gift-card-qr.svg" download className={link}>QR as SVG</a> · <a href="/counter-sign/gift-card-qr.png" download className={link}>QR as PNG</a>
            </p>
          )}
        </div>
        <PrintButton />
      </div>

      <article className="mx-auto flex max-w-md flex-col items-center rounded-md border border-gray-100 bg-white px-8 py-10 text-center shadow-sm print:max-w-none print:border-0 print:px-0 print:py-0 print:shadow-none">
        <p className="font-serif text-5xl font-bold italic leading-none tracking-tight text-mazcina-emerald">Mazcina</p>
        <p className="mt-1 text-xs font-semibold uppercase text-mazcina-wood" style={{ letterSpacing: '0.3em' }}>Resto - Bar</p>

        <p className="mt-8 font-serif text-xl italic text-mazcina-wood">Gift Cards @ Mazcina</p>
        <h1 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight text-mazcina-emerald">Give the gift of a shared table</h1>

        {liveQr ? (
          <div className="mt-8 h-56 w-56" role="img" aria-label={`QR code for ${url}`} dangerouslySetInnerHTML={{ __html: liveQr }} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a fixed, committed file; it must print exactly as is
          <img src="/counter-sign/gift-card-qr.svg" width={224} height={224} alt={`QR code for ${url}`} className="mt-8" />
        )}

        <p className="mt-6 text-lg font-bold text-mazcina-emerald">Scan to buy a gift card</p>
        <p className={`mt-1 ${muted}`}>$25 to $500 · sent by email in minutes · valid for 3 years</p>
        <p className="mt-6 text-sm font-semibold text-mazcina-wood">{url.replace(/^https?:\/\//, '')}</p>
      </article>
    </div>
  );
}
