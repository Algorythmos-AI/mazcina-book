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
      /** Preps whose yield is still an estimate; non-empty means the cost is an estimate too. */
      estimates: string[];
      /** Ingredients used as needed that the cost leaves out; non-empty means the cost reads slightly low. */
      asNeeded: string[];
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
    estimates: recipe.estimates,
    asNeeded: recipe.asNeeded,
  };
}

/**
 * The problems that stop a recipe being costed, traced down through every prep
 * it uses: "Chimichurri is incomplete" becomes "Parsley has no price". Each
 * problem is listed once, however many routes lead to it.
 */
export function rootIssues(recipeId: string, ctx: CostingContext): Issue[] {
  const found = new Map<string, Issue>();
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const cost = costRecipe(id, ctx);
    if (cost.status === 'ok') return;
    const recipe = ctx.recipes.get(id);
    for (const issue of cost.issues) {
      const line = issue.lineId ? recipe?.lines.find((l) => l.id === issue.lineId) : undefined;
      if (issue.code === 'sub_recipe_incomplete' && line?.subRecipeId) {
        walk(line.subRecipeId);
        continue;
      }
      // Problems with a line are about the ingredient; anything else is about the recipe itself.
      const subject = issue.subject ?? recipe?.name;
      found.set(`${issue.code}|${line?.ingredientId ?? line?.subRecipeId ?? id}`, { code: issue.code, subject });
    }
  };
  walk(recipeId);
  return [...found.values()];
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
