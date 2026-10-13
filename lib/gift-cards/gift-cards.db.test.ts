import { eq, inArray } from 'drizzle-orm';
import type Stripe from 'stripe';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, schema } from '@/db';
import { createCheckout } from './checkout';
import { GiftCardError } from './config';
import { findCardByCode, fulfilOrder, ledgerBalance, redeem, reverseRedemption, voidForPayment } from './core';
import { decryptCode } from './codes';
import { handleStripeEvent } from './events';

const { giftCardOrders, giftCards, giftCardLedger, emailOutbox, stripeEvents } = schema;
const TAG = `dbtest-${Date.now()}`;
const orderIds: string[] = [];
const eventIds: string[] = [];
const ACCOUNT = 'acct_1TestMazcina0001';
const OTHER_ACCOUNT = 'acct_1SomeoneElse0002';

// Checkout talks to Stripe; here it talks to this stand-in, which records what it was asked.
const sessionsCreate = vi.hoisted(() => vi.fn());
vi.mock('./config', async (original) => ({
  ...(await original<typeof import('./config')>()),
  stripe: () => ({ checkout: { sessions: { create: sessionsCreate } } }),
}));

beforeAll(() => {
  if (process.env.VERCEL_ENV === 'production') throw new Error('Refusing to run database tests against production');
  process.env.GIFT_CODE_KEY ??= 'c'.repeat(64);
});

afterAll(async () => {
  if (orderIds.length > 0) {
    const cards = await db.select({ id: giftCards.id }).from(giftCards).where(inArray(giftCards.orderId, orderIds));
    const cardIds = cards.map((c) => c.id);
    if (cardIds.length > 0) {
      await db.delete(emailOutbox).where(inArray(emailOutbox.giftCardId, cardIds));
      await db.delete(giftCardLedger).where(inArray(giftCardLedger.cardId, cardIds));
      await db.delete(giftCards).where(inArray(giftCards.id, cardIds));
    }
    await db.delete(giftCardOrders).where(inArray(giftCardOrders.id, orderIds));
  }
  if (eventIds.length > 0) await db.delete(stripeEvents).where(inArray(stripeEvents.id, eventIds));
});

async function order(amountCents = 10000, stripeAccountId: string | null = null) {
  const [row] = await db
    .insert(giftCardOrders)
    .values({ amountCents, buyerName: 'Test Buyer', buyerEmail: `${TAG}@example.com`, recipientName: 'Test Friend', recipientEmail: `${TAG}-friend@example.com`, message: 'Enjoy', stripeAccountId })
    .returning();
  orderIds.push(row.id);
  return row;
}

const pay = (orderId: string, n: string, amountTotal = 10000) => ({ sessionId: `cs_${TAG}_${n}`, paymentIntentId: `pi_${TAG}_${n}`, amountTotal, currency: 'aud' });

async function issued(amountCents = 10000, n = String(orderIds.length)) {
  const o = await order(amountCents);
  const { cardId } = await fulfilOrder(o.id, pay(o.id, n, amountCents));
  return { order: o, cardId, paymentIntentId: `pi_${TAG}_${n}` };
}

const card = async (id: string) => (await db.select().from(giftCards).where(eq(giftCards.id, id)))[0];

function event(type: string, object: Record<string, unknown>, account?: string): Stripe.Event {
  const id = `evt_${TAG}_${eventIds.length}`;
  eventIds.push(id);
  return { id, type, account, data: { object } } as unknown as Stripe.Event;
}

describe('issuing', () => {
  it('creates one card, one ledger entry and two emails, however often it is called', async () => {
    const o = await order();
    const results = await Promise.all(Array.from({ length: 8 }, () => fulfilOrder(o.id, pay(o.id, 'multi'))));
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.cardId)).size).toBe(1);

    const c = await card(results[0].cardId);
    expect(c).toMatchObject({ initialCents: 10000, balanceCents: 10000, status: 'active' });
    expect(c.expiresOn > new Date().toISOString().slice(0, 10)).toBe(true);
    expect(await ledgerBalance(c.id)).toBe(10000);
    expect(await db.select().from(emailOutbox).where(eq(emailOutbox.giftCardId, c.id))).toHaveLength(2);
    expect((await db.select().from(giftCardOrders).where(eq(giftCardOrders.id, o.id)))[0].status).toBe('paid');
  });

  it('stores the code so it can be looked up and re-sent, but never in the clear', async () => {
    const { cardId } = await issued();
    const c = await card(cardId);
    const code = decryptCode(c.codeEncrypted, process.env.GIFT_CODE_KEY!);
    expect(JSON.stringify(c)).not.toContain(code);
    expect(c.codeLast4).toBe(code.slice(-4));
    expect((await findCardByCode(code.toLowerCase().replace(/(.{4})/g, '$1 ')))?.id).toBe(cardId);
    expect(await findCardByCode('ABCDEFGHJKMNPQRS')).toBeNull();
    expect(await findCardByCode('not a code')).toBeNull();
  });

  it('refuses a payment that does not match the order', async () => {
    const o = await order(10000);
    await expect(fulfilOrder(o.id, pay(o.id, 'short', 5000))).rejects.toThrow(GiftCardError);
    await expect(fulfilOrder(o.id, { ...pay(o.id, 'usd'), currency: 'usd' })).rejects.toThrow(GiftCardError);
    expect(await db.select().from(giftCards).where(eq(giftCards.orderId, o.id))).toHaveLength(0);
  });
});

describe('redeeming', () => {
  it('never lets 20 simultaneous redemptions overspend a card', async () => {
    const { cardId } = await issued(10000);
    const attempts = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => redeem(cardId, 1500, `till-${i}@example.com`, null)));
    const ok = attempts.filter((a) => a.status === 'fulfilled').length;
    expect(ok).toBe(6); // 6 x $15 = $90; a seventh would need $105
    expect(attempts.filter((a) => a.status === 'rejected').every((a) => (a as PromiseRejectedResult).reason instanceof GiftCardError)).toBe(true);
    const c = await card(cardId);
    expect(c.balanceCents).toBe(1000);
    expect(await ledgerBalance(cardId)).toBe(1000);
  });

  it('allows partial then exact redemption, then nothing more', async () => {
    const { cardId } = await issued(5000);
    expect((await redeem(cardId, 2000, 'staff@example.com', 'Table 4')).balanceCents).toBe(3000);
    expect((await redeem(cardId, 3000, 'staff@example.com', null)).balanceCents).toBe(0);
    await expect(redeem(cardId, 1, 'staff@example.com', null)).rejects.toThrow('Only $0.00 is left');
    for (const bad of [0, -100, 10.5, Number.NaN]) await expect(redeem(cardId, bad, 'staff@example.com', null)).rejects.toThrow(GiftCardError);
  });

  it('refuses an expired card', async () => {
    const { cardId } = await issued();
    await db.update(giftCards).set({ expiresOn: '2020-01-01' }).where(eq(giftCards.id, cardId));
    await expect(redeem(cardId, 100, 'staff@example.com', null)).rejects.toThrow('expired');
  });

  it('reverses a redemption once only, and only a redemption', async () => {
    const { cardId } = await issued(5000);
    const { ledgerId } = await redeem(cardId, 2000, 'staff@example.com', null);
    const both = await Promise.allSettled([reverseRedemption(ledgerId, 'owner@example.com', 'wrong table'), reverseRedemption(ledgerId, 'owner@example.com', 'wrong table')]);
    expect(both.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await card(cardId)).balanceCents).toBe(5000);
    expect(await ledgerBalance(cardId)).toBe(5000);
    const [issue] = await db.select().from(giftCardLedger).where(eq(giftCardLedger.cardId, cardId)).limit(1);
    await expect(reverseRedemption(issue.id, 'owner@example.com', null)).rejects.toThrow('not a redemption');
  });

  it('the database itself rejects a balance below zero or above the original value', async () => {
    const { cardId } = await issued(5000);
    await expect(db.update(giftCards).set({ balanceCents: -1 }).where(eq(giftCards.id, cardId))).rejects.toThrow();
    await expect(db.update(giftCards).set({ balanceCents: 5001 }).where(eq(giftCards.id, cardId))).rejects.toThrow();
    await expect(db.insert(giftCardLedger).values({ cardId, kind: 'redeem', amountCents: 100, actorEmail: 'x' })).rejects.toThrow();
  });
});

describe('refunds and disputes', () => {
  it('cancels an untouched card and is harmless when repeated', async () => {
    const { cardId, paymentIntentId } = await issued(5000);
    expect(await voidForPayment(paymentIntentId, 'Payment refunded')).toBe('voided');
    expect(await voidForPayment(paymentIntentId, 'Payment refunded')).toBe('already_void');
    expect(await card(cardId)).toMatchObject({ status: 'void', balanceCents: 0 });
    expect(await ledgerBalance(cardId)).toBe(0);
    await expect(redeem(cardId, 100, 'staff@example.com', null)).rejects.toThrow('cancelled');
  });

  it('flags a partly used card instead of cancelling it', async () => {
    const { cardId, paymentIntentId } = await issued(5000);
    await redeem(cardId, 1000, 'staff@example.com', null);
    expect(await voidForPayment(paymentIntentId, 'Payment disputed by the cardholder')).toBe('flagged');
    expect(await card(cardId)).toMatchObject({ status: 'active', balanceCents: 4000, flaggedReason: 'Payment disputed by the cardholder' });
    expect(await voidForPayment('pi_unknown', 'x')).toBe('no_card');
  });
});

describe('Stripe events', () => {
  it('fulfils a paid session once, ignoring a replay of the same event and a second event for the same session', async () => {
    const o = await order(7500);
    const session = { id: `cs_${TAG}_evt`, client_reference_id: o.id, payment_status: 'paid', payment_intent: `pi_${TAG}_evt`, amount_total: 7500, currency: 'aud' };
    const first = event('checkout.session.completed', session);
    expect(await handleStripeEvent(first)).toBe('fulfilled');
    expect(await handleStripeEvent(first)).toBe('duplicate');
    expect(await handleStripeEvent(event('checkout.session.async_payment_succeeded', session))).toBe('already_fulfilled');
    expect(await db.select().from(giftCards).where(eq(giftCards.orderId, o.id))).toHaveLength(1);
  });

  it('does not issue a card for a session that is complete but not yet paid', async () => {
    const o = await order(7500);
    const session = { id: `cs_${TAG}_unpaid`, client_reference_id: o.id, payment_status: 'unpaid', payment_intent: null, amount_total: 7500, currency: 'aud' };
    expect(await handleStripeEvent(event('checkout.session.completed', session))).toBe('not_paid');
    expect(await db.select().from(giftCards).where(eq(giftCards.orderId, o.id))).toHaveLength(0);
    expect(await handleStripeEvent(event('checkout.session.async_payment_failed', session))).toBe('order_closed');
    expect((await db.select().from(giftCardOrders).where(eq(giftCardOrders.id, o.id)))[0].status).toBe('failed');
  });

  it('records a mismatched payment as rejected without issuing or asking Stripe to retry', async () => {
    const o = await order(7500);
    const session = { id: `cs_${TAG}_bad`, client_reference_id: o.id, payment_status: 'paid', payment_intent: `pi_${TAG}_bad`, amount_total: 100, currency: 'aud' };
    expect(await handleStripeEvent(event('checkout.session.completed', session))).toBe('rejected');
    expect(await db.select().from(giftCards).where(eq(giftCards.orderId, o.id))).toHaveLength(0);
  });

  it('voids on refund and ignores unrelated events', async () => {
    const { cardId, paymentIntentId } = await issued(5000);
    expect(await handleStripeEvent(event('charge.refunded', { payment_intent: paymentIntentId }))).toBe('voided');
    expect((await card(cardId)).status).toBe('void');
    expect(await handleStripeEvent(event('customer.created', {}))).toBe('ignored');
    expect(await handleStripeEvent(event('checkout.session.completed', { id: 'cs_x', client_reference_id: null, payment_status: 'paid' }))).toBe('ignored');
  });
});

describe('the connected Stripe account', () => {
  const paid = (orderId: string, n: string) => ({ id: `cs_${TAG}_${n}`, client_reference_id: orderId, payment_status: 'paid', payment_intent: `pi_${TAG}_${n}`, amount_total: 7500, currency: 'aud' });

  it('issues a card only for a payment taken on the account the order was opened on', async () => {
    const o = await order(7500, ACCOUNT);
    await expect(fulfilOrder(o.id, { ...pay(o.id, 'acct-none', 7500) })).rejects.toThrow(GiftCardError);
    await expect(fulfilOrder(o.id, { ...pay(o.id, 'acct-other', 7500), account: OTHER_ACCOUNT })).rejects.toThrow(GiftCardError);
    expect(await db.select().from(giftCards).where(eq(giftCards.orderId, o.id))).toHaveLength(0);
    expect((await fulfilOrder(o.id, { ...pay(o.id, 'acct-right', 7500), account: ACCOUNT })).created).toBe(true);
  });

  it('refuses a connected-account payment for an order that was not opened on one', async () => {
    const o = await order(7500);
    await expect(fulfilOrder(o.id, { ...pay(o.id, 'acct-legacy', 7500), account: ACCOUNT })).rejects.toThrow(GiftCardError);
  });

  it('ignores events from any other account, or from none, without using up the event', async () => {
    const o = await order(7500, ACCOUNT);
    const session = paid(o.id, 'conn');
    expect(await handleStripeEvent(event('checkout.session.completed', session, OTHER_ACCOUNT), ACCOUNT)).toBe('ignored');
    expect(await handleStripeEvent(event('checkout.session.completed', session), ACCOUNT)).toBe('ignored');
    expect(await db.select().from(giftCards).where(eq(giftCards.orderId, o.id))).toHaveLength(0);

    const right = event('checkout.session.completed', session, ACCOUNT);
    expect(await handleStripeEvent(right, ACCOUNT)).toBe('fulfilled');
    expect(await handleStripeEvent(right, ACCOUNT)).toBe('duplicate');
    expect(await db.select().from(giftCards).where(eq(giftCards.orderId, o.id))).toHaveLength(1);
  });

  it('rejects a right-account event for an order opened on a different account', async () => {
    const o = await order(7500, OTHER_ACCOUNT);
    expect(await handleStripeEvent(event('checkout.session.completed', paid(o.id, 'cross'), ACCOUNT), ACCOUNT)).toBe('rejected');
    expect(await db.select().from(giftCards).where(eq(giftCards.orderId, o.id))).toHaveLength(0);
  });

  it('voids on a refund or dispute from the connected account', async () => {
    const o = await order(7500, ACCOUNT);
    const { cardId } = await fulfilOrder(o.id, { ...pay(o.id, 'conn-refund', 7500), account: ACCOUNT });
    expect(await handleStripeEvent(event('charge.refunded', { payment_intent: `pi_${TAG}_conn-refund` }, OTHER_ACCOUNT), ACCOUNT)).toBe('ignored');
    expect((await card(cardId)).status).toBe('active');
    expect(await handleStripeEvent(event('charge.dispute.created', { payment_intent: `pi_${TAG}_conn-refund` }, ACCOUNT), ACCOUNT)).toBe('voided');
    expect((await card(cardId)).status).toBe('void');
  });
});

describe('checkout', () => {
  const KEYS = ['STRIPE_SECRET_KEY', 'STRIPE_CONNECT_ACCOUNT_ID', 'GIFT_PLATFORM_FEE_BPS'] as const;
  const form = (n: string) => ({ amount: '100', buyerName: 'Test Buyer', buyerEmail: `${TAG}-co-${n}@example.com`, forMe: true, terms: true });
  const placed = async (n: string) => (await db.select().from(giftCardOrders).where(eq(giftCardOrders.buyerEmail, `${TAG}-co-${n}@example.com`)))[0];

  async function checkout(n: string, env: Partial<Record<(typeof KEYS)[number], string>>) {
    const before = KEYS.map((key) => [key, process.env[key]] as const);
    for (const key of KEYS) delete process.env[key];
    Object.assign(process.env, { STRIPE_SECRET_KEY: 'rk_test_x', STRIPE_CONNECT_ACCOUNT_ID: ACCOUNT, ...env });
    sessionsCreate.mockReset();
    sessionsCreate.mockImplementation(async () => ({ id: `cs_${TAG}_co_${n}`, url: 'https://checkout.stripe.test/pay' }));
    try {
      const result = await createCheckout(form(n), 'https://mazcinarestobar.com.au');
      const row = await placed(n);
      if (row) orderIds.push(row.id);
      return { result, row };
    } finally {
      for (const [key, value] of before) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  it('opens the checkout on the connected account, with no platform fee by default', async () => {
    const { result, row } = await checkout('plain', {});
    expect(result).toEqual({ ok: true, url: 'https://checkout.stripe.test/pay' });
    expect(row).toMatchObject({ amountCents: 10000, stripeAccountId: ACCOUNT, status: 'pending', stripeSessionId: `cs_${TAG}_co_plain` });
    const [params, options] = sessionsCreate.mock.calls[0];
    expect(options).toEqual({ idempotencyKey: `gift-order-${row.id}`, stripeAccount: ACCOUNT });
    expect(params.line_items[0].price_data).toMatchObject({ currency: 'aud', unit_amount: 10000 });
    expect(params.payment_intent_data).not.toHaveProperty('application_fee_amount');
  });

  it('adds the platform fee when one is set', async () => {
    const { row } = await checkout('fee', { GIFT_PLATFORM_FEE_BPS: '250' });
    const [params, options] = sessionsCreate.mock.calls[0];
    expect(params.payment_intent_data.application_fee_amount).toBe(250);
    expect(options.stripeAccount).toBe(row.stripeAccountId);
  });

  it('never reaches Stripe, and saves nothing, without a valid connected account or fee', async () => {
    for (const [n, env] of [['noacct', { STRIPE_CONNECT_ACCOUNT_ID: '' }], ['badacct', { STRIPE_CONNECT_ACCOUNT_ID: 'mazcina' }], ['badfee', { GIFT_PLATFORM_FEE_BPS: '5000' }]] as const) {
      const { result, row } = await checkout(n, env);
      expect(result).toMatchObject({ ok: false, status: 503 });
      expect(row).toBeUndefined();
      expect(sessionsCreate).not.toHaveBeenCalled();
    }
  });

  it('tells the buyer they were not charged when Stripe refuses, and closes the order', async () => {
    const before = process.env.STRIPE_SECRET_KEY;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.STRIPE_SECRET_KEY = 'rk_test_x';
    process.env.STRIPE_CONNECT_ACCOUNT_ID = ACCOUNT;
    sessionsCreate.mockReset();
    sessionsCreate.mockRejectedValue(new Error('The account cannot currently make live charges'));
    try {
      const result = await createCheckout(form('refused'), 'https://mazcinarestobar.com.au');
      expect(result).toMatchObject({ ok: false, status: 502 });
      const row = await placed('refused');
      orderIds.push(row.id);
      expect(row.status).toBe('failed');
    } finally {
      errors.mockRestore();
      delete process.env.STRIPE_CONNECT_ACCOUNT_ID;
      if (before === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = before;
    }
  });
});
