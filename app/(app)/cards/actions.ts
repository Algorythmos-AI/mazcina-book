'use server';

import { and, eq, gt, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db, schema } from '@/db';
import { parseDecimalInput } from '@/lib/costing';
import { GiftCardError } from '@/lib/gift-cards/config';
import { findCardByCode, redeem, reverseRedemption } from '@/lib/gift-cards/core';
import { queueResend, sendPendingEmails } from '@/lib/gift-cards/outbox';
import { requireRole, type CurrentUser } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

const uuid = z.uuid();
const MAX_FAILED_LOOKUPS = 10;

const field = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
};

async function run<T>(user: CurrentUser, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof GiftCardError) return { ok: false, error: error.message };
    console.error(`[gift-cards] action failed for ${user.email}`, error);
    return { ok: false, error: 'Something went wrong. Nothing was changed, please try again.' };
  }
}

const log = (user: CurrentUser, action: string, entityId: string, after?: unknown) =>
  db.insert(schema.auditLog).values({ actorEmail: user.email, action, entity: 'gift_card', entityId, after: after ?? null });

/** Finds a card from its code. Wrong guesses are counted per person, and too many in ten minutes locks lookups for a while. */
export async function lookupCard(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireRole();
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const [{ failures }] = await db
    .select({ failures: sql<number>`count(*)::int` })
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.actorEmail, user.email), eq(schema.auditLog.action, 'lookup_failed'), gt(schema.auditLog.at, tenMinutesAgo)));
  if (failures >= MAX_FAILED_LOOKUPS) return { ok: false, error: 'Too many wrong codes. Wait ten minutes, then try again.' };

  let card: Awaited<ReturnType<typeof findCardByCode>>;
  try {
    card = await findCardByCode(field(form, 'code'));
  } catch (error) {
    console.error('[gift-cards] lookup failed', error);
    return { ok: false, error: 'Gift cards are not set up on this copy of the app.' };
  }
  if (!card) {
    await log(user, 'lookup_failed', '-');
    return { ok: false, error: 'No card with that code. Check each letter and number; there is no O, I, L, 0 or 1.' };
  }
  redirect(`/cards/${card.id}`);
}

export async function redeemCard(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await requireRole();
  const cardId = uuid.safeParse(field(form, 'cardId'));
  const parsed = parseDecimalInput(field(form, 'amount').replace(/^\$/, ''));
  if (!cardId.success) return { ok: false, error: 'Card not found' };
  if (parsed === null || !/^\d+(\.\d{1,2})?$/.test(parsed)) return { ok: false, error: 'Type the amount in dollars, like 45 or 45.50' };
  const amountCents = Math.round(Number(parsed) * 100);
  const note = field(form, 'note').slice(0, 120) || null;

  const result = await run(user, async () => {
    const { balanceCents } = await redeem(cardId.data, amountCents, user.email, note);
    await log(user, 'redeem', cardId.data, { amountCents, balanceCents });
  });
  if (result.ok) revalidatePath('/cards', 'layout');
  return result;
}

export async function reverseEntry(ledgerId: string): Promise<ActionResult> {
  const user = await requireRole('owner');
  if (!uuid.safeParse(ledgerId).success) return { ok: false, error: 'Entry not found' };
  const result = await run(user, async () => {
    const { balanceCents } = await reverseRedemption(ledgerId, user.email, 'Reversed by owner');
    await log(user, 'reverse', ledgerId, { balanceCents });
  });
  if (result.ok) revalidatePath('/cards', 'layout');
  return result;
}

export async function resendCard(cardId: string): Promise<ActionResult> {
  const user = await requireRole('owner');
  if (!uuid.safeParse(cardId).success) return { ok: false, error: 'Card not found' };
  const result = await run(user, async () => {
    const [card] = await db.select({ status: schema.giftCards.status }).from(schema.giftCards).where(eq(schema.giftCards.id, cardId));
    if (!card) throw new GiftCardError('Card not found');
    if (card.status !== 'active') throw new GiftCardError('This card has been cancelled, so it cannot be re-sent');
    await queueResend(cardId);
    await log(user, 'resend', cardId);
    const { failed } = await sendPendingEmails();
    if (failed > 0) throw new GiftCardError('The email could not be sent just now. It will be retried automatically within 15 minutes.');
  });
  if (result.ok) revalidatePath('/cards', 'layout');
  return result;
}
