'use server';

import DecimalJs from 'decimal.js';
import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db, schema } from '@/db';
import { convertToBase, UNITS } from '@/lib/costing';
import { nearMatches } from '@/lib/names';
import { gstFlags } from '@/lib/price-check';
import { assertCanStopBeingPrep, assertPrepsUsable, assertUnitCanChange, lockRecipeGraph, openMenuItemsUsing } from '@/lib/kitchen-rules';
import { todaySydney } from '@/lib/format';
import { audit, baseUnit, decimal, Invalid, isoDate, mutate, parse, required, text, unit, uuid, type Tx } from '@/lib/action-helpers';
import { requireRole, type CurrentUser } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

// ---------------------------------------------------------------- suppliers

export async function createSupplier(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await mutate(async (user) => {
    const values = {
      name: required(text(form, 'name'), 'Name'),
      contact: text(form, 'contact').slice(0, 200) || null,
    };
    await db.transaction(async (tx) => {
      const [row] = await tx.insert(schema.suppliers).values(values).returning({ id: schema.suppliers.id });
      await audit(tx, user, 'create', 'supplier', row.id, { after: values });
    });
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function updateSupplier(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await mutate(async (user) => {
    const id = parse(uuid, text(form, 'id'), 'Supplier');
    const values = {
      name: required(text(form, 'name'), 'Name'),
      contact: text(form, 'contact').slice(0, 200) || null,
    };
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(schema.suppliers).where(eq(schema.suppliers.id, id)).for('update');
      if (!before || before.archivedAt) throw new Invalid('Supplier not found');
      await tx
        .update(schema.suppliers)
        .set({ ...values, updatedAt: new Date(), version: before.version + 1 })
        .where(eq(schema.suppliers.id, id));
      await audit(tx, user, 'update', 'supplier', id, { before: { name: before.name, contact: before.contact }, after: values });
    });
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function setSupplierArchived(id: string, archived: boolean): Promise<ActionResult> {
  const result = await mutate(async (user) => {
    parse(uuid, id, 'Supplier');
    await db.transaction(async (tx) => {
      if (archived) {
        const preferredBy = await tx
          .select({ name: schema.ingredients.name })
          .from(schema.ingredients)
          .where(and(eq(schema.ingredients.preferredSupplierId, id), isNull(schema.ingredients.archivedAt)));
        if (preferredBy.length > 0) {
          throw new Invalid(`Still the preferred supplier for: ${preferredBy.map((i) => i.name).slice(0, 5).join(', ')}`);
        }
      }
      const updated = await tx
        .update(schema.suppliers)
        .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date(), version: sql`${schema.suppliers.version} + 1` })
        .where(eq(schema.suppliers.id, id))
        .returning({ id: schema.suppliers.id });
      if (updated.length === 0) throw new Invalid('Supplier not found');
      await audit(tx, user, archived ? 'archive' : 'restore', 'supplier', id);
    });
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

// -------------------------------------------------------------- ingredients

function ingredientValues(form: FormData) {
  const preferred = text(form, 'preferredSupplierId');
  return {
    name: required(text(form, 'name'), 'Name'),
    category: text(form, 'category').slice(0, 60) || null,
    baseUnit: parse(baseUnit, text(form, 'baseUnit'), 'Measured in'),
    yieldPct: decimal(text(form, 'yieldPct') || '100', 'Usable %', { min: 0, minExclusive: true, max: 100, places: 2 })!,
    preferredSupplierId: preferred ? parse(uuid, preferred, 'Preferred supplier') : null,
    gramsPerEach: decimal(text(form, 'gramsPerEach'), 'Grams per each', { min: 0, minExclusive: true, optional: true }),
    gramsPerMl: decimal(text(form, 'gramsPerMl'), 'Grams per ml', { min: 0, minExclusive: true, optional: true }),
  };
}

export async function createIngredient(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await mutate(async (user) => {
    const values = ingredientValues(form);
    return db.transaction(async (tx) => {
      const existing = await tx.select({ name: schema.ingredients.name }).from(schema.ingredients).where(isNull(schema.ingredients.archivedAt));
      const [twin] = nearMatches(values.name, existing.map((e) => e.name));
      if (twin) {
        throw new Invalid(
          `"${twin}" is already on the list. Use that one so its prices and stock stay together. If this really is something else, add a word that tells them apart (for example "${values.name}, Meyer").`,
        );
      }
      const [row] = await tx.insert(schema.ingredients).values(values).returning({ id: schema.ingredients.id });
      await audit(tx, user, 'create', 'ingredient', row.id, { after: values });
      return row.id;
    });
  });
  if (!result.ok) return result;
  revalidatePath('/', 'layout');
  redirect(`/ingredients/${result.data}`);
}

export async function updateIngredient(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await mutate(async (user) => {
    const id = parse(uuid, text(form, 'id'), 'Ingredient');
    const version = parse(z.coerce.number().int().positive(), text(form, 'version'), 'Version');
    const values = ingredientValues(form);
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(schema.ingredients).where(eq(schema.ingredients.id, id)).for('update');
      if (!before) throw new Invalid('Ingredient not found');
      if (before.version !== version) throw new Invalid('Someone else changed this ingredient. Reload the page and try again.');
      if (before.baseUnit !== values.baseUnit) await assertUnitCanChange(tx, before);
      await tx
        .update(schema.ingredients)
        .set({ ...values, updatedAt: new Date(), version: version + 1 })
        .where(eq(schema.ingredients.id, id));
      await audit(tx, user, 'update', 'ingredient', id, { before, after: values });
    });
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function setIngredientArchived(id: string, archived: boolean): Promise<ActionResult> {
  const result = await mutate(async (user) => {
    parse(uuid, id, 'Ingredient');
    await db.transaction(async (tx) => {
      if (archived) {
        const usedIn = await tx
          .selectDistinct({ name: schema.recipes.name })
          .from(schema.recipeLines)
          .innerJoin(schema.recipes, eq(schema.recipes.id, schema.recipeLines.recipeId))
          .where(and(eq(schema.recipeLines.ingredientId, id), isNull(schema.recipes.archivedAt)));
        if (usedIn.length > 0) {
          throw new Invalid(`Still used in: ${usedIn.map((r) => r.name).slice(0, 5).join(', ')}${usedIn.length > 5 ? '…' : ''}`);
        }
      }
      const updated = await tx
        .update(schema.ingredients)
        .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date(), version: sql`${schema.ingredients.version} + 1` })
        .where(eq(schema.ingredients.id, id))
        .returning({ id: schema.ingredients.id });
      if (updated.length === 0) throw new Invalid('Ingredient not found');
      await audit(tx, user, archived ? 'archive' : 'restore', 'ingredient', id);
    });
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function addPrice(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await mutate(async (user) => {
    const today = todaySydney();
    const values = {
      ingredientId: parse(uuid, text(form, 'ingredientId'), 'Ingredient'),
      supplierId: parse(uuid, text(form, 'supplierId'), 'Supplier'),
      packSize: decimal(text(form, 'packSize'), 'Pack size', { min: 0, minExclusive: true, max: 1_000_000 })!,
      packUnit: parse(unit, text(form, 'packUnit'), 'Pack unit'),
      packPrice: decimal(text(form, 'packPrice'), 'Pack price', { min: 0, max: 100_000, money: true })!,
      // One choice ("gst": free / inc / ex); the two older checkboxes still work.
      ...(text(form, 'gst')
        ? gstFlags(parse(z.enum(['free', 'inc', 'ex']), text(form, 'gst'), 'GST'))
        : { gstApplicable: form.get('gstApplicable') === 'on', priceIncludesGst: form.get('priceIncludesGst') === 'on' }),
      effectiveDate: parse(isoDate, text(form, 'effectiveDate') || today, 'Date'),
      createdBy: user.email,
    };
    // A $0 price makes every dish using it look cheaper than it is, so it must be meant.
    if (new DecimalJs(values.packPrice).isZero() && form.get('free') !== 'on') {
      throw new Invalid('The price is $0. If this really costs nothing (tap water, a herb from the garden), tick "This costs nothing".');
    }
    if (values.priceIncludesGst && !values.gstApplicable) {
      throw new Invalid('You ticked that the price includes GST but not that the item has GST. Tick both, or neither.');
    }
    await db.transaction(async (tx) => {
      const [ingredient] = await tx.select().from(schema.ingredients).where(eq(schema.ingredients.id, values.ingredientId));
      if (!ingredient || ingredient.archivedAt) throw new Invalid('Ingredient not found');
      const [supplier] = await tx.select().from(schema.suppliers).where(eq(schema.suppliers.id, values.supplierId));
      if (!supplier || supplier.archivedAt) throw new Invalid('Supplier not found');
      if (convertToBase(values.packSize, values.packUnit, ingredient.baseUnit, ingredient) === null) {
        throw new Invalid(
          `${ingredient.name} is measured in ${ingredient.baseUnit}. To price it per ${values.packUnit}, first add its conversion (grams per each / per ml).`,
        );
      }
      const [row] = await tx.insert(schema.ingredientPrices).values(values).returning({ id: schema.ingredientPrices.id });
      if (!ingredient.preferredSupplierId) {
        await tx
          .update(schema.ingredients)
          .set({ preferredSupplierId: values.supplierId, updatedAt: new Date(), version: ingredient.version + 1 })
          .where(eq(schema.ingredients.id, ingredient.id));
      }
      await audit(tx, user, 'price', 'ingredient', ingredient.id, { after: { ...values, priceId: row.id } });
    });
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

// ------------------------------------------------------------------ recipes

export async function createRecipe(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await mutate(async (user) => {
    const type = parse(z.enum(['dish', 'prep']), text(form, 'type') || 'dish', 'Type');
    const values = {
      name: required(text(form, 'name'), 'Name'),
      type,
      // A prep must say how much it makes. Start with a placeholder marked as an
      // estimate, so every dish using it says so until the chef weighs a batch.
      ...(type === 'prep' ? { yieldQuantity: '1', yieldUnit: 'kg' as const, yieldEstimated: true } : {}),
    };
    return db.transaction(async (tx) => {
      const [row] = await tx.insert(schema.recipes).values(values).returning({ id: schema.recipes.id });
      await audit(tx, user, 'create', 'recipe', row.id, { after: values });
      return row.id;
    });
  });
  if (!result.ok) return result;
  revalidatePath('/', 'layout');
  redirect(`/recipes/${result.data}`);
}

const recipePayload = z.object({
  id: uuid,
  version: z.number().int().positive(),
  name: z.string(),
  type: z.enum(['dish', 'prep']),
  yieldQuantity: z.string(),
  yieldUnit: unit.nullable(),
  yieldEstimated: z.boolean(),
  portions: z.string(),
  asNeeded: z.array(z.string().max(120)).max(40),
  notes: z.string().max(12000),
  lines: z
    .array(
      z.object({
        ingredientId: uuid.nullable(),
        subRecipeId: uuid.nullable(),
        quantity: z.string(),
        unit,
      }),
    )
    .max(200),
  /** Lines on screen still waiting for a quantity, not sent. */
  pendingLines: z.number().int().min(0).max(200).optional(),
});

export type RecipePayload = z.infer<typeof recipePayload>;

/** Who last saved a recipe, so "someone else changed it" can say who and when. */
export interface RecipeConflict {
  by: string;
  at: string;
  version: number;
}

/** Saves the whole recipe at once. Returns the new version, or an error (including "someone else changed it"). */
export async function saveRecipe(
  input: RecipePayload,
): Promise<ActionResult<{ version: number }> | { ok: false; error: string; conflict: RecipeConflict }> {
  const result = await mutate(async (user) => {
    const payload = parse(recipePayload, input, 'Recipe');
    const name = required(payload.name.trim(), 'Name');
    const portions = decimal(payload.portions.trim(), 'Portions', { min: 0, minExclusive: true })!;
    const yieldQuantity = decimal(payload.yieldQuantity.trim(), 'Batch yield', { min: 0, minExclusive: true, optional: true });
    if (payload.type === 'prep' && !yieldQuantity) throw new Invalid('A prep needs a batch yield, for example 2 l');
    const yieldUnit = yieldQuantity ? payload.yieldUnit : null;
    const asNeeded = [...new Set(payload.asNeeded.map((s) => s.trim()).filter(Boolean))];
    if (yieldQuantity && !yieldUnit) throw new Invalid('Choose a unit for the batch yield');

    const lines = payload.lines.map((line, index) => {
      if (!!line.ingredientId === !!line.subRecipeId) throw new Invalid(`Line ${index + 1} is broken, remove it and add it again`);
      return {
        recipeId: payload.id,
        ingredientId: line.ingredientId,
        subRecipeId: line.subRecipeId,
        quantity: decimal(line.quantity.trim(), `Line ${index + 1} quantity`, { min: 0, minExclusive: true })!,
        unit: line.unit,
        sortOrder: index,
      };
    });

    const usesPreps = lines.some((l) => l.subRecipeId);
    return db.transaction(async (tx) => {
      // Saves that add preps, or could turn a prep into a dish, change what uses what: one at a time.
      if (usesPreps || payload.type === 'dish') await lockRecipeGraph(tx);
      const [before] = await tx.select().from(schema.recipes).where(eq(schema.recipes.id, payload.id)).for('update');
      if (!before || before.archivedAt) throw new Invalid('Recipe not found');
      if (before.version !== payload.version) {
        const [last] = await tx
          .select({ by: schema.auditLog.actorEmail, at: schema.auditLog.at })
          .from(schema.auditLog)
          .where(and(eq(schema.auditLog.entity, 'recipe'), eq(schema.auditLog.entityId, payload.id)))
          .orderBy(desc(schema.auditLog.at))
          .limit(1);
        const conflict: RecipeConflict = { by: last?.by ?? 'someone', at: (last?.at ?? before.updatedAt).toISOString(), version: before.version };
        return { conflict };
      }

      const ingredientIds = [...new Set(lines.flatMap((l) => (l.ingredientId ? [l.ingredientId] : [])))];
      if (ingredientIds.length > 0) {
        const found = await tx
          .select({ id: schema.ingredients.id })
          .from(schema.ingredients)
          .where(and(inArray(schema.ingredients.id, ingredientIds), isNull(schema.ingredients.archivedAt)));
        if (found.length !== ingredientIds.length) throw new Invalid('An ingredient in this recipe no longer exists');
      }

      if (usesPreps) {
        const previous = await tx
          .select({ subRecipeId: schema.recipeLines.subRecipeId })
          .from(schema.recipeLines)
          .where(eq(schema.recipeLines.recipeId, payload.id));
        const previousSubIds = new Set(previous.flatMap((p) => (p.subRecipeId ? [p.subRecipeId] : [])));
        await assertPrepsUsable(tx, { id: payload.id, previousSubIds }, lines);
      }
      if (before.type === 'prep' && payload.type === 'dish') await assertCanStopBeingPrep(tx, payload.id);

      // If this recipe is used as a prep, the lines that use it must still match its yield unit.
      if (yieldUnit !== before.yieldUnit || !yieldQuantity) {
        const users = await tx
          .select({ name: schema.recipes.name, unit: schema.recipeLines.unit })
          .from(schema.recipeLines)
          .innerJoin(schema.recipes, eq(schema.recipes.id, schema.recipeLines.recipeId))
          .where(eq(schema.recipeLines.subRecipeId, payload.id));
        const clash = users.find((u) => !yieldUnit || UNITS[u.unit].base !== UNITS[yieldUnit].base);
        if (clash) throw new Invalid(`${clash.name} uses this in ${clash.unit}, so the batch yield must stay in a matching unit`);
      }

      const version = before.version + 1;
      const values = {
        name,
        type: payload.type,
        yieldQuantity,
        yieldUnit,
        yieldEstimated: !!yieldQuantity && payload.yieldEstimated,
        portions,
        asNeeded,
        notes: payload.notes.trim() || null,
        pendingLines: payload.pendingLines ?? 0,
      };
      await tx.update(schema.recipes).set({ ...values, updatedAt: new Date(), version }).where(eq(schema.recipes.id, payload.id));
      await tx.delete(schema.recipeLines).where(eq(schema.recipeLines.recipeId, payload.id));
      if (lines.length > 0) await tx.insert(schema.recipeLines).values(lines);
      await audit(tx, user, 'update', 'recipe', payload.id, { after: { ...values, lines: lines.length } });
      return { version };
    });
  });
  if (!result.ok) return result;
  const saved = result.data!;
  if ('conflict' in saved) return { ok: false, error: 'Someone else changed this recipe', conflict: saved.conflict };
  revalidatePath('/', 'layout');
  return { ok: true, data: { version: saved.version } };
}

export async function setRecipeArchived(id: string, archived: boolean): Promise<ActionResult<{ warning?: string }>> {
  const result = await mutate(async (user) => {
    parse(uuid, id, 'Recipe');
    return db.transaction(async (tx) => {
      if (archived) {
        const usedIn = await tx
          .selectDistinct({ name: schema.recipes.name })
          .from(schema.recipeLines)
          .innerJoin(schema.recipes, eq(schema.recipes.id, schema.recipeLines.recipeId))
          .where(and(eq(schema.recipeLines.subRecipeId, id), isNull(schema.recipes.archivedAt)));
        if (usedIn.length > 0) throw new Invalid(`Still used in: ${usedIn.map((r) => r.name).slice(0, 5).join(', ')}`);
        const onMenu = await openMenuItemsUsing(tx, id);
        if (onMenu.length > 0) throw new Invalid(`Still on the menu as: ${onMenu.slice(0, 5).join(', ')}`);
      }
      const updated = await tx
        .update(schema.recipes)
        .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date(), version: sql`${schema.recipes.version} + 1` })
        .where(eq(schema.recipes.id, id))
        .returning({ id: schema.recipes.id });
      if (updated.length === 0) throw new Invalid('Recipe not found');
      await audit(tx, user, archived ? 'archive' : 'restore', 'recipe', id);
      if (archived) return {};
      // Brought back, but what it uses may have gone to the trash in the meantime.
      const sub = alias(schema.recipes, 'sub');
      const gone = await tx
        .selectDistinct({ ingredient: schema.ingredients.name, prep: sub.name })
        .from(schema.recipeLines)
        .leftJoin(schema.ingredients, eq(schema.ingredients.id, schema.recipeLines.ingredientId))
        .leftJoin(sub, eq(sub.id, schema.recipeLines.subRecipeId))
        .where(and(eq(schema.recipeLines.recipeId, id), or(isNotNull(schema.ingredients.archivedAt), isNotNull(sub.archivedAt))));
      const names = gone.map((g) => g.ingredient ?? g.prep).filter(Boolean);
      return names.length > 0 ? { warning: `Restored, but it uses ${names.slice(0, 3).join(', ')} from the trash: restore those too, or replace them.` } : {};
    });
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

// --------------------------------------------------------------------- menu

function menuItemValues(form: FormData) {
  const recipeId = text(form, 'recipeId');
  const dollars = decimal(text(form, 'sellPrice'), 'Menu price', { min: 0, max: 100000, places: 2, money: true })!;
  // A $0 item reads as "no price" everywhere, so it has to be meant: an add-on or something included.
  if (new DecimalJs(dollars).isZero() && form.get('free') !== 'on') {
    throw new Invalid('The menu price is $0. If it really is free or included with another dish, tick "Free or included".');
  }
  return {
    name: required(text(form, 'name'), 'Name'),
    category: required(text(form, 'category'), 'Section', 60),
    sellPriceCents: new DecimalJs(dollars).times(100).toNumber(),
    recipeId: recipeId ? parse(uuid, recipeId, 'Recipe') : null,
  };
}

async function assertMenuOpen(tx: Tx, menuId: string) {
  const [menu] = await tx.select({ status: schema.menus.status }).from(schema.menus).where(eq(schema.menus.id, menuId));
  if (!menu || menu.status === 'archived') throw new Invalid('This menu is archived and can no longer be changed');
}

async function assertRecipeUsable(tx: Tx, recipeId: string | null) {
  if (!recipeId) return;
  const [recipe] = await tx.select().from(schema.recipes).where(eq(schema.recipes.id, recipeId));
  if (!recipe || recipe.archivedAt) throw new Invalid('That recipe no longer exists');
}

export async function createMenuItem(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await mutate(async (user) => {
    const menuId = parse(uuid, text(form, 'menuId'), 'Menu');
    const values = menuItemValues(form);
    await db.transaction(async (tx) => {
      const [menu] = await tx.select().from(schema.menus).where(eq(schema.menus.id, menuId));
      if (!menu || menu.archivedAt) throw new Invalid('Menu not found');
      if (menu.status === 'archived') throw new Invalid('This menu is archived and can no longer be changed');
      await assertRecipeUsable(tx, values.recipeId);
      const [{ next }] = await tx
        .select({ next: sql<number>`coalesce(max(${schema.menuItems.sortOrder}), -1)::int + 1` })
        .from(schema.menuItems)
        .where(eq(schema.menuItems.menuId, menuId));
      const [row] = await tx
        .insert(schema.menuItems)
        .values({ ...values, menuId, sortOrder: next })
        .returning({ id: schema.menuItems.id });
      await audit(tx, user, 'create', 'menu_item', row.id, { after: values });
    });
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function updateMenuItem(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await mutate(async (user) => {
    const id = parse(uuid, text(form, 'id'), 'Menu item');
    const version = parse(z.coerce.number().int().positive(), text(form, 'version'), 'Version');
    const values = menuItemValues(form);
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(schema.menuItems).where(eq(schema.menuItems.id, id)).for('update');
      if (!before || before.archivedAt) throw new Invalid('Menu item not found');
      if (before.version !== version) throw new Invalid('Someone else changed this item. Reload the page and try again.');
      await assertMenuOpen(tx, before.menuId);
      await assertRecipeUsable(tx, values.recipeId);
      await tx
        .update(schema.menuItems)
        .set({ ...values, updatedAt: new Date(), version: version + 1 })
        .where(eq(schema.menuItems.id, id));
      await audit(tx, user, 'update', 'menu_item', id, {
        before: { name: before.name, category: before.category, sellPriceCents: before.sellPriceCents, recipeId: before.recipeId },
        after: values,
      });
    });
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function setMenuItemArchived(id: string, archived: boolean): Promise<ActionResult> {
  const result = await mutate(async (user) => {
    parse(uuid, id, 'Menu item');
    await db.transaction(async (tx) => {
      const [item] = await tx.select({ menuId: schema.menuItems.menuId }).from(schema.menuItems).where(eq(schema.menuItems.id, id));
      if (!item) throw new Invalid('Menu item not found');
      await assertMenuOpen(tx, item.menuId);
      const updated = await tx
        .update(schema.menuItems)
        .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date(), version: sql`${schema.menuItems.version} + 1` })
        .where(eq(schema.menuItems.id, id))
        .returning({ id: schema.menuItems.id });
      if (updated.length === 0) throw new Invalid('Menu item not found');
      await audit(tx, user, archived ? 'archive' : 'restore', 'menu_item', id);
    });
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function updateSettings(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireRole('owner');
  const result = await mutate(async (user) => {
    const values = {
      targetFoodCostPct: decimal(text(form, 'targetFoodCostPct'), 'Target food cost %', { min: 0, minExclusive: true, max: 100, places: 2 })!,
      gstRegistered: form.get('gstRegistered') === 'on',
    };
    await db.transaction(async (tx) => {
      await tx
        .insert(schema.settings)
        .values({ id: 1, ...values })
        .onConflictDoUpdate({ target: schema.settings.id, set: { ...values, updatedAt: new Date() } });
      await audit(tx, user, 'update', 'settings', '1', { after: values });
    });
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

// -------------------------------------------------------------------- menus

/** Copies a menu and its items into a new draft, for the next season or a special. */
export async function cloneMenu(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await mutate(async (user) => {
    const sourceId = parse(uuid, text(form, 'sourceId'), 'Menu');
    const values = {
      name: required(text(form, 'name'), 'Name'),
      kind: parse(z.enum(['seasonal', 'special']), text(form, 'kind'), 'Kind'),
    };
    return db.transaction(async (tx) => {
      const [source] = await tx.select().from(schema.menus).where(eq(schema.menus.id, sourceId));
      if (!source) throw new Invalid('Menu not found');
      const clash = await tx
        .select({ id: schema.menus.id })
        .from(schema.menus)
        .where(sql`lower(${schema.menus.name}) = ${values.name.toLowerCase()}`);
      if (clash.length > 0) throw new Invalid('A menu with that name already exists');
      const [menu] = await tx.insert(schema.menus).values({ ...values, status: 'draft' }).returning({ id: schema.menus.id });
      const items = await tx
        .select()
        .from(schema.menuItems)
        .where(and(eq(schema.menuItems.menuId, sourceId), isNull(schema.menuItems.archivedAt)));
      // A recipe moved to the trash since is not carried over: the item shows as "no recipe linked" instead.
      const trashed = new Set(
        (await tx.select({ id: schema.recipes.id }).from(schema.recipes).where(sql`${schema.recipes.archivedAt} IS NOT NULL`)).map((r) => r.id),
      );
      if (items.length > 0) {
        await tx.insert(schema.menuItems).values(
          items.map((i) => ({
            menuId: menu.id,
            recipeId: i.recipeId && !trashed.has(i.recipeId) ? i.recipeId : null,
            name: i.name,
            category: i.category,
            sellPriceCents: i.sellPriceCents,
            sortOrder: i.sortOrder,
          })),
        );
      }
      await audit(tx, user, 'clone', 'menu', menu.id, { after: { ...values, from: source.name, items: items.length } });
      return menu.id;
    });
  });
  if (!result.ok) return result;
  revalidatePath('/', 'layout');
  redirect(`/menu?m=${result.data}`);
}

/**
 * Moves a menu between draft, live and archived. Only one seasonal menu is
 * live at a time: making another one live archives the old one. Archiving
 * freezes that day's costs so the record does not move with later prices.
 */
export async function setMenuStatus(id: string, status: 'draft' | 'live' | 'archived'): Promise<ActionResult> {
  const result = await mutate(async (user) => {
    parse(uuid, id, 'Menu');
    parse(z.enum(['draft', 'live', 'archived']), status, 'Status');
    const { costMenuItem } = await import('@/lib/menu');
    const { contextFrom, loadCostingData } = await import('@/lib/queries');
    const data = await loadCostingData();
    const ctx = contextFrom(data);

    await db.transaction(async (tx) => {
      const snapshot = async (menuId: string) => {
        const items = await tx
          .select()
          .from(schema.menuItems)
          .where(and(eq(schema.menuItems.menuId, menuId), isNull(schema.menuItems.archivedAt)))
          .orderBy(schema.menuItems.sortOrder);
        await tx.insert(schema.menuCostSnapshots).values({
          menuId,
          asOf: data.asOf,
          items: items.map((i) => {
            const costing = costMenuItem(
              { ...i, archived: false },
              ctx,
              data.settings,
            );
            return {
              name: i.name,
              category: i.category,
              sellPriceCents: i.sellPriceCents,
              cost: costing.status === 'ok' ? costing.cost.toFixed(4) : null,
              foodCostPct: costing.status === 'ok' && costing.foodCostPct ? costing.foodCostPct.toFixed(2) : null,
            };
          }),
        });
      };

      const [menu] = await tx.select().from(schema.menus).where(eq(schema.menus.id, id)).for('update');
      if (!menu) throw new Invalid('Menu not found');
      if (menu.status === status) return;
      // An archived menu's costs are frozen in its snapshot; it comes back as a draft to be checked first.
      if (menu.status === 'archived' && status === 'live') throw new Invalid('Reopen this menu as a draft first, check it, then make it live');

      if (status === 'live' && menu.kind === 'seasonal') {
        const current = await tx
          .select()
          .from(schema.menus)
          .where(and(eq(schema.menus.status, 'live'), eq(schema.menus.kind, 'seasonal')));
        for (const old of current) {
          await snapshot(old.id);
          await tx.update(schema.menus).set({ status: 'archived', updatedAt: new Date(), version: old.version + 1 }).where(eq(schema.menus.id, old.id));
          await audit(tx, user, 'status', 'menu', old.id, { before: { status: 'live' }, after: { name: old.name, status: 'archived', replacedBy: menu.name } });
        }
      }
      if (status === 'archived') await snapshot(id);
      await tx.update(schema.menus).set({ status, updatedAt: new Date(), version: menu.version + 1 }).where(eq(schema.menus.id, id));
      await audit(tx, user, 'status', 'menu', id, { before: { status: menu.status }, after: { name: menu.name, status } });
    });
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

// --------------------------------------------------------------------- team

/** Once there are two owners, there must always be two, so nobody can lock the business out. */
async function assertOwnersRemain(tx: Tx, losingOwnerId: string) {
  const owners = await tx.select({ id: schema.allowedUsers.id }).from(schema.allowedUsers).where(eq(schema.allowedUsers.role, 'owner')).for('update');
  const remaining = owners.filter((o) => o.id !== losingOwnerId).length;
  if (remaining < Math.min(2, owners.length)) {
    throw new Invalid(remaining === 0 ? 'There must always be an owner' : 'Keep at least two owners. Add another owner first.');
  }
}

async function endSessions(tx: Tx, email: string) {
  await tx.execute(sql`delete from "session" where user_id in (select id from "user" where lower(email) = ${email.toLowerCase()})`);
}

async function ownerMutate<T>(fn: (user: CurrentUser) => Promise<T>): Promise<ActionResult<T>> {
  await requireRole('owner');
  return mutate(fn);
}

export async function addTeamMember(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await ownerMutate(async (user) => {
    const email = parse(z.email(), text(form, 'email').toLowerCase(), 'Email');
    const values = {
      email,
      name: text(form, 'name').slice(0, 80) || null,
      role: parse(z.enum(['owner', 'chef', 'staff']), text(form, 'role'), 'Role'),
    };
    await db.transaction(async (tx) => {
      const existing = await tx.select().from(schema.allowedUsers).where(sql`lower(${schema.allowedUsers.email}) = ${email}`);
      if (existing.length > 0) throw new Invalid('That email already has access');
      const [row] = await tx.insert(schema.allowedUsers).values(values).returning({ id: schema.allowedUsers.id });
      await audit(tx, user, 'create', 'team', row.id, { after: values });
    });
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

export async function setTeamRole(id: string, role: 'owner' | 'chef' | 'staff'): Promise<ActionResult> {
  const result = await ownerMutate(async (user) => {
    parse(uuid, id, 'Person');
    parse(z.enum(['owner', 'chef', 'staff']), role, 'Role');
    await db.transaction(async (tx) => {
      const [member] = await tx.select().from(schema.allowedUsers).where(eq(schema.allowedUsers.id, id)).for('update');
      if (!member) throw new Invalid('Person not found');
      if (member.role === role) return;
      if (member.email.toLowerCase() === user.email.toLowerCase()) throw new Invalid('You cannot change your own role. Ask another owner.');
      if (member.role === 'owner') await assertOwnersRemain(tx, id);
      await tx.update(schema.allowedUsers).set({ role }).where(eq(schema.allowedUsers.id, id));
      await audit(tx, user, 'role', 'team', id, { before: { role: member.role }, after: { email: member.email, role } });
    });
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}

/** Removes access and signs the person out everywhere straight away. */
export async function removeTeamMember(id: string): Promise<ActionResult> {
  const result = await ownerMutate(async (user) => {
    parse(uuid, id, 'Person');
    await db.transaction(async (tx) => {
      const [member] = await tx.select().from(schema.allowedUsers).where(eq(schema.allowedUsers.id, id)).for('update');
      if (!member) throw new Invalid('Person not found');
      if (member.email.toLowerCase() === user.email.toLowerCase()) throw new Invalid('You cannot remove yourself. Ask another owner.');
      if (member.role === 'owner') await assertOwnersRemain(tx, id);
      await tx.delete(schema.allowedUsers).where(eq(schema.allowedUsers.id, id));
      await endSessions(tx, member.email);
      await audit(tx, user, 'remove', 'team', id, { before: { email: member.email, role: member.role } });
    });
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
