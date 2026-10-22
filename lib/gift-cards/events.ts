import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { GiftCardError, stripe } from './config';
import { flagForPayment, fulfilOrder, markOrder, voidForPayment, type PaymentOutcome } from './core';

export type EventOutcome = 'duplicate' | 'fulfilled' | 'already_fulfilled' | 'not_paid' | 'order_closed' | 'voided' | 'flagged' | 'held' | 'ignored' | 'rejected';

const id = (value: string | { id: string } | null | undefined): string | null => (typeof value === 'string' ? value : (value?.id ?? null));

/**
 * The order a payment was for, read from the payment's metadata on Stripe.
 * Only needed when a refund or dispute arrives before the card was issued, so
 * the payment id is not saved yet. Null when Stripe has no such payment on the
 * account; any other failure throws, so Stripe tries the event again.
 */
async function orderIdFromStripe(paymentIntentId: string, account: string | null | undefined): Promise<string | null> {
  const [known] = await db
    .select({ id: schema.giftCardOrders.id })
    .from(schema.giftCardOrders)
    .where(eq(schema.giftCardOrders.stripePaymentIntentId, paymentIntentId));
  if (known) return known.id;
  try {
    const intent = await stripe().paymentIntents.retrieve(paymentIntentId, undefined, account ? { stripeAccount: account } : undefined);
    // The restaurant's account takes other payments too; only our own order ids count.
    const orderId = intent.metadata?.order_id;
    return orderId && UUID.test(orderId) ? orderId : null;
  } catch (error) {
    if ((error as { code?: string }).code === 'resource_missing') return null;
    throw error;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const settled = (result: PaymentOutcome): EventOutcome => (result === 'voided' || result === 'flagged' || result === 'held' ? result : 'ignored');

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
        const reason = `Partly refunded (${dollars(charge.amount_refunded)} of ${dollars(charge.amount)}). Set what should be left on the card, then clear the hold.`;
        return settled(await flagForPayment(paymentIntent, reason, await orderIdFromStripe(paymentIntent, event.account)));
      }
      return settled(await voidForPayment(paymentIntent, 'Payment refunded', await orderIdFromStripe(paymentIntent, event.account)));
    }
    case 'charge.dispute.created': {
      const paymentIntent = id(event.data.object.payment_intent);
      if (!paymentIntent) return 'ignored';
      return settled(await voidForPayment(paymentIntent, 'Payment disputed by the cardholder', await orderIdFromStripe(paymentIntent, event.account)));
    }
    case 'charge.dispute.closed': {
      const dispute = event.data.object;
      const paymentIntent = id(dispute.payment_intent);
      if (!paymentIntent || dispute.status !== 'won') return 'ignored';
      // The card was cancelled when the dispute opened; the restaurant kept the money, so a person decides whether to reissue.
      const result = await flagForPayment(paymentIntent, 'Dispute won: the payment stands. The card was cancelled when the dispute opened; reissue it if that is right.');
      return result === 'flagged' ? 'flagged' : 'ignored';
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
