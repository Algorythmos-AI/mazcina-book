import type { Metadata } from 'next';
import { badgeWarn, card, h1, h2, muted } from '@/components/ui';
import { EXPIRY_YEARS, MAX_AMOUNT_CENTS, MIN_AMOUNT_CENTS, PRESET_AMOUNTS_CENTS } from '@/lib/gift-cards/codes';
import { giftCardSales } from '@/lib/gift-cards/config';
import { PurchaseForm } from './purchase-form';

export const metadata: Metadata = {
  title: { absolute: 'Gift Cards | Mazcina Resto - Bar' },
  description: 'Give a Mazcina gift card: Mediterranean sharing plates and cocktails in Darlinghurst.',
};

export default function GiftCardsPage() {
  const sales = giftCardSales();
  return (
    <div className="space-y-8">
      {/* Same layout and wording as the Gift Cards page on the public site. */}
      <section className="grid gap-8 sm:grid-cols-2 sm:items-center" aria-labelledby="gift-heading">
        <div className="mx-auto w-full max-w-sm py-3" aria-hidden="true">
          <div className="bg-marble-emerald relative flex aspect-[1.586] -rotate-3 flex-col justify-between overflow-hidden rounded-2xl p-6 text-white shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-serif text-4xl font-bold italic leading-none">Mazcina</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.3em] text-mazcina-gold">Resto - Bar</p>
              </div>
              <svg viewBox="0 0 24 24" className="size-8 fill-none stroke-mazcina-gold" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="8" width="18" height="4" rx="1" />
                <path d="M12 8v13" />
                <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
                <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />
              </svg>
            </div>
            <div className="flex items-end justify-between">
              <p className="text-sm font-bold uppercase tracking-[0.25em]">Gift Card</p>
              <p className="text-xs text-white/70">Darlinghurst</p>
            </div>
            <div className="absolute -bottom-10 -right-10 size-40 rounded-full bg-mazcina-wood/30" />
          </div>
        </div>
        <div className="space-y-4">
          <p className="font-serif text-2xl italic text-mazcina-wood">Gift Cards @ Mazcina</p>
          <h1 id="gift-heading" className={h1}>Give the gift of a shared table</h1>
          <p className="leading-relaxed text-gray-600">
            A Mazcina gift card is perfect for birthdays, thank-yous and celebrations: ceviches, generous boards, desserts and cocktails
            from the marble bar, enjoyed together.
          </p>
          <p className={muted}>Sent by email within minutes. Valid for {EXPIRY_YEARS} years.</p>
        </div>
      </section>

      {sales.enabled && sales.testMode && (
        <p className={badgeWarn}>Test mode: no real money is taken and these cards are not valid in the restaurant.</p>
      )}

      <section className={card}>
        {sales.enabled ? (
          <>
            <h2 className={`mb-4 ${h2}`}>Buy a gift card</h2>
            <PurchaseForm presets={PRESET_AMOUNTS_CENTS.map((c) => c / 100)} min={MIN_AMOUNT_CENTS / 100} max={MAX_AMOUNT_CENTS / 100} />
          </>
        ) : (
          <>
            <p className="inline-block rounded-full bg-mazcina-wood/10 px-4 py-1.5 text-sm font-bold text-mazcina-wood">Online gift cards coming soon</p>
            <p className="mt-3">
              To buy a gift card now, call <a href="tel:+61433865661" className="font-semibold text-mazcina-wood underline">+61 433 865 661</a> or ask
              in the restaurant.
            </p>
          </>
        )}
      </section>

      <section className={card}>
        <h2 className={h2}>Gift card terms</h2>
        <ul className={`mt-2 list-disc space-y-1.5 pl-5 ${muted}`}>
          <li>Valid for {EXPIRY_YEARS} years from the day you buy it. The expiry date is shown on the card.</li>
          <li>Use it at Mazcina Resto - Bar, 248 Palmer St, Darlinghurst, over as many visits as you like.</li>
          <li>There are no fees after purchase. It cannot be exchanged for cash, and change is not given.</li>
          <li>Treat the code like cash: anyone who has it can spend it. We cannot replace a card that has been spent.</li>
          <li>Payment is taken securely by Stripe. We never see or store your card number.</li>
          <li>We use the names and emails you enter only to send and manage this gift card.</li>
        </ul>
      </section>
    </div>
  );
}
