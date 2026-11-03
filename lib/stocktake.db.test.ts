import DecimalJs from 'decimal.js';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, schema } from '@/db';
import { clampCountedAt, MAX_COUNT_AGE_MS, saveCount } from './stocktake';

const TAG = `stocktest-${Date.now()}`;
const made: string[] = [];
const ACTOR = 'test@example.com';

beforeAll(() => {
  if (process.env.VERCEL_ENV === 'production') throw new Error('Refusing to run database tests against production');
});

afterAll(async () => {
  if (made.length === 0) return;
  await db.delete(schema.stockMovements).where(inArray(schema.stockMovements.ingredientId, made));
  await db.delete(schema.ingredients).where(inArray(schema.ingredients.id, made));
});

async function ingredient() {
  const [row] = await db.insert(schema.ingredients).values({ name: `${TAG} ${made.length}`, baseUnit: 'g' }).returning();
  made.push(row.id);
  return row;
}

async function onHand(id: string) {
  const [{ total }] = await db
    .select({ total: sql<string>`coalesce(sum(${schema.stockMovements.quantityDelta}), 0)::text` })
    .from(schema.stockMovements)
    .where(eq(schema.stockMovements.ingredientId, id));
  return Number(total);
}

const book = (ingredientId: string, kind: 'receive' | 'waste', delta: string, at: Date) =>
  db.insert(schema.stockMovements).values({ ingredientId, kind, quantityDelta: delta, actorEmail: ACTOR, createdAt: at });

const count = (ingredientId: string, counted: string, countedAt: Date, actorEmail = ACTOR) =>
  db.transaction((tx) => saveCount(tx, { ingredientId, counted: new DecimalJs(counted), countedAt, batchId: crypto.randomUUID(), actorEmail }));

describe('a stocktake count', () => {
  it('keeps a delivery booked between counting and saving', async () => {
    const flour = await ingredient();
    const start = Date.now();
    await book(flour.id, 'receive', '10000', new Date(start - 60 * 60_000));
    const countedAt = new Date(start - 30 * 60_000); // counted 4 kg half an hour ago
    await book(flour.id, 'receive', '25000', new Date(start - 10 * 60_000)); // 25 kg arrived after
    expect(await count(flour.id, '4000', countedAt)).toEqual({ saved: true });
    expect(await onHand(flour.id)).toBe(29000);
  });

  it('is skipped when someone else counted the same thing later', async () => {
    const oil = await ingredient();
    const old = new Date(Date.now() - 2 * 60 * 60_000);
    expect(await count(oil.id, '3000', new Date(), 'someone@example.com')).toEqual({ saved: true });
    const outcome = await count(oil.id, '9999', old);
    expect(outcome.saved).toBe(false);
    expect(outcome.saved === false && outcome.countedBy).toBe('someone@example.com');
    expect(await onHand(oil.id)).toBe(3000);
  });
});

describe('clampCountedAt', () => {
  const now = new Date('2026-11-03T10:00:00Z');
  it('trusts a recent time and pulls in a wrong clock', () => {
    expect(clampCountedAt(now.getTime() - 60_000, now).getTime()).toBe(now.getTime() - 60_000);
    expect(clampCountedAt(now.getTime() + 3_600_000, now)).toEqual(now);
    expect(clampCountedAt(now.getTime() - 10 * MAX_COUNT_AGE_MS, now).getTime()).toBe(now.getTime() - MAX_COUNT_AGE_MS);
    expect(clampCountedAt(null, now)).toEqual(now);
  });
});
