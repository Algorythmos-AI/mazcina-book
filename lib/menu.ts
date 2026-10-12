import DecimalJs from 'decimal.js';
import { costRecipe, menuMetrics, suggestedSellPriceCents, type CostingContext, type Decimal, type Issue } from './costing';
import { MENU_CATEGORIES, type MenuItemDto, type SettingsDto } from './types';

export type ItemCosting =
  | { status: 'uncosted' }
  | { status: 'incomplete'; issues: Issue[] }
  | {
      status: 'ok';
      cost: Decimal;
      foodCostPct: Decimal | null;
      grossProfit: Decimal;
      suggestedCents: number | null;
      /** How the food cost % sits against the target. */
      rating: 'good' | 'watch' | 'high' | 'none';
    };

/** Points above target that still count as "watch" rather than "high". */
const WATCH_BAND = 5;

export function costMenuItem(item: MenuItemDto, ctx: CostingContext, settings: SettingsDto): ItemCosting {
  if (!item.recipeId) return { status: 'uncosted' };
  const recipe = costRecipe(item.recipeId, ctx);
  if (recipe.status !== 'ok') return { status: 'incomplete', issues: recipe.issues };
  const metrics = menuMetrics(recipe.costPerPortion, item.sellPriceCents, settings.gstRegistered);
  const target = new DecimalJs(settings.targetFoodCostPct);
  const pct = metrics.foodCostPct;
  return {
    status: 'ok',
    cost: recipe.costPerPortion,
    foodCostPct: pct,
    grossProfit: metrics.grossProfit,
    suggestedCents: suggestedSellPriceCents(recipe.costPerPortion, settings.targetFoodCostPct, settings.gstRegistered),
    rating: !pct ? 'none' : pct.lte(target) ? 'good' : pct.lte(target.plus(WATCH_BAND)) ? 'watch' : 'high',
  };
}

export function groupByCategory<T extends { category: string }>(items: T[]): [string, T[]][] {
  const order = (category: string) => {
    const index = (MENU_CATEGORIES as readonly string[]).indexOf(category);
    return index === -1 ? MENU_CATEGORIES.length : index;
  };
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
  return [...groups.entries()].sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]));
}
