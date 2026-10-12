/**
 * Recipe costing. Pure functions only: no database, no clock, no floating point.
 *
 * Every cost is derived on read from the price list as it stood on `asOf`, so a
 * supplier price change flows through to every dish that uses the ingredient.
 * When a dish cannot be costed exactly (missing price, missing conversion,
 * archived ingredient, ...) it is reported as `incomplete` with the reasons and
 * carries NO cost figure. An understated cost is worse than no cost.
 */
import DecimalJs from 'decimal.js';

const D = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP });
export type Decimal = InstanceType<typeof D>;
type Numeric = string | number | Decimal;

export const GST_RATE = new D('0.1');
const GST_DIVISOR = GST_RATE.plus(1);
const MAX_DEPTH = 8;

export type Unit = 'g' | 'kg' | 'ml' | 'l' | 'each';
export type BaseUnit = 'g' | 'ml' | 'each';

const UNITS: Record<Unit, { base: BaseUnit; factor: Decimal }> = {
  g: { base: 'g', factor: new D(1) },
  kg: { base: 'g', factor: new D(1000) },
  ml: { base: 'ml', factor: new D(1) },
  l: { base: 'ml', factor: new D(1000) },
  each: { base: 'each', factor: new D(1) },
};

export interface Ingredient {
  id: string;
  name: string;
  baseUnit: BaseUnit;
  /** Usable share of what is bought, 1 to 100. */
  yieldPct: Numeric;
  preferredSupplierId?: string | null;
  /** Needed to convert between `each` and weight. */
  gramsPerEach?: Numeric | null;
  /** Density, needed to convert between volume and weight. */
  gramsPerMl?: Numeric | null;
  archived?: boolean;
}

export interface IngredientPrice {
  ingredientId: string;
  supplierId: string;
  packSize: Numeric;
  packUnit: Unit;
  /** As printed on the supplier's list. */
  packPrice: Numeric;
  priceIncludesGst: boolean;
  /** Most fresh food is GST-free; most packaged goods and drinks are not. */
  gstApplicable: boolean;
  /** ISO date, `YYYY-MM-DD`, in Australia/Sydney. */
  effectiveDate: string;
}

export interface RecipeLine {
  id: string;
  /** Exactly one of `ingredientId` / `subRecipeId` is set. */
  ingredientId?: string | null;
  subRecipeId?: string | null;
  /** Prepared, usable quantity. */
  quantity: Numeric;
  unit: Unit;
}

export interface Recipe {
  id: string;
  name: string;
  /** What one batch makes, e.g. 2 l of sauce. Required for a recipe used as a sub-recipe. */
  yieldQuantity?: Numeric | null;
  yieldUnit?: Unit | null;
  portions: Numeric;
  lines: RecipeLine[];
  archived?: boolean;
}

export type IssueCode =
  | 'no_lines'
  | 'invalid_line'
  | 'invalid_quantity'
  | 'invalid_portions'
  | 'invalid_yield'
  | 'invalid_price'
  | 'missing_ingredient'
  | 'archived_ingredient'
  | 'no_price'
  | 'needs_conversion'
  | 'missing_recipe'
  | 'archived_recipe'
  | 'sub_recipe_incomplete'
  | 'sub_recipe_no_yield'
  | 'cycle'
  | 'too_deep';

export interface Issue {
  code: IssueCode;
  lineId?: string;
  /** Name of the ingredient or recipe involved, for display. */
  subject?: string;
}

export interface LineCost {
  lineId: string;
  /** null when this line could not be costed. */
  cost: Decimal | null;
}

export type RecipeCost =
  | {
      status: 'ok';
      batchCost: Decimal;
      costPerPortion: Decimal;
      /** Cost per base unit (g, ml or each) of yield; null when the recipe has no yield set. */
      costPerYieldUnit: Decimal | null;
      lines: LineCost[];
    }
  | { status: 'incomplete'; issues: Issue[]; lines: LineCost[] };

export interface CostingContext {
  ingredients: Map<string, Ingredient>;
  recipes: Map<string, Recipe>;
  pricesByIngredient: Map<string, IngredientPrice[]>;
  asOf: string;
  memo: Map<string, RecipeCost>;
}

export function createContext(input: {
  ingredients: Ingredient[];
  recipes: Recipe[];
  prices: IngredientPrice[];
  /** ISO date; prices dated after this are ignored. */
  asOf: string;
}): CostingContext {
  const pricesByIngredient = new Map<string, IngredientPrice[]>();
  for (const price of input.prices) {
    const list = pricesByIngredient.get(price.ingredientId);
    if (list) list.push(price);
    else pricesByIngredient.set(price.ingredientId, [price]);
  }
  return {
    ingredients: new Map(input.ingredients.map((i) => [i.id, i])),
    recipes: new Map(input.recipes.map((r) => [r.id, r])),
    pricesByIngredient,
    asOf: input.asOf,
    memo: new Map(),
  };
}

function dec(value: Numeric | null | undefined): Decimal | null {
  if (value === null || value === undefined || value === '') return null;
  try {
    const d = new D(value);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

function positive(value: Numeric | null | undefined): Decimal | null {
  const d = dec(value);
  return d && d.gt(0) ? d : null;
}

/**
 * Convert a quantity into the given base unit. Same-dimension conversions are
 * exact; crossing between weight, volume and count goes through grams using the
 * ingredient's own factors and returns null when a needed factor is missing.
 */
export function convertToBase(
  quantity: Numeric,
  unit: Unit,
  target: BaseUnit,
  factors?: Pick<Ingredient, 'gramsPerEach' | 'gramsPerMl'>,
): Decimal | null {
  const qty = dec(quantity);
  if (!qty) return null;
  const from = UNITS[unit];
  const inBase = qty.times(from.factor);
  if (from.base === target) return inBase;

  const perGram = (base: BaseUnit): Decimal | null => {
    if (base === 'g') return new D(1);
    return positive(base === 'each' ? factors?.gramsPerEach : factors?.gramsPerMl);
  };
  const fromGrams = perGram(from.base);
  const toGrams = perGram(target);
  if (!fromGrams || !toGrams) return null;
  return inBase.times(fromGrams).div(toGrams);
}

/**
 * The price in force on `asOf`: the preferred supplier's most recent price, or
 * failing that the most recent from any supplier. Future-dated prices are
 * ignored. Among prices with the same date, the one listed last wins.
 */
export function selectPrice(
  prices: IngredientPrice[],
  preferredSupplierId: string | null | undefined,
  asOf: string,
): IngredientPrice | null {
  const latest = (candidates: IngredientPrice[]): IngredientPrice | null => {
    let best: IngredientPrice | null = null;
    for (const p of candidates) {
      if (p.effectiveDate > asOf) continue;
      if (!best || p.effectiveDate >= best.effectiveDate) best = p;
    }
    return best;
  };
  if (preferredSupplierId) {
    const preferred = latest(prices.filter((p) => p.supplierId === preferredSupplierId));
    if (preferred) return preferred;
  }
  return latest(prices);
}

/** Pack price with GST removed. Only divides when the price both includes GST and attracts it. */
export function packPriceExGst(price: IngredientPrice): Decimal | null {
  const amount = dec(price.packPrice);
  if (!amount || amount.lt(0)) return null;
  return price.priceIncludesGst && price.gstApplicable ? amount.div(GST_DIVISOR) : amount;
}

type Partial_<T> = { ok: true; value: T } | { ok: false; issue: Issue };

/** Cost ex GST of one base unit (1 g, 1 ml or 1 each) of the ingredient as bought. */
function unitCost(ingredient: Ingredient, ctx: CostingContext): Partial_<Decimal> {
  const subject = ingredient.name;
  const price = selectPrice(
    ctx.pricesByIngredient.get(ingredient.id) ?? [],
    ingredient.preferredSupplierId,
    ctx.asOf,
  );
  if (!price) return { ok: false, issue: { code: 'no_price', subject } };
  const exGst = packPriceExGst(price);
  if (!exGst || !positive(price.packSize)) {
    return { ok: false, issue: { code: 'invalid_price', subject } };
  }
  const packInBase = convertToBase(price.packSize, price.packUnit, ingredient.baseUnit, ingredient);
  if (!packInBase || packInBase.lte(0)) {
    return { ok: false, issue: { code: 'needs_conversion', subject } };
  }
  return { ok: true, value: exGst.div(packInBase) };
}

function costIngredientLine(line: RecipeLine, qty: Decimal, ctx: CostingContext): Partial_<Decimal> {
  const ingredient = ctx.ingredients.get(line.ingredientId!);
  if (!ingredient) return { ok: false, issue: { code: 'missing_ingredient' } };
  const subject = ingredient.name;
  if (ingredient.archived) return { ok: false, issue: { code: 'archived_ingredient', subject } };

  const yieldPct = dec(ingredient.yieldPct);
  if (!yieldPct || yieldPct.lte(0) || yieldPct.gt(100)) {
    return { ok: false, issue: { code: 'invalid_yield', subject } };
  }
  const qtyInBase = convertToBase(qty, line.unit, ingredient.baseUnit, ingredient);
  if (!qtyInBase) return { ok: false, issue: { code: 'needs_conversion', subject } };

  const cost = unitCost(ingredient, ctx);
  if (!cost.ok) return cost;
  return { ok: true, value: qtyInBase.times(cost.value).div(yieldPct.div(100)) };
}

function costSubRecipeLine(
  line: RecipeLine,
  qty: Decimal,
  ctx: CostingContext,
  path: string[],
): Partial_<Decimal> {
  const sub = ctx.recipes.get(line.subRecipeId!);
  if (!sub) return { ok: false, issue: { code: 'missing_recipe' } };
  const subject = sub.name;
  if (sub.archived) return { ok: false, issue: { code: 'archived_recipe', subject } };
  if (path.includes(sub.id)) return { ok: false, issue: { code: 'cycle', subject } };
  if (path.length >= MAX_DEPTH) return { ok: false, issue: { code: 'too_deep', subject } };

  const yieldQty = positive(sub.yieldQuantity);
  if (!yieldQty || !sub.yieldUnit) return { ok: false, issue: { code: 'sub_recipe_no_yield', subject } };
  const yieldBase = UNITS[sub.yieldUnit].base;
  // A prep has no density of its own, so the line must be in the prep's own dimension.
  const qtyInBase = convertToBase(qty, line.unit, yieldBase);
  if (!qtyInBase) return { ok: false, issue: { code: 'needs_conversion', subject } };

  const subCost = costRecipeInner(sub, ctx, path);
  if (subCost.status !== 'ok' || !subCost.costPerYieldUnit) {
    return { ok: false, issue: { code: 'sub_recipe_incomplete', subject } };
  }
  return { ok: true, value: qtyInBase.times(subCost.costPerYieldUnit) };
}

function costRecipeInner(recipe: Recipe, ctx: CostingContext, path: string[]): RecipeCost {
  const cached = ctx.memo.get(recipe.id);
  if (cached) return cached;

  const here = [...path, recipe.id];
  const issues: Issue[] = [];
  const lines: LineCost[] = [];
  let total = new D(0);

  if (recipe.lines.length === 0) issues.push({ code: 'no_lines' });

  for (const line of recipe.lines) {
    let result: Partial_<Decimal>;
    const qty = positive(line.quantity);
    if (!!line.ingredientId === !!line.subRecipeId) {
      result = { ok: false, issue: { code: 'invalid_line' } };
    } else if (!qty) {
      result = { ok: false, issue: { code: 'invalid_quantity' } };
    } else if (line.ingredientId) {
      result = costIngredientLine(line, qty, ctx);
    } else {
      result = costSubRecipeLine(line, qty, ctx, here);
    }
    if (result.ok) {
      total = total.plus(result.value);
      lines.push({ lineId: line.id, cost: result.value });
    } else {
      issues.push({ ...result.issue, lineId: line.id });
      lines.push({ lineId: line.id, cost: null });
    }
  }

  const portions = positive(recipe.portions);
  if (!portions) issues.push({ code: 'invalid_portions' });

  let costPerYieldUnit: Decimal | null = null;
  if (recipe.yieldQuantity != null || recipe.yieldUnit != null) {
    const yieldQty = positive(recipe.yieldQuantity);
    if (!yieldQty || !recipe.yieldUnit) {
      issues.push({ code: 'invalid_yield', subject: recipe.name });
    } else {
      costPerYieldUnit = total.div(yieldQty.times(UNITS[recipe.yieldUnit].factor));
    }
  }

  const result: RecipeCost =
    issues.length > 0 || !portions
      ? { status: 'incomplete', issues, lines }
      : { status: 'ok', batchCost: total, costPerPortion: total.div(portions), costPerYieldUnit, lines };

  // A result reached while walking a cycle depends on the path taken, so only
  // cycle-free results are safe to reuse.
  const pathDependent = issues.some((i) => i.code === 'cycle' || i.code === 'too_deep' || i.code === 'sub_recipe_incomplete');
  if (!pathDependent || path.length === 0) ctx.memo.set(recipe.id, result);
  return result;
}

export function costRecipe(recipeId: string, ctx: CostingContext): RecipeCost {
  const recipe = ctx.recipes.get(recipeId);
  if (!recipe) return { status: 'incomplete', issues: [{ code: 'missing_recipe' }], lines: [] };
  return costRecipeInner(recipe, ctx, []);
}

/**
 * True when adding `subRecipeId` as a line of `recipeId` would make a recipe
 * (directly or indirectly) contain itself. Call before saving a line.
 */
export function wouldCreateCycle(
  recipes: Map<string, Pick<Recipe, 'lines'>>,
  recipeId: string,
  subRecipeId: string,
): boolean {
  const seen = new Set<string>();
  const stack = [subRecipeId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === recipeId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const line of recipes.get(id)?.lines ?? []) {
      if (line.subRecipeId) stack.push(line.subRecipeId);
    }
  }
  return false;
}

export interface MenuMetrics {
  /** Sell price with GST removed (unchanged when the venue is not GST-registered). */
  sellPriceExGst: Decimal;
  /** Cost as a percentage of the ex-GST sell price. null when the sell price is zero. */
  foodCostPct: Decimal | null;
  grossProfit: Decimal;
}

export function menuMetrics(
  costPerPortion: Decimal,
  sellPriceCents: number,
  gstRegistered: boolean,
): MenuMetrics {
  const sell = new D(sellPriceCents).div(100);
  const sellPriceExGst = gstRegistered ? sell.div(GST_DIVISOR) : sell;
  return {
    sellPriceExGst,
    foodCostPct: sellPriceExGst.gt(0) ? costPerPortion.div(sellPriceExGst).times(100) : null,
    grossProfit: sellPriceExGst.minus(costPerPortion),
  };
}

/** Menu price (inc GST when registered) that hits the target food cost %, rounded up to the next 50c. */
export function suggestedSellPriceCents(
  costPerPortion: Decimal,
  targetFoodCostPct: Numeric,
  gstRegistered: boolean,
): number | null {
  const target = dec(targetFoodCostPct);
  if (!target || target.lte(0) || target.gt(100) || costPerPortion.lt(0)) return null;
  const exGst = costPerPortion.div(target.div(100));
  const cents = (gstRegistered ? exGst.times(GST_DIVISOR) : exGst).times(100);
  return cents.div(50).ceil().times(50).toNumber();
}

/**
 * Parse a quantity typed on a phone keypad. Accepts a dot or a comma as the
 * decimal separator ("0.5", "0,5", ",5"). Returns null for anything else,
 * including "1,500" style input, which could mean 1500 or 1.5: the caller
 * should ask for it to be retyped rather than guess.
 */
export function parseDecimalInput(raw: string): string | null {
  const text = raw.trim();
  if (!/^(\d+([.,]\d*)?|[.,]\d+)$/.test(text)) return null;
  if (/^\d{1,3},\d{3}$/.test(text)) return null;
  const normalised = text.replace(',', '.').replace(/\.$/, '');
  return new D(normalised.startsWith('.') ? `0${normalised}` : normalised).toString();
}
