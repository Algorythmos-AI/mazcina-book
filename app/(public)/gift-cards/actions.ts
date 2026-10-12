'use server';

import { and, eq, gt, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db, schema } from '@/db';
import { MAX_AMOUNT_CENTS, MIN_AMOUNT_CENTS, parseAmount } from '@/lib/gift-cards/codes';
import { giftCardSales, stripe } from '@/lib/gift-cards/config';
import type { ActionResult } from '@/lib/types';

const { giftCardOrders } = schema;
const email = z.email().max(200);

const field = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
};

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) throw new Error('No host header');
  return `${host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'}://${host}`;
}

/**
 * Saves what the buyer asked for and sends them to Stripe's hosted checkout.
 * The price is worked out here from the validated amount; nothing the browser
 * sends is trusted for it. No card is created until Stripe confirms payment.
 */
export async function startCheckout(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const sales = giftCardSales();
  if (!sales.enabled) return { ok: false, error: 'Gift cards are not on sale online yet. Please call or email us.' };

  const choice = field(form, 'amount');
  const amountCents = parseAmount(choice === 'other' ? field(form, 'customAmount') : choice);
  if (amountCents === null) {
    return { ok: false, error: `Choose an amount in whole dollars between $${MIN_AMOUNT_CENTS / 100} and $${MAX_AMOUNT_CENTS / 100}.` };
  }
  const buyerName = field(form, 'buyerName').slice(0, 80);
  const buyerEmail = email.safeParse(field(form, 'buyerEmail').toLowerCase());
  const forMe = form.get('forMe') === 'on';
  const recipientName = forMe ? buyerName : field(form, 'recipientName').slice(0, 80);
  const recipientEmail = forMe ? buyerEmail : email.safeParse(field(form, 'recipientEmail').toLowerCase());
  const message = field(form, 'message').slice(0, 300) || null;

  if (!buyerName) return { ok: false, error: 'Please enter your name.' };
  if (!buyerEmail.success) return { ok: false, error: 'Please check your email address.' };
  if (!recipientName) return { ok: false, error: "Please enter the recipient's name." };
  if (!recipientEmail.success) return { ok: false, error: "Please check the recipient's email address." };
  if (form.get('terms') !== 'on') return { ok: false, error: 'Please tick the box to accept the gift card terms.' };

  // A simple brake on abuse: nobody needs more than a handful of checkouts an hour.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [{ mine }] = await db
    .select({ mine: sql<number>`count(*)::int` })
    .from(giftCardOrders)
    .where(and(eq(giftCardOrders.buyerEmail, buyerEmail.data), gt(giftCardOrders.createdAt, hourAgo)));
  const [{ all }] = await db.select({ all: sql<number>`count(*)::int` }).from(giftCardOrders).where(gt(giftCardOrders.createdAt, hourAgo));
  if (mine >= 6 || all >= 120) return { ok: false, error: 'Too many attempts just now. Please try again in an hour, or call us.' };

  const [order] = await db
    .insert(giftCardOrders)
    .values({ amountCents, buyerName, buyerEmail: buyerEmail.data, recipientName, recipientEmail: recipientEmail.data, message })
    .returning({ id: giftCardOrders.id });

  let url: string | null;
  try {
    const base = await origin();
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
        payment_intent_data: { description: `Mazcina gift card $${amountCents / 100}`, metadata: { order_id: order.id } },
        metadata: { order_id: order.id },
        success_url: `${base}/gift-cards/thanks?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/gift-cards`,
        integration_identifier: 'mazcina_gift_card_qhvtzkwm',
      },
      { idempotencyKey: `gift-order-${order.id}` },
    );
    await db.update(giftCardOrders).set({ stripeSessionId: session.id }).where(eq(giftCardOrders.id, order.id));
    url = session.url;
  } catch (error) {
    console.error('[gift-cards] could not start checkout', error);
    await db.update(giftCardOrders).set({ status: 'failed' }).where(eq(giftCardOrders.id, order.id));
    return { ok: false, error: 'We could not start the payment. You have not been charged. Please try again.' };
  }
  if (!url) return { ok: false, error: 'We could not start the payment. You have not been charged. Please try again.' };
  redirect(url);
}
