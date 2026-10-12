import type { Metadata } from 'next';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { badgeOk, badgeWarn, card, h1, link, muted } from '@/components/ui';
import { db, schema } from '@/db';
import { Refresher } from './refresher';

export const metadata: Metadata = { title: { absolute: 'Thank you | Mazcina Resto - Bar' } };

const maskEmail = (email: string) => email.replace(/^(.)(.*)(@.*)$/, (_, first: string, middle: string, domain: string) => `${first}${'•'.repeat(Math.min(middle.length, 6))}${domain}`);

/** The page Stripe sends the buyer back to. It only reads the order; the card is issued by the webhook, never here. */
export default async function ThanksPage({ searchParams }: PageProps<'/gift-cards/thanks'>) {
  const { session_id: sessionId } = await searchParams;
  const [order] =
    typeof sessionId === 'string' && /^cs_[A-Za-z0-9_]{10,200}$/.test(sessionId)
      ? await db.select().from(schema.giftCardOrders).where(eq(schema.giftCardOrders.stripeSessionId, sessionId))
      : [];

  if (!order) {
    return (
      <div className="space-y-4">
        <h1 className={h1}>We could not find that order</h1>
        <p><Link href="/gift-cards" className={link}>Back to gift cards</Link></p>
      </div>
    );
  }

  const amount = `$${order.amountCents / 100}`;
  return (
    <div className="space-y-6">
      <h1 className={h1}>{order.status === 'paid' ? 'Thank you' : order.status === 'pending' ? 'Confirming your payment' : 'Payment not completed'}</h1>
      <section className={card} aria-live="polite">
        {order.status === 'paid' && (
          <>
            <p className={badgeOk}>Paid</p>
            <p className="mt-3 text-lg">
              Your {amount} gift card for <strong>{order.recipientName}</strong> is on its way to {maskEmail(order.recipientEmail)}.
            </p>
            <p className={`mt-2 ${muted}`}>It usually arrives within a few minutes. Check the junk folder if it does not.</p>
          </>
        )}
        {order.status === 'pending' && (
          <>
            <p className={badgeWarn}>Waiting for confirmation</p>
            <p className="mt-3">This page updates by itself. You can close it; the gift card is emailed as soon as the payment is confirmed.</p>
            <Refresher attemptsLeft={1} />
          </>
        )}
        {(order.status === 'failed' || order.status === 'expired') && (
          <>
            <p className={badgeWarn}>Not paid</p>
            <p className="mt-3">
              The payment did not go through and no gift card was issued. <Link href="/gift-cards" className={link}>Try again</Link>
            </p>
          </>
        )}
      </section>
    </div>
  );
}
