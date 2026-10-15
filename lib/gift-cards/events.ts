import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { GiftCardError } from './config';
import { flagForPayment, fulfilOrder, markOrder, voidForPayment } from './core';

export type EventOutcome = 'duplicate' | 'fulfilled' | 'already_fulfilled' | 'not_paid' | 'order_closed' | 'voided' | 'flagged' | 'ignored' | 'rejected';

const id = (value: string | { id: string } | null | undefined): string | null => (typeof value === 'string' ? value : (value?.id ?? null));

async function handle(event: Stripe.Event): Promise<EventOutcome> {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object;
      if (!session.client_reference_id) return 'ignored';
      // A completed session is not always a paid one (bank debits settle later).
      if (session.payment_status !== 'paid') return 'not_paid';
      const result = await fulfilOrder(session.client_reference_id, {
        sessionId: session.id,
        paymentIntentId: id(session.payment_intent),
        amountTotal: session.amount_total,
        currency: session.currency,
        account: event.account ?? null,
      });
      return result.created ? 'fulfilled' : 'already_fulfilled';
    }
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired': {
      const orderId = event.data.object.client_reference_id;
      if (!orderId) return 'ignored';
      await markOrder(orderId, event.type === 'checkout.session.expired' ? 'expired' : 'failed');
      return 'order_closed';
    }
    case 'charge.refunded': {
      const charge = event.data.object;
      const paymentIntent = id(charge.payment_intent);
      if (!paymentIntent) return 'ignored';
      // A partial refund (say, goodwill) must not cancel a card that is mostly paid for: a person decides.
      if (charge.amount_refunded < charge.amount) {
        const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
        const flagged = await flagForPayment(paymentIntent, `Partly refunded (${dollars(charge.amount_refunded)} of ${dollars(charge.amount)}). Check what should be left on the card.`);
        return flagged ? 'flagged' : 'ignored';
      }
      const result = await voidForPayment(paymentIntent, 'Payment refunded');
      return result === 'voided' ? 'voided' : result === 'flagged' ? 'flagged' : 'ignored';
    }
    case 'charge.dispute.created': {
      const paymentIntent = id(event.data.object.payment_intent);
      if (!paymentIntent) return 'ignored';
      const result = await voidForPayment(paymentIntent, 'Payment disputed by the cardholder');
      return result === 'voided' ? 'voided' : result === 'flagged' ? 'flagged' : 'ignored';
    }
    case 'charge.dispute.closed': {
      const dispute = event.data.object;
      const paymentIntent = id(dispute.payment_intent);
      if (!paymentIntent || dispute.status !== 'won') return 'ignored';
      // The card was cancelled when the dispute opened; the restaurant kept the money, so a person decides whether to reissue.
      const flagged = await flagForPayment(paymentIntent, 'Dispute won: the payment stands. The card was cancelled when the dispute opened; reissue it if that is right.');
      return flagged ? 'flagged' : 'ignored';
    }
    default:
      return 'ignored';
  }
}

/**
 * Applies a verified Stripe event exactly once. Stripe retries and replays, so
 * an event id that has been seen does nothing; and each handler is also safe
 * to repeat by itself, in case we stop between doing the work and recording it.
 * Pass `account` to accept events from that connected Stripe account only.
 */
export async function handleStripeEvent(event: Stripe.Event, account?: string): Promise<EventOutcome> {
  // Only the restaurant's own account may move gift card money. Anything else is not ours to act on.
  if (account !== undefined && event.account !== account) return 'ignored';

  const [seen] = await db.select({ id: schema.stripeEvents.id }).from(schema.stripeEvents).where(eq(schema.stripeEvents.id, event.id));
  if (seen) return 'duplicate';

  let outcome: EventOutcome;
  try {
    outcome = await handle(event);
  } catch (error) {
    // A mismatch will not fix itself on retry: record it, shout, and stop Stripe resending.
    if (!(error instanceof GiftCardError)) throw error;
    console.error(`[gift-cards] event ${event.id} (${event.type}) rejected: ${error.message}`);
    outcome = 'rejected';
  }
  await db.insert(schema.stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing();
  return outcome;
}
