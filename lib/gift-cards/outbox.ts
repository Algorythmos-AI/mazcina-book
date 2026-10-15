import { and, asc, eq, lt } from 'drizzle-orm';
import { db, schema } from '@/db';
import { sendEmail } from '@/lib/email';
import { decryptCode } from './codes';
import { codeKey } from './config';
import { CODE_QR_ID, receiptEmail, recipientEmail } from './emails';
import { codeQrPng } from './qr';

const { emailOutbox, giftCardOrders, giftCards } = schema;
const MAX_ATTEMPTS = 8;

/**
 * Sends gift card emails that are still owed. Each row is claimed with a
 * compare-and-set on its attempt count, so two runs at once cannot send the
 * same email twice. A failure is recorded and tried again on the next run.
 */
export async function sendPendingEmails(limit = 20): Promise<{ sent: number; failed: number }> {
  const pending = await db
    .select()
    .from(emailOutbox)
    .where(and(eq(emailOutbox.status, 'pending'), lt(emailOutbox.attempts, MAX_ATTEMPTS)))
    .orderBy(asc(emailOutbox.createdAt))
    .limit(limit);

  let sent = 0;
  let failed = 0;
  for (const row of pending) {
    const claimed = await db
      .update(emailOutbox)
      .set({ attempts: row.attempts + 1 })
      .where(and(eq(emailOutbox.id, row.id), eq(emailOutbox.status, 'pending'), eq(emailOutbox.attempts, row.attempts)))
      .returning({ id: emailOutbox.id });
    if (claimed.length === 0) continue;

    try {
      const [found] = await db
        .select({ card: giftCards, order: giftCardOrders })
        .from(giftCards)
        .innerJoin(giftCardOrders, eq(giftCardOrders.id, giftCards.orderId))
        .where(eq(giftCards.id, row.giftCardId));
      if (!found) throw new Error('card not found');
      const { card, order } = found;
      if (card.status === 'void') {
        await db.update(emailOutbox).set({ status: 'failed', lastError: 'Not sent: the card was cancelled first' }).where(eq(emailOutbox.id, row.id));
        continue;
      }
      const details = {
        code: decryptCode(card.codeEncrypted, codeKey()),
        amountCents: card.initialCents,
        expiresOn: card.expiresOn,
        buyerName: order.buyerName,
        recipientName: order.recipientName,
        message: order.message,
      };
      if (row.kind === 'gift_card_recipient') {
        const qr = { filename: 'gift-card-qr.png', content: await codeQrPng(details.code), contentId: CODE_QR_ID };
        await sendEmail({ to: order.recipientEmail, from: 'giftCards', ...recipientEmail(details), inline: [qr], idempotencyKey: `outbox-${row.id}` });
      } else if (row.kind === 'gift_card_receipt') {
        // Buying for yourself: the card email is the confirmation, so skip the second one.
        if (order.buyerEmail.toLowerCase() !== order.recipientEmail.toLowerCase()) {
          await sendEmail({ to: order.buyerEmail, from: 'giftCards', ...receiptEmail({ ...details, recipientEmail: order.recipientEmail }), idempotencyKey: `outbox-${row.id}` });
        }
      } else {
        throw new Error(`unknown email kind ${row.kind}`);
      }
      await db.update(emailOutbox).set({ status: 'sent', sentAt: new Date(), lastError: null }).where(eq(emailOutbox.id, row.id));
      sent++;
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[gift-cards] email ${row.id} (${row.kind}) failed on attempt ${row.attempts + 1}: ${message}`);
      await db
        .update(emailOutbox)
        .set({ lastError: message.slice(0, 500), status: row.attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'pending' })
        .where(eq(emailOutbox.id, row.id));
    }
  }
  return { sent, failed };
}

/** Queues the card email again, e.g. when the recipient cannot find it. */
export async function queueResend(giftCardId: string): Promise<void> {
  await db.insert(emailOutbox).values({ kind: 'gift_card_recipient', giftCardId });
}
