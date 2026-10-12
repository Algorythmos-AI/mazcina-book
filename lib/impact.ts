import { costRecipe, createContext, ingredientUnitCost, menuMetrics, type Decimal } from './costing';
import type { CostingData, MenuItemDto } from './types';

export interface IngredientChange {
  id: string;
  name: string;
  baseUnit: CostingData['ingredients'][number]['baseUnit'];
  before: Decimal | null;
  after: Decimal;
  changePct: Decimal | null;
}

export interface DishChange {
  recipeId: string;
  name: string;
  before: Decimal;
  after: Decimal;
  delta: Decimal;
  /** Menu items using this recipe, with food cost % before and after. */
  menuItems: { id: string; name: string; sellPriceCents: number; beforePct: Decimal | null; afterPct: Decimal | null }[];
}

/** "2026-10-13" minus one day, as a calendar date. */
export function dayBefore(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function daysAgo(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/**
 * What supplier price changes since `since` did to costs: today's recipes
 * costed with the prices in force the day before `since`, against today's
 * prices. Recipes themselves are compared as they are now, so this isolates
 * the effect of prices.
 */
export function priceImpact(data: CostingData, menuItems: MenuItemDto[], since: string) {
  const base = { ingredients: data.ingredients, recipes: data.recipes, prices: data.prices };
  const then = createContext({ ...base, asOf: dayBefore(since) });
  const now = createContext({ ...base, asOf: data.asOf });

  const ingredients: IngredientChange[] = [];
  for (const ingredient of data.ingredients) {
    if (ingredient.archived) continue;
    const after = ingredientUnitCost(ingredient.id, now);
    if (!after.ok) continue;
    const before = ingredientUnitCost(ingredient.id, then);
    if (before.ok && before.value.eq(after.value)) continue;
    ingredients.push({
      id: ingredient.id,
      name: ingredient.name,
      baseUnit: ingredient.baseUnit,
      before: before.ok ? before.value : null,
      after: after.value,
      changePct: before.ok && before.value.gt(0) ? after.value.minus(before.value).div(before.value).times(100) : null,
    });
  }

  const dishes: DishChange[] = [];
  for (const recipe of data.recipes) {
    if (recipe.archived) continue;
    const before = costRecipe(recipe.id, then);
    const after = costRecipe(recipe.id, now);
    if (before.status !== 'ok' || after.status !== 'ok' || before.costPerPortion.eq(after.costPerPortion)) continue;
    dishes.push({
      recipeId: recipe.id,
      name: recipe.name,
      before: before.costPerPortion,
      after: after.costPerPortion,
      delta: after.costPerPortion.minus(before.costPerPortion),
      menuItems: menuItems
        .filter((item) => item.recipeId === recipe.id && !item.archived)
        .map((item) => ({
          id: item.id,
          name: item.name,
          sellPriceCents: item.sellPriceCents,
          beforePct: menuMetrics(before.costPerPortion, item.sellPriceCents, data.settings.gstRegistered).foodCostPct,
          afterPct: menuMetrics(after.costPerPortion, item.sellPriceCents, data.settings.gstRegistered).foodCostPct,
        })),
    });
  }

  ingredients.sort((a, b) => (b.changePct?.abs().toNumber() ?? Infinity) - (a.changePct?.abs().toNumber() ?? Infinity));
  dishes.sort((a, b) => b.delta.abs().cmp(a.delta.abs()));
  return { ingredients, dishes };
}
