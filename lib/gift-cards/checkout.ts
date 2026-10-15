import { and, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/db';
import { hashClientIp, MAX_AMOUNT_CENTS, MIN_AMOUNT_CENTS, parseAmount } from './codes';
import { codeKey, connectAccount, giftCardSales, platformFee, stripe } from './config';

const { giftCardOrders } = schema;
const email = z.email().max(200);
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export type CheckoutResult = { ok: true; url: string } | { ok: false; error: string; status: number };

/**
 * Saves what the buyer asked for and opens a Stripe hosted checkout. The price
 * is worked out here from the validated amount; nothing the browser sends is
 * trusted for it. No card is created until Stripe confirms payment.
 * `returnTo` is the website origin the customer came from (already checked).
 */
export async function createCheckout(input: Record<string, unknown>, returnTo: string, clientIp: string | null = null): Promise<CheckoutResult> {
  const fail = (error: string, status = 400): CheckoutResult => ({ ok: false, error, status });
  const sales = giftCardSales();
  if (!sales.enabled) return fail('Gift cards are not on sale online yet. Please call or email us.', 503);

  const amountCents = parseAmount(text(input.amount, 12));
  if (amountCents === null) return fail(`Choose an amount in whole dollars between $${MIN_AMOUNT_CENTS / 100} and $${MAX_AMOUNT_CENTS / 100}.`);
  const buyerName = text(input.buyerName, 80);
  const buyerEmail = email.safeParse(text(input.buyerEmail, 200).toLowerCase());
  const forMe = input.forMe === true;
  const recipientName = forMe ? buyerName : text(input.recipientName, 80);
  const recipientEmail = forMe ? buyerEmail : email.safeParse(text(input.recipientEmail, 200).toLowerCase());
  const message = text(input.message, 300) || null;

  if (!buyerName) return fail('Please enter your name.');
  if (!buyerEmail.success) return fail('Please check your email address.');
  if (!recipientName) return fail("Please enter the recipient's name.");
  if (!recipientEmail.success) return fail("Please check the recipient's email address.");
  if (input.terms !== true) return fail('Please tick the box to accept the gift card terms.');

  // Brakes on abuse: nobody needs more than a handful of checkouts an hour, from one email or one
  // address. The overall cap is high so one script cannot switch sales off for everyone.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const ipHash = clientIp ? hashClientIp(clientIp, codeKey()) : null;
  const [{ mine }] = await db
    .select({ mine: sql<number>`count(*)::int` })
    .from(giftCardOrders)
    .where(and(eq(giftCardOrders.buyerEmail, buyerEmail.data), gt(giftCardOrders.createdAt, hourAgo)));
  const [{ fromHere }] = ipHash
    ? await db
        .select({ fromHere: sql<number>`count(*)::int` })
        .from(giftCardOrders)
        .where(and(eq(giftCardOrders.clientIpHash, ipHash), gt(giftCardOrders.createdAt, hourAgo)))
    : [{ fromHere: 0 }];
  const [{ all }] = await db.select({ all: sql<number>`count(*)::int` }).from(giftCardOrders).where(gt(giftCardOrders.createdAt, hourAgo));
  if (mine >= 6 || fromHere >= 15 || all >= 2000) return fail('Too many attempts just now. Please try again in an hour, or call us.', 429);

  // The sale belongs to the restaurant's own Stripe account; the order remembers which.
  const account = connectAccount();
  const fee = platformFee(amountCents);
  const [order] = await db
    .insert(giftCardOrders)
    .values({ amountCents, buyerName, buyerEmail: buyerEmail.data, recipientName, recipientEmail: recipientEmail.data, message, stripeAccountId: account, clientIpHash: ipHash })
    .returning({ id: giftCardOrders.id });

  const unavailable = fail('We could not start the payment. You have not been charged. Please try again.', 502);
  try {
    const session = await stripe().checkout.sessions.create(
      {
        mode: 'payment',
        client_reference_id: order.id,
        customer_email: buyerEmail.data,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'aud',
              unit_amount: amountCents,
              product_data: { name: `Mazcina gift card $${amountCents / 100}`, description: `For ${recipientName}. Valid for 3 years.` },
            },
          },
        ],
        payment_intent_data: {
          description: `Mazcina gift card $${amountCents / 100}`,
          metadata: { order_id: order.id },
          ...(fee > 0 ? { application_fee_amount: fee } : {}),
        },
        metadata: { order_id: order.id },
        success_url: `${returnTo}/gift-cards/thanks?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${returnTo}/gift-cards`,
        integration_identifier: 'mazcina_gift_card_qhvtzkwm',
      },
      { idempotencyKey: `gift-order-${order.id}`, stripeAccount: account },
    );
    await db.update(giftCardOrders).set({ stripeSessionId: session.id }).where(eq(giftCardOrders.id, order.id));
    if (!session.url) throw new Error('Stripe returned no checkout URL');
    return { ok: true, url: session.url };
  } catch (error) {
    console.error('[gift-cards] could not start checkout', error);
    await db.update(giftCardOrders).set({ status: 'failed' }).where(eq(giftCardOrders.id, order.id));
    return unavailable;
  }
}
