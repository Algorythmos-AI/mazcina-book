import { after } from 'next/server';
import type Stripe from 'stripe';
import { giftCardSales, stripe } from '@/lib/gift-cards/config';
import { handleStripeEvent } from '@/lib/gift-cards/events';
import { sendPendingEmails } from '@/lib/gift-cards/outbox';

/**
 * Stripe calls this when a payment succeeds, fails, is refunded or disputed.
 * The signature is checked against the exact bytes Stripe sent before anything
 * else happens. A 5xx tells Stripe to try again later; handlers are safe to
 * repeat.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sales = giftCardSales();
  if (!secret || !sales.enabled) return new Response('Gift cards are not configured here', { status: 503 });

  const signature = request.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }
  // A test event must never issue a card on the live site, or the reverse.
  if (event.livemode === sales.testMode) return new Response('Wrong mode', { status: 400 });

  const outcome = await handleStripeEvent(event);
  if (outcome === 'fulfilled') {
    after(async () => {
      try {
        await sendPendingEmails();
      } catch (error) {
        console.error('[gift-cards] sending after fulfilment failed; the cron will retry', error);
      }
    });
  }
  console.log(`[gift-cards] ${event.id} ${event.type} -> ${outcome}`);
  return Response.json({ received: true, outcome });
}
