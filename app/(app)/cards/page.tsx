import type { Metadata } from 'next';
import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { ActionForm } from '@/components/action-form';
import { badgeBad, badgeOk, badgeWarn, card, h1, h2, input, label, muted } from '@/components/ui';
import { db, schema } from '@/db';
import { displayDate, moneyFromCents, todaySydney } from '@/lib/format';
import { giftCardSales } from '@/lib/gift-cards/config';
import { requireRole } from '@/lib/session';
import { lookupCard } from './actions';

export const metadata: Metadata = { title: 'Gift cards' };

export default async function CardsPage() {
  const user = await requireRole();
  const sales = giftCardSales();
  const today = todaySydney();
  const cards =
    user.role === 'owner'
      ? await db
          .select({ card: schema.giftCards, order: schema.giftCardOrders })
          .from(schema.giftCards)
          .innerJoin(schema.giftCardOrders, eq(schema.giftCardOrders.id, schema.giftCards.orderId))
          .orderBy(desc(schema.giftCards.createdAt))
          .limit(100)
      : [];
  const outstanding = cards.filter((c) => c.card.status === 'active' && c.card.expiresOn >= today).reduce((sum, c) => sum + c.card.balanceCents, 0);

  return (
    <div className="space-y-6">
      <h1 className={h1}>Gift cards</h1>

      {sales.enabled && sales.testMode && <p className={badgeWarn}>Test mode: these cards were bought with test payments and are not real.</p>}
      {!sales.enabled && <p className={badgeWarn}>Online sales are switched off here ({sales.reason}).</p>}

      <section className={card}>
        <h2 className={h2}>Use a gift card</h2>
        <ActionForm action={lookupCard} submitLabel="Find card" className="mt-3">
          <label htmlFor="card-code" className={label}>Code from the customer&apos;s email</label>
          <input
            id="card-code"
            name="code"
            required
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            className={`${input} max-w-sm font-mono text-lg uppercase tracking-widest`}
          />
          <p className={`mt-2 ${muted}`}>Dashes and spaces do not matter. Take the amount off here, then record it in the till as a gift card payment.</p>
        </ActionForm>
      </section>

      {user.role === 'owner' && (
        <section className={card}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className={h2}>Cards sold ({cards.length})</h2>
            <p className={muted}>Still to be spent: <span className="font-bold text-mazcina-emerald">{moneyFromCents(outstanding)}</span></p>
          </div>
          {cards.length === 0 ? (
            <p className={`mt-2 ${muted}`}>None yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100">
              {cards.map(({ card: c, order }) => (
                <li key={c.id}>
                  <Link href={`/cards/${c.id}`} className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 py-2 hover:text-mazcina-wood">
                    <span>
                      <span className="font-semibold">{order.recipientName}</span>
                      <span className={`block ${muted}`}>…{c.codeLast4} · from {order.buyerName} · {displayDate(todaySydney(c.createdAt))}</span>
                    </span>
                    <span className="flex items-center gap-2 tabular-nums">
                      {c.flaggedReason && c.status === 'active' && <span className={badgeBad}>Check</span>}
                      {c.status === 'void' ? (
                        <span className={badgeBad}>Cancelled</span>
                      ) : c.expiresOn < today ? (
                        <span className={badgeWarn}>Expired</span>
                      ) : (
                        <span className={c.balanceCents > 0 ? badgeOk : badgeWarn}>{moneyFromCents(c.balanceCents)} left</span>
                      )}
                      <span className={muted}>of {moneyFromCents(c.initialCents)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
