import 'server-only';
import { asc, desc, eq, isNull } from 'drizzle-orm';
import { cache } from 'react';
import { db, schema } from '@/db';
import { createContext, type CostingContext } from './costing';
import { todaySydney } from './format';
import type { CostingData, MenuDto, RecipeDto } from './types';

/**
 * Everything the costing engine needs, in one round of queries. The data set is
 * small (hundreds of rows), so every screen loads it whole and costs in memory.
 * Archived rows are included so a recipe still pointing at one is flagged, not
 * silently costed.
 */
export const loadCostingData = cache(async (): Promise<CostingData> => {
  const [suppliers, ingredients, prices, recipes, lines, settingsRows] = await Promise.all([
    db.select().from(schema.suppliers).orderBy(asc(schema.suppliers.name)),
    db.select().from(schema.ingredients).orderBy(asc(schema.ingredients.name)),
    db
      .select()
      .from(schema.ingredientPrices)
      .orderBy(asc(schema.ingredientPrices.effectiveDate), asc(schema.ingredientPrices.createdAt)),
    db.select().from(schema.recipes).orderBy(asc(schema.recipes.name)),
    db.select().from(schema.recipeLines).orderBy(asc(schema.recipeLines.sortOrder), asc(schema.recipeLines.createdAt)),
    db.select().from(schema.settings).limit(1),
  ]);

  const linesByRecipe = new Map<string, RecipeDto['lines']>();
  for (const line of lines) {
    const list = linesByRecipe.get(line.recipeId) ?? [];
    list.push({
      id: line.id,
      ingredientId: line.ingredientId,
      subRecipeId: line.subRecipeId,
      quantity: line.quantity,
      unit: line.unit,
    });
    linesByRecipe.set(line.recipeId, list);
  }

  return {
    asOf: todaySydney(),
    settings: {
      gstRegistered: settingsRows[0]?.gstRegistered ?? true,
      targetFoodCostPct: settingsRows[0]?.targetFoodCostPct ?? '30',
    },
    suppliers: suppliers.map((s) => ({ id: s.id, name: s.name, contact: s.contact, archived: !!s.archivedAt })),
    ingredients: ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      baseUnit: i.baseUnit,
      yieldPct: i.yieldPct,
      preferredSupplierId: i.preferredSupplierId,
      gramsPerEach: i.gramsPerEach,
      gramsPerMl: i.gramsPerMl,
      version: i.version,
      archived: !!i.archivedAt,
    })),
    prices: prices.map((p) => ({
      id: p.id,
      ingredientId: p.ingredientId,
      supplierId: p.supplierId,
      packSize: p.packSize,
      packUnit: p.packUnit,
      packPrice: p.packPrice,
      priceIncludesGst: p.priceIncludesGst,
      gstApplicable: p.gstApplicable,
      effectiveDate: p.effectiveDate,
      createdBy: p.createdBy,
    })),
    recipes: recipes.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      yieldQuantity: r.yieldQuantity,
      yieldUnit: r.yieldUnit,
      portions: r.portions,
      notes: r.notes,
      version: r.version,
      archived: !!r.archivedAt,
      lines: linesByRecipe.get(r.id) ?? [],
    })),
  };
});

export function contextFrom(data: CostingData): CostingContext {
  return createContext({ ingredients: data.ingredients, recipes: data.recipes, prices: data.prices, asOf: data.asOf });
}

export const loadMenus = cache(async (): Promise<MenuDto[]> => {
  const [menus, items] = await Promise.all([
    db.select().from(schema.menus).where(isNull(schema.menus.archivedAt)).orderBy(asc(schema.menus.createdAt)),
    db.select().from(schema.menuItems).orderBy(asc(schema.menuItems.sortOrder), asc(schema.menuItems.name)),
  ]);
  return menus.map((m) => ({
    id: m.id,
    name: m.name,
    kind: m.kind,
    status: m.status,
    items: items
      .filter((i) => i.menuId === m.id)
      .map((i) => ({
        id: i.id,
        menuId: i.menuId,
        recipeId: i.recipeId,
        name: i.name,
        category: i.category,
        sellPriceCents: i.sellPriceCents,
        sortOrder: i.sortOrder,
        version: i.version,
        archived: !!i.archivedAt,
      })),
  }));
});

export interface SnapshotItem {
  name: string;
  category: string;
  sellPriceCents: number;
  cost: string | null;
  foodCostPct: string | null;
}

/** The costs frozen when a menu was archived, newest first. */
export async function loadSnapshot(menuId: string): Promise<{ asOf: string; items: SnapshotItem[] } | null> {
  const [row] = await db
    .select()
    .from(schema.menuCostSnapshots)
    .where(eq(schema.menuCostSnapshots.menuId, menuId))
    .orderBy(desc(schema.menuCostSnapshots.takenAt))
    .limit(1);
  return row ? { asOf: row.asOf, items: row.items as SnapshotItem[] } : null;
}

export async function loadTeam() {
  return db.select().from(schema.allowedUsers).orderBy(asc(schema.allowedUsers.createdAt));
}

export async function loadActivity(limit = 100) {
  return db.select().from(schema.auditLog).orderBy(desc(schema.auditLog.at)).limit(limit);
}
