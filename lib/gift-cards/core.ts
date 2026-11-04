/**
 * Gift card money movements. Every function here runs in one transaction and
 * locks the card (or order) row first, so two tills, a retried webhook or a
 * double tap can never issue a card twice or spend more than is on it.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { todaySydney } from '@/lib/format';
import { encryptCode, expiryFor, generateCode, hashCode, normaliseCode } from './codes';
import { claimOnce } from '@/lib/idempotency';
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
    // A refund or dispute that overtook this payment applies now: a cancelled card is
    // still created, so the money trail is complete, but nobody is emailed a code.
    const voided = !!order.paymentIssue && order.paymentIssueVoids;
    const [card] = await tx
      .insert(giftCards)
      .values({
        orderId,
        codeHash: hashCode(code, key),
        codeEncrypted: encryptCode(code, key),
        codeLast4: code.slice(-4),
        initialCents: order.amountCents,
        balanceCents: voided ? 0 : order.amountCents,
        expiresOn: expiryFor(todaySydney()),
        flaggedReason: order.paymentIssue,
        ...(voided ? { status: 'void' as const, voidedAt: new Date() } : {}),
      })
      .returning({ id: giftCards.id });
    await tx.insert(giftCardLedger).values({ cardId: card.id, kind: 'issue', amountCents: order.amountCents, actorEmail: 'stripe', note: 'Purchased online' });
    if (voided) {
      await tx.insert(giftCardLedger).values({ cardId: card.id, kind: 'void', amountCents: -order.amountCents, actorEmail: 'stripe', note: order.paymentIssue });
    } else {
      await tx.insert(emailOutbox).values([
        { kind: 'gift_card_recipient', giftCardId: card.id },
        { kind: 'gift_card_receipt', giftCardId: card.id },
      ]);
    }
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
export async function redeem(cardId: string, amountCents: number, actorEmail: string, note: string | null, requestKey?: string | null) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new GiftCardError('The amount must be more than zero');
  return db.transaction(async (tx) => {
    // The same tap sent again after a dropped connection must not take the money off twice.
    if (!(await claimOnce(tx, requestKey, 'gift_card_redeem'))) {
      throw new GiftCardError('Already taken off: the first tap went through. Check the history below before trying again.');
    }
    const [card] = await tx.select().from(giftCards).where(eq(giftCards.id, cardId)).for('update');
    if (!card) throw new GiftCardError('Card not found');
    if (card.status !== 'active') throw new GiftCardError('This card has been cancelled');
    if (card.flaggedReason) throw new GiftCardError('This card is on hold. Do not accept it; ask the owner to check it first.');
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The order a payment belongs to: by the payment id saved when the card was
 * issued, or failing that by `orderId` (from the payment's own metadata), for
 * a refund or dispute that arrives before the card exists.
 */
async function orderForPayment(tx: Tx, paymentIntentId: string, orderId: string | null | undefined) {
  const [byPayment] = await tx.select().from(giftCardOrders).where(eq(giftCardOrders.stripePaymentIntentId, paymentIntentId)).for('update');
  if (byPayment) return byPayment;
  if (!orderId) return null;
  const [byId] = await tx.select().from(giftCardOrders).where(eq(giftCardOrders.id, orderId)).for('update');
  return byId && (!byId.stripePaymentIntentId || byId.stripePaymentIntentId === paymentIntentId) ? byId : null;
}

export type PaymentOutcome = 'voided' | 'flagged' | 'already_void' | 'held' | 'no_card';

/**
 * A refund or dispute on the payment. An untouched card is cancelled. A card
 * that has already been used is put on hold for the owner, since the meal has
 * been eaten and a person has to decide what happens next. When the card does
 * not exist yet, the order remembers, and the card is cancelled as it is made.
 */
export async function voidForPayment(paymentIntentId: string, reason: string, orderId?: string | null): Promise<PaymentOutcome> {
  return db.transaction(async (tx) => {
    const order = await orderForPayment(tx, paymentIntentId, orderId);
    if (!order) return 'no_card';
    const [card] = await tx.select().from(giftCards).where(eq(giftCards.orderId, order.id)).for('update');
    if (!card) {
      await tx.update(giftCardOrders).set({ paymentIssue: reason, paymentIssueVoids: true }).where(eq(giftCardOrders.id, order.id));
      return 'held';
    }
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

/** Puts the card on hold for the owner without changing its balance, now or as soon as it is created. */
export async function flagForPayment(paymentIntentId: string, reason: string, orderId?: string | null): Promise<PaymentOutcome> {
  return db.transaction(async (tx) => {
    const order = await orderForPayment(tx, paymentIntentId, orderId);
    if (!order) return 'no_card';
    const updated = await tx.update(giftCards).set({ flaggedReason: reason }).where(eq(giftCards.orderId, order.id)).returning({ id: giftCards.id });
    if (updated.length > 0) return 'flagged';
    // Never soften a cancellation already waiting for this card into a hold.
    await tx.update(giftCardOrders).set({ paymentIssue: order.paymentIssueVoids ? order.paymentIssue : reason }).where(eq(giftCardOrders.id, order.id));
    return 'held';
  });
}

// ------------------------------------------------------------------ owner tools

async function lockActiveCard(tx: Tx, cardId: string) {
  const [card] = await tx.select().from(giftCards).where(eq(giftCards.id, cardId)).for('update');
  if (!card) throw new GiftCardError('Card not found');
  if (card.status !== 'active') throw new GiftCardError('This card has been cancelled');
  return card;
}

/** The owner has looked into a hold and the card may be used again. */
export async function clearHold(cardId: string): Promise<{ reason: string }> {
  return db.transaction(async (tx) => {
    const card = await lockActiveCard(tx, cardId);
    if (!card.flaggedReason) throw new GiftCardError('This card is not on hold');
    await tx.update(giftCards).set({ flaggedReason: null }).where(eq(giftCards.id, cardId));
    return { reason: card.flaggedReason };
  });
}

/** Sets what is left on a card, for example after a partial refund, as an `adjust` row. */
export async function adjustBalance(cardId: string, balanceCents: number, actorEmail: string, note: string) {
  if (!Number.isInteger(balanceCents) || balanceCents < 0) throw new GiftCardError('The new balance must be zero or more');
  if (!note.trim()) throw new GiftCardError('Say why the balance is changing');
  return db.transaction(async (tx) => {
    const card = await lockActiveCard(tx, cardId);
    if (balanceCents > card.initialCents) throw new GiftCardError(`A card cannot hold more than it was bought for ($${(card.initialCents / 100).toFixed(2)})`);
    const delta = balanceCents - card.balanceCents;
    if (delta === 0) throw new GiftCardError('That is already the balance');
    await tx.insert(giftCardLedger).values({ cardId, kind: 'adjust', amountCents: delta, actorEmail, note });
    await tx.update(giftCards).set({ balanceCents }).where(eq(giftCards.id, cardId));
    return { balanceCents, deltaCents: delta };
  });
}

/** Cancels a card by hand: whatever is left is written off and it can no longer be used. */
export async function cancelCard(cardId: string, actorEmail: string, note: string) {
  if (!note.trim()) throw new GiftCardError('Say why the card is being cancelled');
  return db.transaction(async (tx) => {
    const card = await lockActiveCard(tx, cardId);
    if (card.balanceCents > 0) {
      await tx.insert(giftCardLedger).values({ cardId, kind: 'void', amountCents: -card.balanceCents, actorEmail, note });
    }
    await tx.update(giftCards).set({ status: 'void', balanceCents: 0, voidedAt: new Date() }).where(eq(giftCards.id, cardId));
    return { writtenOffCents: card.balanceCents };
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
