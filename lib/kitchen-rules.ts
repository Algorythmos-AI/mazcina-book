/**
 * Checks that keep the kitchen's records consistent, run inside the save's
 * transaction. They live here rather than in the server actions so the
 * database tests can call them directly.
 */
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { longestChainThrough, MAX_DEPTH, wouldCreateCycle, UNITS, type Unit } from '@/lib/costing';
import { Invalid } from '@/lib/invalid';
import { formatStock } from '@/lib/stock';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Stock and the minimum level are stored in the ingredient's own unit, so
 * changing grams to pieces would make 6000 g read as 6000 eggs. Refuses the
 * change while anything is stored in the old unit.
 */
export async function assertUnitCanChange(
  tx: Tx,
  ingredient: { id: string; name: string; baseUnit: 'g' | 'ml' | 'each'; parLevel: string | null },
) {
  const [{ lines }] = await tx
    .select({ lines: sql<number>`count(*)::int` })
    .from(schema.recipeLines)
    .where(eq(schema.recipeLines.ingredientId, ingredient.id));
  if (lines > 0) throw new Invalid('This ingredient is used in recipes, so how it is measured cannot change. Add a conversion instead.');
  const [{ onHand }] = await tx
    .select({ onHand: sql<string>`coalesce(sum(${schema.stockMovements.quantityDelta}), 0)::text` })
    .from(schema.stockMovements)
    .where(eq(schema.stockMovements.ingredientId, ingredient.id));
  if (Number(onHand) !== 0) {
    throw new Invalid(
      `${ingredient.name} has ${formatStock(onHand, ingredient.baseUnit)} in stock, recorded in ${ingredient.baseUnit}. Count it as 0 first, or make a new ingredient.`,
    );
  }
  if (ingredient.parLevel !== null && Number(ingredient.parLevel) > 0) {
    throw new Invalid(`${ingredient.name} has a minimum stock level in ${ingredient.baseUnit}. Clear the minimum first, then change how it is measured.`);
  }
}

/** Names of menu items that still use this recipe on a menu that is not archived. */
export async function openMenuItemsUsing(tx: Tx, recipeId: string): Promise<string[]> {
  const rows = await tx
    .select({ name: schema.menuItems.name })
    .from(schema.menuItems)
    .innerJoin(schema.menus, eq(schema.menus.id, schema.menuItems.menuId))
    .where(and(eq(schema.menuItems.recipeId, recipeId), isNull(schema.menuItems.archivedAt), ne(schema.menus.status, 'archived')));
  return rows.map((r) => r.name);
}

/**
 * Serialises recipe saves that touch preps. Without it two people could each
 * put the other's prep inside their own in the same moment, and both cycle
 * checks would pass. Must be the first thing the transaction does.
 */
export async function lockRecipeGraph(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('mazcina:recipe-graph'))`);
}

export interface SavedLine {
  ingredientId: string | null;
  subRecipeId: string | null;
  unit: Unit;
}

/**
 * Checks the preps a recipe is about to use: they exist, are preps, have a
 * yield in a matching unit, and do not make a loop or a chain too deep to
 * cost. Lines that were already saved before are let through even if they
 * point at a dish, so older recipes keep saving.
 */
export async function assertPrepsUsable(
  tx: Tx,
  recipe: { id: string; previousSubIds: Set<string> },
  lines: SavedLine[],
) {
  const subIds = [...new Set(lines.flatMap((l) => (l.subRecipeId ? [l.subRecipeId] : [])))];
  if (subIds.length === 0) return;

  const all = await tx
    .select({ recipeId: schema.recipeLines.recipeId, subRecipeId: schema.recipeLines.subRecipeId })
    .from(schema.recipeLines)
    .innerJoin(schema.recipes, eq(schema.recipes.id, schema.recipeLines.recipeId))
    .where(isNull(schema.recipes.archivedAt));
  const uses = new Map<string, string[]>();
  for (const edge of all) {
    if (edge.recipeId === recipe.id || !edge.subRecipeId) continue;
    uses.set(edge.recipeId, [...(uses.get(edge.recipeId) ?? []), edge.subRecipeId]);
  }
  const graph = new Map([...uses].map(([id, subs]) => [id, { lines: subs.map((subRecipeId) => ({ subRecipeId })) }]));

  const subs = await tx
    .select()
    .from(schema.recipes)
    .where(and(inArray(schema.recipes.id, subIds), isNull(schema.recipes.archivedAt)));
  if (subs.length !== subIds.length) throw new Invalid('A prep in this recipe no longer exists');
  for (const sub of subs) {
    if (sub.type !== 'prep' && !recipe.previousSubIds.has(sub.id)) {
      throw new Invalid(`${sub.name} is a dish, not a prep. Only preps can go inside another recipe.`);
    }
    if (wouldCreateCycle(graph, recipe.id, sub.id)) throw new Invalid(`${sub.name} already contains this recipe, so it cannot go inside it`);
    if (!sub.yieldUnit) throw new Invalid(`${sub.name} needs a batch yield before it can be used`);
    for (const line of lines.filter((l) => l.subRecipeId === sub.id)) {
      if (UNITS[line.unit].base !== UNITS[sub.yieldUnit].base) {
        throw new Invalid(`${sub.name} is made in ${sub.yieldUnit}, so use a matching unit`);
      }
    }
  }
  uses.set(recipe.id, subIds);
  if (longestChainThrough(uses, recipe.id) > MAX_DEPTH) {
    throw new Invalid(`Too many preps inside preps: a dish can go at most ${MAX_DEPTH} recipes deep. Use the ingredients directly in one of them.`);
  }
}

/** A prep that other live recipes use cannot become a dish: their lines would point at a dish. */
export async function assertCanStopBeingPrep(tx: Tx, recipeId: string) {
  const users = await tx
    .selectDistinct({ name: schema.recipes.name })
    .from(schema.recipeLines)
    .innerJoin(schema.recipes, eq(schema.recipes.id, schema.recipeLines.recipeId))
    .where(and(eq(schema.recipeLines.subRecipeId, recipeId), isNull(schema.recipes.archivedAt)));
  if (users.length > 0) {
    throw new Invalid(`This prep is used in ${users.map((u) => u.name).slice(0, 5).join(', ')}, so it has to stay a prep`);
  }
}
