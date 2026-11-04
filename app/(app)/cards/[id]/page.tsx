import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, desc, eq } from 'drizzle-orm';
import { ActionButton } from '@/components/action-button';
import { Affix } from '@/components/affix';
import { ActionForm } from '@/components/action-form';
import { badgeBad, badgeOk, badgeWarn, card as cardBox, h1, h2, input, label, muted } from '@/components/ui';
import { db, schema } from '@/db';
import { displayDate, moneyFromCents, todaySydney } from '@/lib/format';
import { ledgerBalance } from '@/lib/gift-cards/core';
import { requireRole } from '@/lib/session';
import { adjustCardBalance, cancelGiftCard, clearCardHold, redeemCard, resendCard, reverseEntry } from '../actions';

export const metadata: Metadata = { title: 'Gift card' };

const KIND = { issue: 'Bought', redeem: 'Used', reverse: 'Put back', void: 'Cancelled', adjust: 'Balance changed' } as const;

export default async function CardPage({ params }: PageProps<'/cards/[id]'>) {
  const user = await requireRole();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const [found] = await db
    .select({ card: schema.giftCards, order: schema.giftCardOrders })
    .from(schema.giftCards)
    .innerJoin(schema.giftCardOrders, eq(schema.giftCardOrders.id, schema.giftCards.orderId))
    .where(eq(schema.giftCards.id, id));
  if (!found) notFound();
  const { card, order } = found;

  const [ledger, emails, total] = await Promise.all([
    db.select().from(schema.giftCardLedger).where(eq(schema.giftCardLedger.cardId, id)).orderBy(asc(schema.giftCardLedger.createdAt)),
    user.role === 'owner'
      ? db.select().from(schema.emailOutbox).where(eq(schema.emailOutbox.giftCardId, id)).orderBy(desc(schema.emailOutbox.createdAt))
      : [],
    ledgerBalance(id),
  ]);
  const today = todaySydney();
  const expired = card.expiresOn < today;
  const held = card.status === 'active' && !!card.flaggedReason;
  const usable = card.status === 'active' && !held && !expired && card.balanceCents > 0;
  const reversed = new Set(ledger.flatMap((l) => (l.reversesId ? [l.reversesId] : [])));
  const when = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short' });
  const owner = user.role === 'owner';

  return (
    <div className="space-y-6">
      <div>
        <Link href="/cards" className={`${muted} font-semibold hover:text-mazcina-wood`}>← Gift cards</Link>
        <h1 className={`mt-1 ${h1}`}>{moneyFromCents(card.balanceCents)} left</h1>
        <p className={`mt-1 ${muted}`}>
          Card ending …{card.codeLast4} for {order.recipientName} · {moneyFromCents(card.initialCents)} to start · valid until {displayDate(card.expiresOn)}
        </p>
        <p className="mt-2 flex flex-wrap gap-2">
          {card.status === 'void' && <span className={badgeBad}>Cancelled: do not accept</span>}
          {card.status === 'active' && expired && <span className={badgeBad}>Expired: do not accept</span>}
          {usable && <span className={badgeOk}>Good to use</span>}
          {card.status === 'active' && !expired && card.balanceCents === 0 && <span className={badgeWarn}>Nothing left</span>}
          {held && <span className={badgeBad}>On hold: do not accept. {owner ? card.flaggedReason : 'Ask the owner.'}</span>}
          {card.status === 'void' && card.flaggedReason && owner && <span className={badgeWarn}>{card.flaggedReason}</span>}
          {total !== card.balanceCents && <span className={badgeBad}>Balance check failed: tell Sam before using this card</span>}
        </p>
      </div>

      {usable && total === card.balanceCents && (
        <section className={cardBox}>
          <h2 className={h2}>Take an amount off</h2>
          <ActionForm action={redeemCard} submitLabel="Take it off the card" savedLabel="Done. Now record it in the till." resetOnSuccess className="mt-3">
            <input type="hidden" name="cardId" value={card.id} />
            {/* New on every page load, the same on every retry: a redeem sent twice is taken off once. */}
            <input type="hidden" name="requestKey" value={randomUUID()} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="redeem-amount" className={label}>Amount</label>
                <Affix prefix="$">
                  <input id="redeem-amount" name="amount" inputMode="decimal" required placeholder={`up to ${(card.balanceCents / 100).toFixed(2)}`} className={`${input} pl-7 text-lg`} />
                </Affix>
              </div>
              <div>
                <label htmlFor="redeem-note" className={label}>Note (optional)</label>
                <input id="redeem-note" name="note" maxLength={120} placeholder="Table or docket number" className={input} />
              </div>
            </div>
            <p className={`mt-2 ${muted}`}>If the bill is more than what is left, take off everything that is left and charge the rest as usual.</p>
          </ActionForm>
        </section>
      )}

      <section className={cardBox}>
        <h2 className={h2}>History</h2>
        <ul className="mt-2 divide-y divide-gray-100">
          {ledger.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
              <span>
                <span className="font-semibold">{KIND[entry.kind]}</span>{' '}
                <span className="tabular-nums">{entry.amountCents > 0 ? '+' : '−'}{moneyFromCents(Math.abs(entry.amountCents))}</span>
                {entry.note && <span className={muted}> · {entry.note}</span>}
                <span className={`block ${muted}`}>{when.format(entry.createdAt)}{entry.actorEmail !== 'stripe' ? ` · ${entry.actorEmail}` : ''}</span>
              </span>
              {owner && entry.kind === 'redeem' && card.status === 'active' && !reversed.has(entry.id) && (
                <ActionButton action={reverseEntry.bind(null, entry.id)} label="Undo" confirm={`Put ${moneyFromCents(-entry.amountCents)} back on this card?`} />
              )}
              {entry.kind === 'redeem' && reversed.has(entry.id) && <span className={badgeWarn}>Undone</span>}
            </li>
          ))}
        </ul>
      </section>

      {owner && card.status === 'active' && (
        <section className={cardBox}>
          <h2 className={h2}>Fix this card</h2>
          {held && (
            <ActionForm action={clearCardHold} submitLabel="Clear the hold" savedLabel="Hold cleared" className="mt-3">
              <input type="hidden" name="cardId" value={card.id} />
              <label htmlFor="hold-note" className={label}>What you checked</label>
              <input id="hold-note" name="note" required maxLength={200} placeholder="Refund was for the drinks only; balance is right" className={input} />
              <p className={`mt-2 ${muted}`}>Once cleared, staff can use the card again. Change the balance first if it needs it.</p>
            </ActionForm>
          )}
          <ActionForm action={adjustCardBalance} submitLabel="Set balance" savedLabel="Balance changed" resetOnSuccess className="mt-5">
            <input type="hidden" name="cardId" value={card.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="adjust-balance" className={label}>New balance ($)</label>
                <input id="adjust-balance" name="balance" inputMode="decimal" required placeholder={`0 to ${(card.initialCents / 100).toFixed(2)}`} className={input} />
              </div>
              <div>
                <label htmlFor="adjust-note" className={label}>Why</label>
                <input id="adjust-note" name="note" required maxLength={200} placeholder="$20 refunded on Stripe" className={input} />
              </div>
            </div>
            <p className={`mt-2 ${muted}`}>Recorded in the history with your name. To undo a single use, press Undo on it instead.</p>
          </ActionForm>
          <ActionForm action={cancelGiftCard} submitLabel="Cancel this card" savedLabel="Card cancelled" className="mt-5">
            <input type="hidden" name="cardId" value={card.id} />
            <label htmlFor="cancel-note" className={label}>Why cancel it</label>
            <input id="cancel-note" name="note" required maxLength={200} placeholder="Refunded in full by bank transfer" className={input} />
            <p className={`mt-2 ${muted}`}>Writes off the {moneyFromCents(card.balanceCents)} left. It cannot be undone.</p>
          </ActionForm>
        </section>
      )}

      {owner && (
        <section className={cardBox}>
          <h2 className={h2}>Purchase and emails</h2>
          <p className="mt-2">
            Bought by {order.buyerName} ({order.buyerEmail}) for {order.recipientName} ({order.recipientEmail}).
          </p>
          {order.message && <p className={`mt-1 italic ${muted}`}>&ldquo;{order.message}&rdquo;</p>}
          <ul className={`mt-3 space-y-1 ${muted}`}>
            {emails.map((e) => (
              <li key={e.id}>
                {e.kind === 'gift_card_recipient' ? 'Card email' : 'Buyer confirmation'}:{' '}
                {e.status === 'sent' ? `sent ${e.sentAt ? when.format(e.sentAt) : ''}` : e.status === 'failed' ? `failed (${e.lastError ?? 'unknown'})` : `waiting to send${e.lastError ? `, last error: ${e.lastError}` : ''}`}
              </li>
            ))}
          </ul>
          {card.status === 'active' && (
            <div className="mt-3">
              <ActionButton action={resendCard.bind(null, card.id)} label="Send the card email again" confirm={`Send the card again to ${order.recipientEmail}?`} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
