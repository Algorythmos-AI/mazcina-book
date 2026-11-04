'use server';

import { randomUUID } from 'node:crypto';
import DecimalJs from 'decimal.js';
import { desc, eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db, schema } from '@/db';
import { audit, decimal, Invalid, mutate, parse, text, unit, uuid, type Tx } from '@/lib/action-helpers';
import { convertToBase } from '@/lib/costing';
import { todaySydney } from '@/lib/format';
import { formatStock } from '@/lib/stock';
import { clampCountedAt, saveCount } from '@/lib/stocktake';
import type { ActionResult } from '@/lib/types';

const { ingredients, stockMovements, ingredientPrices, suppliers } = schema;
const MAX_LINES = 400;

const quantityLine = z.object({ ingredientId: uuid, quantity: z.string().max(20), unit });
const stocktakePayload = z.object({
  lines: z.array(quantityLine.extend({ countedAt: z.number().int().positive().nullable().optional() })).min(1).max(MAX_LINES),
});
const deliveryPayload = z.object({
  supplierId: uuid.nullable(),
  lines: z
    .array(quantityLine.extend({ totalPaid: z.string().max(20), gst: z.enum(['', 'free', 'inc', 'ex']).default('') }))
    .min(1)
    .max(MAX_LINES),
});

type Ingredient = typeof ingredients.$inferSelect;

/** GST treatment for an ingredient's first ever price, which the person recording the delivery has to choose. */
function firstPriceGst(choice: '' | 'free' | 'inc' | 'ex', name: string): { gstApplicable: boolean; priceIncludesGst: boolean } {
  if (choice === 'free') return { gstApplicable: false, priceIncludesGst: false };
  if (choice === 'inc') return { gstApplicable: true, priceIncludesGst: true };
  if (choice === 'ex') return { gstApplicable: true, priceIncludesGst: false };
  throw new Invalid(`Say whether ${name} has GST: it is the first price recorded for it`);
}

/** Locks the ingredient so two people recording stock at once are applied one after the other. */
async function lockIngredient(tx: Tx, id: string): Promise<Ingredient> {
  const [row] = await tx.select().from(ingredients).where(eq(ingredients.id, id)).for('update');
  if (!row || row.archivedAt) throw new Invalid('An ingredient in this list no longer exists. Reload the page.');
  return row;
}

async function onHand(tx: Tx, ingredientId: string): Promise<string | null> {
  const [row] = await tx
    .select({ total: sql<string | null>`sum(${stockMovements.quantityDelta})` })
    .from(stockMovements)
    .where(eq(stockMovements.ingredientId, ingredientId));
  return row.total;
}

/** A typed quantity in any unit the ingredient supports, as base units. */
function toBase(ingredient: Ingredient, raw: string, rawUnit: z.infer<typeof unit>, label: string, opts: { allowZero?: boolean } = {}): DecimalJs {
  const parsed = decimal(raw.trim(), label, { min: 0, minExclusive: !opts.allowZero })!;
  const base = convertToBase(parsed, rawUnit, ingredient.baseUnit, ingredient);
  if (!base) throw new Invalid(`${ingredient.name} cannot be measured in ${rawUnit} until it has a conversion (grams per each / per ml)`);
  if (base.decimalPlaces() > 4) return base.toDecimalPlaces(4);
  return base;
}

/**
 * Records a stocktake: for each line, what is physically there. Each count is
 * stored with the difference it made, so shrinkage is visible afterwards.
 * Lines left blank on the screen are simply not sent and stay untouched. A
 * line someone else counted more recently is skipped and named in the result.
 */
export async function recordStocktake(
  input: z.infer<typeof stocktakePayload>,
): Promise<ActionResult<{ counted: number; skipped: { name: string; by: string; at: string }[] }>> {
  const result = await mutate(async (user) => {
    const payload = parse(stocktakePayload, input, 'Stocktake');
    if (new Set(payload.lines.map((l) => l.ingredientId)).size !== payload.lines.length) throw new Invalid('An ingredient appears twice');
    const batchId = randomUUID();
    const now = new Date();
    const skipped: { name: string; by: string; at: string }[] = [];
    await db.transaction(async (tx) => {
      // Always lock in the same order so two stocktakes at once cannot deadlock.
      for (const line of [...payload.lines].sort((a, b) => a.ingredientId.localeCompare(b.ingredientId))) {
        const ingredient = await lockIngredient(tx, line.ingredientId);
        const counted = toBase(ingredient, line.quantity, line.unit, `${ingredient.name} count`, { allowZero: true });
        const outcome = await saveCount(tx, { ingredientId: ingredient.id, counted, countedAt: clampCountedAt(line.countedAt, now), batchId, actorEmail: user.email });
        if (!outcome.saved) skipped.push({ name: ingredient.name, by: outcome.countedBy, at: outcome.countedAt.toISOString() });
      }
      const counted = payload.lines.length - skipped.length;
      if (counted > 0) {
        await audit(tx, user, 'stocktake', 'stock', batchId, { after: { name: counted === 1 ? '1 item' : `${counted} items`, lines: counted } });
      }
    });
    return { counted: payload.lines.length - skipped.length, skipped };
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

/**
 * Books a delivery into stock. If a line says what was paid, that also becomes
 * the ingredient's new price from today, so costing and stock stay in step.
 */
export async function recordDelivery(input: z.infer<typeof deliveryPayload>): Promise<ActionResult<{ received: number; priced: number }>> {
  const result = await mutate(async (user) => {
    const payload = parse(deliveryPayload, input, 'Delivery');
    const batchId = randomUUID();
    const today = todaySydney();
    let priced = 0;
    await db.transaction(async (tx) => {
      if (payload.supplierId) {
        const [supplier] = await tx.select().from(suppliers).where(eq(suppliers.id, payload.supplierId));
        if (!supplier || supplier.archivedAt) throw new Invalid('That supplier no longer exists');
      }
      for (const line of [...payload.lines].sort((a, b) => a.ingredientId.localeCompare(b.ingredientId))) {
        const ingredient = await lockIngredient(tx, line.ingredientId);
        const received = toBase(ingredient, line.quantity, line.unit, `${ingredient.name} quantity`);
        await tx.insert(stockMovements).values({ ingredientId: ingredient.id, kind: 'receive', quantityDelta: received.toString(), batchId, actorEmail: user.email });

        if (line.totalPaid.trim()) {
          const supplierId = payload.supplierId ?? ingredient.preferredSupplierId;
          if (!supplierId) throw new Invalid(`Choose the supplier to record a price for ${ingredient.name}`);
          const packPrice = decimal(line.totalPaid.trim().replace(/^\$/, ''), `${ingredient.name} price`, { min: 0, minExclusive: true })!;
          // Carry the GST treatment over from this ingredient's last price; a first price needs it said.
          const [last] = await tx
            .select({ gstApplicable: ingredientPrices.gstApplicable, priceIncludesGst: ingredientPrices.priceIncludesGst })
            .from(ingredientPrices)
            .where(eq(ingredientPrices.ingredientId, ingredient.id))
            .orderBy(desc(ingredientPrices.effectiveDate), desc(ingredientPrices.createdAt))
            .limit(1);
          await tx.insert(ingredientPrices).values({
            ingredientId: ingredient.id,
            supplierId,
            packSize: decimal(line.quantity.trim(), 'Quantity', { min: 0, minExclusive: true })!,
            packUnit: line.unit,
            packPrice,
            ...(last ?? firstPriceGst(line.gst, ingredient.name)),
            effectiveDate: today,
            createdBy: user.email,
          });
          if (!ingredient.preferredSupplierId) {
            await tx.update(ingredients).set({ preferredSupplierId: supplierId, updatedAt: new Date(), version: ingredient.version + 1 }).where(eq(ingredients.id, ingredient.id));
          }
          priced++;
        }
      }
      await audit(tx, user, 'delivery', 'stock', batchId, { after: { name: payload.lines.length === 1 ? '1 item' : `${payload.lines.length} items`, lines: payload.lines.length, priced } });
    });
    return { received: payload.lines.length, priced };
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

/**
 * Takes stock off for waste, spoilage or a staff meal. Going below what the
 * books show has to be confirmed; the ingredient then shows "Count needed"
 * until the next stocktake sets the real figure.
 */
export async function recordWaste(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await mutate(async (user) => {
    const ingredientId = parse(uuid, text(form, 'ingredientId'), 'Ingredient');
    const rawUnit = parse(unit, text(form, 'unit'), 'Unit');
    const note = text(form, 'note').slice(0, 120) || null;
    await db.transaction(async (tx) => {
      const ingredient = await lockIngredient(tx, ingredientId);
      const amount = toBase(ingredient, text(form, 'quantity'), rawUnit, 'Quantity');
      const current = new DecimalJs((await onHand(tx, ingredient.id)) ?? 0);
      if (amount.gt(current) && form.get('beyondBooks') !== 'on') {
        throw new Invalid(
          `Only ${formatStock(current, ingredient.baseUnit)} is on the books. Tick "Record it even if it is more than the books show" to take it off anyway, then do a count.`,
        );
      }
      const [row] = await tx
        .insert(stockMovements)
        .values({ ingredientId: ingredient.id, kind: 'waste', quantityDelta: amount.neg().toString(), note, actorEmail: user.email })
        .returning({ id: stockMovements.id });
      await audit(tx, user, 'waste', 'stock', row.id, { after: { name: ingredient.name, amount: amount.toString(), note } });
    });
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

/** Sets (or clears, when left blank) the level below which an ingredient shows as low. */
export async function setParLevel(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await mutate(async (user) => {
    const ingredientId = parse(uuid, text(form, 'ingredientId'), 'Ingredient');
    const rawUnit = parse(unit, text(form, 'unit'), 'Unit');
    const raw = text(form, 'quantity');
    await db.transaction(async (tx) => {
      const ingredient = await lockIngredient(tx, ingredientId);
      const parLevel = raw ? toBase(ingredient, raw, rawUnit, 'Keep at least', { allowZero: true }).toString() : null;
      await tx.update(ingredients).set({ parLevel, updatedAt: new Date(), version: ingredient.version + 1 }).where(eq(ingredients.id, ingredient.id));
      await audit(tx, user, 'update', 'ingredient', ingredient.id, { before: { parLevel: ingredient.parLevel }, after: { name: ingredient.name, parLevel } });
    });
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
