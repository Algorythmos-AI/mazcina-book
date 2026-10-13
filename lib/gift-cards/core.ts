/**
 * Gift card money movements. Every function here runs in one transaction and
 * locks the card (or order) row first, so two tills, a retried webhook or a
 * double tap can never issue a card twice or spend more than is on it.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { todaySydney } from '@/lib/format';
import { encryptCode, expiryFor, generateCode, hashCode, normaliseCode } from './codes';
import { codeKey, GiftCardError } from './config';

const { giftCardLedger, giftCardOrders, giftCards, emailOutbox } = schema;

export interface Payment {
  sessionId: string;
  paymentIntentId: string | null;
  amountTotal: number | null;
  currency: string | null;
  /** The connected Stripe account the payment was taken on. */
  account?: string | null;
}

/** Creates the card for a paid order. Safe to call any number of times: only the first call creates anything. */
export async function fulfilOrder(orderId: string, payment: Payment): Promise<{ cardId: string; created: boolean }> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(giftCardOrders).where(eq(giftCardOrders.id, orderId)).for('update');
    if (!order) throw new GiftCardError(`No gift card order ${orderId}`);

    const [existing] = await tx.select({ id: giftCards.id }).from(giftCards).where(eq(giftCards.orderId, orderId));
    if (existing) return { cardId: existing.id, created: false };

    if (payment.amountTotal !== order.amountCents || payment.currency?.toLowerCase() !== 'aud') {
      throw new GiftCardError(
        `Payment for order ${orderId} does not match: paid ${payment.amountTotal} ${payment.currency}, expected ${order.amountCents} aud`,
      );
    }

    if ((payment.account ?? null) !== order.stripeAccountId) {
      throw new GiftCardError(`Payment for order ${orderId} came from Stripe account ${payment.account ?? 'none'}, expected ${order.stripeAccountId ?? 'none'}`);
    }

    const key = codeKey();
    const code = generateCode();
    const [card] = await tx
      .insert(giftCards)
      .values({
        orderId,
        codeHash: hashCode(code, key),
        codeEncrypted: encryptCode(code, key),
        codeLast4: code.slice(-4),
        initialCents: order.amountCents,
        balanceCents: order.amountCents,
        expiresOn: expiryFor(todaySydney()),
      })
      .returning({ id: giftCards.id });
    await tx.insert(giftCardLedger).values({ cardId: card.id, kind: 'issue', amountCents: order.amountCents, actorEmail: 'stripe', note: 'Purchased online' });
    await tx.insert(emailOutbox).values([
      { kind: 'gift_card_recipient', giftCardId: card.id },
      { kind: 'gift_card_receipt', giftCardId: card.id },
    ]);
    await tx
      .update(giftCardOrders)
      .set({ status: 'paid', paidAt: new Date(), stripeSessionId: payment.sessionId, stripePaymentIntentId: payment.paymentIntentId })
      .where(eq(giftCardOrders.id, orderId));
    return { cardId: card.id, created: true };
  });
}

export async function markOrder(orderId: string, status: 'failed' | 'expired'): Promise<void> {
  await db.update(giftCardOrders).set({ status }).where(and(eq(giftCardOrders.id, orderId), eq(giftCardOrders.status, 'pending')));
}

export async function findCardByCode(input: string) {
  const code = normaliseCode(input);
  if (!code) return null;
  const [card] = await db.select().from(giftCards).where(eq(giftCards.codeHash, hashCode(code, codeKey())));
  return card ?? null;
}

/** Takes value off a card. Refuses if the card is void, expired or does not have enough left. */
export async function redeem(cardId: string, amountCents: number, actorEmail: string, note: string | null) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new GiftCardError('The amount must be more than zero');
  return db.transaction(async (tx) => {
    const [card] = await tx.select().from(giftCards).where(eq(giftCards.id, cardId)).for('update');
    if (!card) throw new GiftCardError('Card not found');
    if (card.status !== 'active') throw new GiftCardError('This card has been cancelled');
    if (card.expiresOn < todaySydney()) throw new GiftCardError('This card has expired');
    if (amountCents > card.balanceCents) throw new GiftCardError(`Only $${(card.balanceCents / 100).toFixed(2)} is left on this card`);
    const [entry] = await tx
      .insert(giftCardLedger)
      .values({ cardId, kind: 'redeem', amountCents: -amountCents, actorEmail, note })
      .returning({ id: giftCardLedger.id });
    const balanceCents = card.balanceCents - amountCents;
    await tx.update(giftCards).set({ balanceCents }).where(eq(giftCards.id, cardId));
    return { ledgerId: entry.id, balanceCents };
  });
}

/** Puts a mistaken redemption back, as a new ledger row. A redemption can be reversed once. */
export async function reverseRedemption(ledgerId: string, actorEmail: string, note: string | null) {
  return db.transaction(async (tx) => {
    const [entry] = await tx.select().from(giftCardLedger).where(eq(giftCardLedger.id, ledgerId));
    if (!entry || entry.kind !== 'redeem') throw new GiftCardError('That is not a redemption');
    const [card] = await tx.select().from(giftCards).where(eq(giftCards.id, entry.cardId)).for('update');
    if (!card) throw new GiftCardError('Card not found');
    if (card.status !== 'active') throw new GiftCardError('This card has been cancelled');
    const [already] = await tx.select({ id: giftCardLedger.id }).from(giftCardLedger).where(eq(giftCardLedger.reversesId, ledgerId));
    if (already) throw new GiftCardError('That redemption was already reversed');
    await tx.insert(giftCardLedger).values({ cardId: card.id, kind: 'reverse', amountCents: -entry.amountCents, actorEmail, note, reversesId: ledgerId });
    const balanceCents = card.balanceCents - entry.amountCents;
    await tx.update(giftCards).set({ balanceCents }).where(eq(giftCards.id, card.id));
    return { balanceCents };
  });
}

/**
 * A refund or dispute on the payment. An untouched card is cancelled. A card
 * that has already been used is left working and flagged for the owner, since
 * the meal has been eaten and a person has to decide what happens next.
 */
export async function voidForPayment(paymentIntentId: string, reason: string): Promise<'voided' | 'flagged' | 'already_void' | 'no_card'> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select({ id: giftCardOrders.id }).from(giftCardOrders).where(eq(giftCardOrders.stripePaymentIntentId, paymentIntentId));
    if (!order) return 'no_card';
    const [card] = await tx.select().from(giftCards).where(eq(giftCards.orderId, order.id)).for('update');
    if (!card) return 'no_card';
    if (card.status === 'void') return 'already_void';
    if (card.balanceCents !== card.initialCents) {
      await tx.update(giftCards).set({ flaggedReason: reason }).where(eq(giftCards.id, card.id));
      return 'flagged';
    }
    await tx.insert(giftCardLedger).values({ cardId: card.id, kind: 'void', amountCents: -card.balanceCents, actorEmail: 'stripe', note: reason });
    await tx.update(giftCards).set({ status: 'void', balanceCents: 0, voidedAt: new Date(), flaggedReason: reason }).where(eq(giftCards.id, card.id));
    return 'voided';
  });
}

/** Sum of the ledger for a card: must always equal `balance_cents`. Used by tests and the card page. */
export async function ledgerBalance(cardId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${giftCardLedger.amountCents}), 0)::int` })
    .from(giftCardLedger)
    .where(eq(giftCardLedger.cardId, cardId));
  return row.total;
}
