import DecimalJs from 'decimal.js';
import { costRecipe, menuMetrics, suggestedSellPriceCents, type CostingContext, type Decimal, type Issue } from './costing';
import { matchKey } from './price-import';
import { MENU_CATEGORIES, type MenuItemDto, type SettingsDto } from './types';

export type ItemCosting =
  | { status: 'uncosted' }
  | {
      status: 'incomplete';
      issues: Issue[];
      /** The same problems traced down through preps (see rootIssues): what someone actually has to fix. */
      blockers: Issue[];
    }
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
  if (recipe.status !== 'ok') return { status: 'incomplete', issues: recipe.issues, blockers: rootIssues(item.recipeId, ctx) };
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

/** Fewest dishes, and smallest share of the menu's dishes, that an average food cost is shown for. */
export const MIN_DISHES_FOR_AVERAGE = 5;
export const MIN_SHARE_FOR_AVERAGE = 0.5;

const ADD_ONS = matchKey('Add-ons');

export interface MenuSummary {
  /** Fully costed items, add-ons included. */
  costed: number;
  incomplete: number;
  unlinked: number;
  watch: number;
  high: number;
  /** Items with "as needed" ingredients left out of their cost. */
  partial: number;
  /** Dishes the average is about: priced, not add-ons. */
  dishes: number;
  /** Of those, the ones fully costed. */
  dishesCosted: number;
  /** null until enough dishes are costed for one number to stand for the menu. */
  average: Decimal | null;
}

/**
 * Headline numbers for a menu. Add-ons are left out of the average (a $2
 * extra is not a dish), and the average is withheld until at least
 * MIN_DISHES_FOR_AVERAGE dishes and MIN_SHARE_FOR_AVERAGE of all dishes are
 * costed, so one cheap item can never stand in for the whole menu.
 */
export function menuSummary(rows: { item: Pick<MenuItemDto, 'category' | 'sellPriceCents'>; costing: ItemCosting }[]): MenuSummary {
  const costed = rows.flatMap((r) => (r.costing.status === 'ok' ? [r.costing] : []));
  const dishes = rows.filter((r) => r.item.sellPriceCents > 0 && matchKey(r.item.category) !== ADD_ONS);
  const pcts = dishes.flatMap((r) => (r.costing.status === 'ok' && r.costing.foodCostPct ? [r.costing.foodCostPct] : []));
  const enough = pcts.length >= MIN_DISHES_FOR_AVERAGE && pcts.length >= dishes.length * MIN_SHARE_FOR_AVERAGE;
  return {
    costed: costed.length,
    incomplete: rows.filter((r) => r.costing.status === 'incomplete').length,
    unlinked: rows.filter((r) => r.costing.status === 'uncosted').length,
    watch: costed.filter((c) => c.rating === 'watch').length,
    high: costed.filter((c) => c.rating === 'high').length,
    partial: costed.filter((c) => c.asNeeded.length > 0).length,
    dishes: dishes.length,
    dishesCosted: pcts.length,
    average: enough ? pcts.reduce((sum, pct) => sum.plus(pct), new DecimalJs(0)).div(pcts.length) : null,
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
