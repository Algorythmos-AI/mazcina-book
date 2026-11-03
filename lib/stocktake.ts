/**
 * Saving a stocktake count. Kept apart from the server action so the database
 * tests can call it.
 *
 * A count says what was on the shelf when it was typed, which can be a while
 * before Save is tapped. Anything booked in between (a delivery, waste) has to
 * stay on top of the count, so the count is compared with the books as they
 * stood at that moment, not as they stand when it is saved.
 */
import DecimalJs from 'decimal.js';
import { and, desc, eq, gt, lte, sql } from 'drizzle-orm';
import { schema } from '@/db';
import type { Tx } from '@/lib/kitchen-rules';
import { countDelta } from '@/lib/stock';

/** How far back a count may say it was taken. Older drafts count as taken now. */
export const MAX_COUNT_AGE_MS = 48 * 60 * 60 * 1000;

/** The moment a count was taken, trusted only within the last 48 hours: a phone's clock can be wrong. */
export function clampCountedAt(countedAt: number | null | undefined, now: Date): Date {
  if (!countedAt || !Number.isFinite(countedAt)) return now;
  const earliest = now.getTime() - MAX_COUNT_AGE_MS;
  return new Date(Math.min(now.getTime(), Math.max(earliest, countedAt)));
}

export type CountOutcome = { saved: true } | { saved: false; countedBy: string; countedAt: Date };

/**
 * Records that `counted` (base units) was on the shelf at `countedAt`. Lock
 * the ingredient first. Refused when someone else counted it after that
 * moment: their count is newer and wins.
 */
export async function saveCount(
  tx: Tx,
  input: { ingredientId: string; counted: DecimalJs; countedAt: Date; batchId: string; actorEmail: string },
): Promise<CountOutcome> {
  const { stockMovements } = schema;
  const [newer] = await tx
    .select({ actorEmail: stockMovements.actorEmail, createdAt: stockMovements.createdAt, countedQuantity: stockMovements.countedQuantity })
    .from(stockMovements)
    .where(and(eq(stockMovements.ingredientId, input.ingredientId), eq(stockMovements.kind, 'count'), gt(stockMovements.createdAt, input.countedAt)))
    .orderBy(desc(stockMovements.createdAt))
    .limit(1);
  if (newer) {
    // The same count sent again after a dropped connection: it is already in.
    if (newer.actorEmail === input.actorEmail && newer.countedQuantity !== null && input.counted.eq(newer.countedQuantity)) return { saved: true };
    return { saved: false, countedBy: newer.actorEmail, countedAt: newer.createdAt };
  }

  const [{ total }] = await tx
    .select({ total: sql<string | null>`sum(${stockMovements.quantityDelta})` })
    .from(stockMovements)
    .where(and(eq(stockMovements.ingredientId, input.ingredientId), lte(stockMovements.createdAt, input.countedAt)));
  await tx.insert(stockMovements).values({
    ingredientId: input.ingredientId,
    kind: 'count',
    quantityDelta: countDelta(input.counted, total).toString(),
    countedQuantity: input.counted.toString(),
    batchId: input.batchId,
    actorEmail: input.actorEmail,
  });
  return { saved: true };
}
