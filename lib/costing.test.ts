import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  convertToBase,
  costRecipe,
  createContext,
  menuMetrics,
  packPriceExGst,
  parseDecimalInput,
  selectPrice,
  suggestedSellPriceCents,
  wouldCreateCycle,
  type Ingredient,
  type IngredientPrice,
  type IssueCode,
  type Recipe,
  type RecipeCost,
} from './costing';

const ASOF = '2026-10-12';

const lemon: Ingredient = { id: 'lemon', name: 'Lemon', baseUnit: 'g', yieldPct: 40, gramsPerEach: 120, gramsPerMl: 1 };
const oil: Ingredient = { id: 'oil', name: 'Olive oil', baseUnit: 'ml', yieldPct: 100 };
const octopus: Ingredient = { id: 'octopus', name: 'Octopus', baseUnit: 'g', yieldPct: 70 };

const price = (over: Partial<IngredientPrice> & Pick<IngredientPrice, 'ingredientId'>): IngredientPrice => ({
  supplierId: 's1',
  packSize: 1,
  packUnit: 'kg',
  packPrice: '10',
  priceIncludesGst: false,
  gstApplicable: false,
  effectiveDate: '2026-01-01',
  ...over,
});

const prices: IngredientPrice[] = [
  price({ ingredientId: 'lemon', packSize: 5, packUnit: 'kg', packPrice: '22.50' }),
  price({ ingredientId: 'oil', packSize: 4, packUnit: 'l', packPrice: '44.00', priceIncludesGst: true, gstApplicable: true }),
  price({ ingredientId: 'octopus', packSize: 2, packUnit: 'kg', packPrice: '56.00' }),
];

const vinaigrette: Recipe = {
  id: 'vin',
  name: 'Lemon vinaigrette',
  yieldQuantity: 500,
  yieldUnit: 'ml',
  portions: 1,
  lines: [
    { id: 'v1', ingredientId: 'lemon', quantity: 150, unit: 'ml' },
    { id: 'v2', ingredientId: 'oil', quantity: 350, unit: 'ml' },
  ],
};

const octopusSalad: Recipe = {
  id: 'dish',
  name: 'Grilled octopus',
  portions: 1,
  lines: [
    { id: 'd1', subRecipeId: 'vin', quantity: 40, unit: 'ml' },
    { id: 'd2', ingredientId: 'octopus', quantity: 180, unit: 'g' },
    { id: 'd3', ingredientId: 'lemon', quantity: '0.5', unit: 'each' },
  ],
};

function ctx(over: { ingredients?: Ingredient[]; recipes?: Recipe[]; prices?: IngredientPrice[]; asOf?: string } = {}) {
  return createContext({
    ingredients: over.ingredients ?? [lemon, oil, octopus],
    recipes: over.recipes ?? [vinaigrette, octopusSalad],
    prices: over.prices ?? prices,
    asOf: over.asOf ?? ASOF,
  });
}

function ok(result: RecipeCost) {
  if (result.status !== 'ok') throw new Error(`expected ok, got ${JSON.stringify(result.issues)}`);
  return result;
}

function issueCodes(result: RecipeCost): IssueCode[] {
  if (result.status !== 'incomplete') throw new Error('expected incomplete');
  return result.issues.map((i) => i.code);
}

describe('worked example, checked by hand', () => {
  // Lemon: $22.50 / 5 kg = $0.0045/g, 40% yield. Oil: $44 inc GST / 4 l = $0.01/ml ex GST.
  // Octopus: $56 / 2 kg = $0.028/g, 70% yield.
  it('costs the prep', () => {
    const result = ok(costRecipe('vin', ctx()));
    // 150 ml juice = 150 g x 0.0045 / 0.4 = 1.6875; 350 ml oil = 3.50
    expect(result.lines.map((l) => l.cost?.toString())).toEqual(['1.6875', '3.5']);
    expect(result.batchCost.toString()).toBe('5.1875');
    expect(result.costPerYieldUnit?.toString()).toBe('0.010375');
  });

  it('costs the dish through the prep', () => {
    const result = ok(costRecipe('dish', ctx()));
    // 40 ml vinaigrette = 0.415; octopus 180 x 0.028 / 0.7 = 7.20; half a lemon = 60 g x 0.0045 / 0.4 = 0.675
    expect(result.lines.map((l) => l.cost?.toString())).toEqual(['0.415', '7.2', '0.675']);
    expect(result.costPerPortion.toString()).toBe('8.29');
  });

  it('derives food cost %, profit and a suggested price', () => {
    const cost = ok(costRecipe('dish', ctx())).costPerPortion;
    const m = menuMetrics(cost, 3200, true);
    // 8.29 / (32 / 1.1) = 28.496875%
    expect(m.foodCostPct?.toFixed(6)).toBe('28.496875');
    expect(m.grossProfit.toFixed(4)).toBe('20.8009');
    // 8.29 / 0.30 x 1.1 = 30.3967 -> next 50c
    expect(suggestedSellPriceCents(cost, 30, true)).toBe(3050);
    expect(menuMetrics(cost, 3200, false).foodCostPct?.toFixed(4)).toBe('25.9063');
    expect(suggestedSellPriceCents(cost, 30, false)).toBe(2800);
  });
});

describe('convertToBase', () => {
  it('converts within a dimension exactly', () => {
    expect(convertToBase('1.5', 'kg', 'g')?.toString()).toBe('1500');
    expect(convertToBase(2, 'l', 'ml')?.toString()).toBe('2000');
    expect(convertToBase('0.1', 'g', 'g')?.plus('0.2').toString()).toBe('0.3');
  });

  it('crosses dimensions only with the ingredient factors', () => {
    expect(convertToBase(2, 'each', 'g', { gramsPerEach: 120 })?.toString()).toBe('240');
    expect(convertToBase(240, 'g', 'each', { gramsPerEach: 120 })?.toString()).toBe('2');
    expect(convertToBase(1, 'l', 'g', { gramsPerMl: '0.92' })?.toString()).toBe('920');
    expect(convertToBase(100, 'ml', 'each', { gramsPerEach: 50, gramsPerMl: 1 })?.toString()).toBe('2');
    expect(convertToBase(2, 'each', 'g')).toBeNull();
    expect(convertToBase(2, 'each', 'g', { gramsPerEach: 0 })).toBeNull();
    expect(convertToBase(100, 'ml', 'each', { gramsPerMl: 1 })).toBeNull();
  });
});

describe('selectPrice', () => {
  const list = [
    price({ ingredientId: 'x', supplierId: 'a', packPrice: '1', effectiveDate: '2026-01-01' }),
    price({ ingredientId: 'x', supplierId: 'a', packPrice: '2', effectiveDate: '2026-06-01' }),
    price({ ingredientId: 'x', supplierId: 'b', packPrice: '3', effectiveDate: '2026-09-01' }),
    price({ ingredientId: 'x', supplierId: 'a', packPrice: '4', effectiveDate: '2026-12-01' }),
  ];

  it('prefers the preferred supplier over a newer price elsewhere', () => {
    expect(selectPrice(list, 'a', ASOF)?.packPrice).toBe('2');
  });
  it('falls back to the newest from any supplier', () => {
    expect(selectPrice(list, null, ASOF)?.packPrice).toBe('3');
    expect(selectPrice(list, 'nobody', ASOF)?.packPrice).toBe('3');
  });
  it('ignores future prices until their date, and gives history by date', () => {
    expect(selectPrice(list, 'a', '2026-12-01')?.packPrice).toBe('4');
    expect(selectPrice(list, 'a', '2026-03-01')?.packPrice).toBe('1');
    expect(selectPrice(list, 'a', '2025-12-31')).toBeNull();
  });
  it('takes the last listed among same-day prices', () => {
    const sameDay = [
      price({ ingredientId: 'x', packPrice: '1', effectiveDate: '2026-05-05' }),
      price({ ingredientId: 'x', packPrice: '9', effectiveDate: '2026-05-05' }),
    ];
    expect(selectPrice(sameDay, null, ASOF)?.packPrice).toBe('9');
  });
});

describe('GST normalisation', () => {
  it('only divides when the price includes GST and attracts it', () => {
    const p = (priceIncludesGst: boolean, gstApplicable: boolean) =>
      packPriceExGst(price({ ingredientId: 'x', packPrice: '11', priceIncludesGst, gstApplicable }))?.toString();
    expect(p(true, true)).toBe('10');
    expect(p(true, false)).toBe('11');
    expect(p(false, true)).toBe('11');
    expect(p(false, false)).toBe('11');
  });
});

describe('a price change flows through', () => {
  it('re-costs every dish using the ingredient from the effective date', () => {
    const withRise = [...prices, price({ ingredientId: 'lemon', packSize: 5, packUnit: 'kg', packPrice: '45.00', effectiveDate: '2026-10-10' })];
    expect(ok(costRecipe('dish', ctx({ prices: withRise, asOf: '2026-10-09' }))).costPerPortion.toString()).toBe('8.29');
    // lemon doubles: prep 5.1875 + 1.6875 = 6.875 -> 40 ml = 0.55; garnish 1.35; octopus 7.20
    expect(ok(costRecipe('dish', ctx({ prices: withRise, asOf: '2026-10-10' }))).costPerPortion.toString()).toBe('9.1');
  });
});

describe('incomplete instead of a wrong number', () => {
  const dishWith = (lines: Recipe['lines'], over: Partial<Recipe> = {}): Recipe => ({ id: 'r', name: 'R', portions: 1, lines, ...over });
  const run = (recipe: Recipe, over: Parameters<typeof ctx>[0] = {}) =>
    costRecipe('r', ctx({ recipes: [vinaigrette, recipe], ...over }));
  const oilLine = { id: 'l1', ingredientId: 'oil', quantity: 10, unit: 'ml' as const };

  it('reports each reason and never a cost', () => {
    const cases: [IssueCode, RecipeCost][] = [
      ['no_lines', run(dishWith([]))],
      ['no_price', run(dishWith([oilLine]), { prices: [] })],
      ['no_price', run(dishWith([oilLine]), { asOf: '2025-01-01' })],
      ['missing_ingredient', run(dishWith([{ ...oilLine, ingredientId: 'ghost' }]))],
      ['archived_ingredient', run(dishWith([oilLine]), { ingredients: [{ ...oil, archived: true }] })],
      ['needs_conversion', run(dishWith([{ ...oilLine, unit: 'g' }]))],
      ['needs_conversion', run(dishWith([{ id: 'l1', ingredientId: 'octopus', quantity: 1, unit: 'each' }]))],
      ['needs_conversion', run(dishWith([oilLine]), { prices: [price({ ingredientId: 'oil', packUnit: 'kg' })] })],
      ['invalid_yield', run(dishWith([oilLine]), { ingredients: [{ ...oil, yieldPct: 0 }] })],
      ['invalid_yield', run(dishWith([oilLine]), { ingredients: [{ ...oil, yieldPct: 101 }] })],
      ['invalid_price', run(dishWith([oilLine]), { prices: [price({ ingredientId: 'oil', packUnit: 'l', packSize: 0 })] })],
      ['invalid_price', run(dishWith([oilLine]), { prices: [price({ ingredientId: 'oil', packUnit: 'l', packPrice: '-1' })] })],
      ['invalid_quantity', run(dishWith([{ ...oilLine, quantity: 0 }]))],
      ['invalid_quantity', run(dishWith([{ ...oilLine, quantity: 'abc' }]))],
      ['invalid_line', run(dishWith([{ id: 'l1', quantity: 1, unit: 'g' }]))],
      ['invalid_line', run(dishWith([{ ...oilLine, subRecipeId: 'vin' }]))],
      ['invalid_portions', run(dishWith([oilLine], { portions: 0 }))],
      ['invalid_yield', run(dishWith([oilLine], { yieldQuantity: 0, yieldUnit: 'ml' }))],
      ['missing_recipe', run(dishWith([{ id: 'l1', subRecipeId: 'ghost', quantity: 1, unit: 'ml' }]))],
      ['needs_conversion', run(dishWith([{ id: 'l1', subRecipeId: 'vin', quantity: 1, unit: 'g' }]))],
      ['sub_recipe_incomplete', run(dishWith([{ id: 'l1', subRecipeId: 'vin', quantity: 1, unit: 'ml' }]), { prices: [] })],
      ['missing_recipe', costRecipe('ghost', ctx())],
    ];
    for (const [code, result] of cases) {
      expect(issueCodes(result), code).toContain(code);
      expect(result).not.toHaveProperty('costPerPortion');
    }
  });

  it('flags a prep with no yield and an archived prep', () => {
    const noYield: Recipe = { ...vinaigrette, yieldQuantity: null, yieldUnit: null };
    const line = { id: 'l1', subRecipeId: 'vin', quantity: 1, unit: 'ml' as const };
    expect(issueCodes(costRecipe('r', ctx({ recipes: [noYield, dishWith([line])] })))).toEqual(['sub_recipe_no_yield']);
    expect(issueCodes(costRecipe('r', ctx({ recipes: [{ ...vinaigrette, archived: true }, dishWith([line])] })))).toEqual(['archived_recipe']);
  });

  it('keeps costing the good lines so the screen can show which one is broken', () => {
    const result = run(dishWith([oilLine, { id: 'l2', ingredientId: 'ghost', quantity: 1, unit: 'g' }]));
    expect(result.lines.map((l) => l.cost?.toString() ?? null)).toEqual(['0.1', null]);
    expect(result.status === 'incomplete' && result.issues[0].lineId).toBe('l2');
  });
});

describe('cycles', () => {
  const a: Recipe = { id: 'a', name: 'A', yieldQuantity: 1, yieldUnit: 'l', portions: 1, lines: [{ id: 'a1', subRecipeId: 'b', quantity: 1, unit: 'ml' }] };
  const b: Recipe = { id: 'b', name: 'B', yieldQuantity: 1, yieldUnit: 'l', portions: 1, lines: [{ id: 'b1', subRecipeId: 'a', quantity: 1, unit: 'ml' }] };

  it('terminates and reports incomplete if a cycle ever reaches the data', () => {
    const c = ctx({ recipes: [a, b] });
    expect(costRecipe('a', c).status).toBe('incomplete');
    expect(costRecipe('b', c).status).toBe('incomplete');
    const self: Recipe = { ...a, lines: [{ id: 'a1', subRecipeId: 'a', quantity: 1, unit: 'ml' }] };
    expect(issueCodes(costRecipe('a', ctx({ recipes: [self] })))).toEqual(['cycle']);
  });

  it('stops at the depth limit', () => {
    const chain: Recipe[] = Array.from({ length: 12 }, (_, i) => ({
      id: `r${i}`,
      name: `R${i}`,
      yieldQuantity: 1,
      yieldUnit: 'l' as const,
      portions: 1,
      lines: i === 11 ? [{ id: 'x', ingredientId: 'oil', quantity: 1, unit: 'ml' as const }] : [{ id: 'x', subRecipeId: `r${i + 1}`, quantity: 1, unit: 'ml' as const }],
    }));
    expect(costRecipe('r0', ctx({ recipes: chain })).status).toBe('incomplete');
    expect(costRecipe('r6', ctx({ recipes: chain })).status).toBe('ok');
  });

  it('detects a cycle before it is saved', () => {
    const recipes = new Map<string, Pick<Recipe, 'lines'>>([
      ['a', { lines: [{ id: '1', subRecipeId: 'b', quantity: 1, unit: 'ml' }] }],
      ['b', { lines: [{ id: '2', subRecipeId: 'c', quantity: 1, unit: 'ml' }] }],
      ['c', { lines: [] }],
      ['d', { lines: [] }],
    ]);
    expect(wouldCreateCycle(recipes, 'a', 'a')).toBe(true);
    expect(wouldCreateCycle(recipes, 'c', 'a')).toBe(true);
    expect(wouldCreateCycle(recipes, 'a', 'c')).toBe(false);
    expect(wouldCreateCycle(recipes, 'd', 'a')).toBe(false);
  });
});

describe('menu metrics edge cases', () => {
  it('has no food cost % at a zero price and rejects a nonsense target', () => {
    const cost = ok(costRecipe('dish', ctx())).costPerPortion;
    expect(menuMetrics(cost, 0, true).foodCostPct).toBeNull();
    expect(suggestedSellPriceCents(cost, 0, true)).toBeNull();
    expect(suggestedSellPriceCents(cost, 101, true)).toBeNull();
    expect(suggestedSellPriceCents(cost, 'x', true)).toBeNull();
  });
  it('keeps an exact 50c multiple as is', () => {
    const c = createContext({
      ingredients: [oil],
      recipes: [{ id: 'r', name: 'R', portions: 1, lines: [{ id: 'l', ingredientId: 'oil', quantity: 300, unit: 'ml' }] }],
      prices,
      asOf: ASOF,
    });
    // cost 3.00 at 30% = 10.00 ex GST exactly
    expect(suggestedSellPriceCents(ok(costRecipe('r', c)).costPerPortion, 30, false)).toBe(1000);
  });
});

describe('parseDecimalInput', () => {
  it('accepts dot or comma decimals', () => {
    expect(parseDecimalInput('0.5')).toBe('0.5');
    expect(parseDecimalInput('0,5')).toBe('0.5');
    expect(parseDecimalInput(' ,5 ')).toBe('0.5');
    expect(parseDecimalInput('.25')).toBe('0.25');
    expect(parseDecimalInput('12')).toBe('12');
    expect(parseDecimalInput('12.')).toBe('12');
    expect(parseDecimalInput('1500')).toBe('1500');
    expect(parseDecimalInput('1,25')).toBe('1.25');
    expect(parseDecimalInput('1.500')).toBe('1.5');
  });
  it('refuses to guess', () => {
    for (const bad of ['', ' ', 'abc', '1,500', '1,234.5', '1.2.3', '-1', '1e3', '½', ',', '.']) {
      expect(parseDecimalInput(bad), bad).toBeNull();
    }
  });
});

describe('properties', () => {
  const qty = fc.integer({ min: 1, max: 100_000 }).map((n) => (n / 100).toString());
  const cents = fc.integer({ min: 1, max: 1_000_000 }).map((n) => (n / 100).toFixed(2));
  const recipeOf = (quantity: string): Recipe => ({ id: 'r', name: 'R', portions: 4, lines: [{ id: 'l', ingredientId: 'octopus', quantity, unit: 'g' }] });
  const costAt = (quantity: string, packPrice: string) =>
    ok(costRecipe('r', ctx({ recipes: [recipeOf(quantity)], prices: [price({ ingredientId: 'octopus', packPrice })] }))).costPerPortion;

  it('cost scales linearly with quantity', () => {
    fc.assert(
      fc.property(qty, cents, fc.integer({ min: 2, max: 50 }), (q, p, k) => {
        const scaled = (Number(q) * 100 * k / 100).toFixed(2);
        expect(costAt(scaled, p).minus(costAt(q, p).times(k)).abs().lt('1e-25')).toBe(true);
      }),
    );
  });

  it('a higher price never lowers a cost', () => {
    fc.assert(
      fc.property(qty, cents, cents, (q, p1, p2) => {
        const [low, high] = Number(p1) <= Number(p2) ? [p1, p2] : [p2, p1];
        expect(costAt(q, high).gte(costAt(q, low))).toBe(true);
      }),
    );
  });

  it('never returns a negative or non-finite cost', () => {
    fc.assert(
      fc.property(qty, cents, (q, p) => {
        const c = costAt(q, p);
        expect(c.isFinite() && c.gte(0)).toBe(true);
      }),
    );
  });
});

describe('estimated yields', () => {
  it('marks a cost as an estimate when a prep it uses has an estimated yield, at any depth', () => {
    const ctx = createContext({
      asOf: '2026-10-16',
      ingredients: [{ id: 'tom', name: 'Tomato', baseUnit: 'g', yieldPct: '100', gramsPerEach: null, gramsPerMl: null, preferredSupplierId: null }],
      prices: [{ ingredientId: 'tom', supplierId: 's', packSize: '1', packUnit: 'kg', packPrice: '5', priceIncludesGst: false, gstApplicable: false, effectiveDate: '2026-01-01' }],
      recipes: [
        { id: 'sauce', name: 'Sauce', portions: '1', yieldQuantity: '800', yieldUnit: 'g', yieldEstimated: true, lines: [{ id: 'a', ingredientId: 'tom', quantity: '1000', unit: 'g' }] },
        { id: 'base', name: 'Base', portions: '1', yieldQuantity: '500', yieldUnit: 'g', lines: [{ id: 'b', subRecipeId: 'sauce', quantity: '500', unit: 'g' }] },
        { id: 'dish', name: 'Dish', portions: '1', lines: [{ id: 'c', subRecipeId: 'base', quantity: '100', unit: 'g' }, { id: 'd', ingredientId: 'tom', quantity: '10', unit: 'g' }] },
        { id: 'plain', name: 'Plain', portions: '1', lines: [{ id: 'e', ingredientId: 'tom', quantity: '10', unit: 'g' }] },
      ],
    });
    const dish = costRecipe('dish', ctx);
    expect(dish.status === 'ok' && dish.estimates).toEqual(['Sauce']);
    const plain = costRecipe('plain', ctx);
    expect(plain.status === 'ok' && plain.estimates).toEqual([]);
  });
});

describe('ingredients used as needed', () => {
  it('are listed with the cost, gathered from every prep used, without changing it', () => {
    const plain = ok(costRecipe('dish', ctx()));
    expect(plain.asNeeded).toEqual([]);
    const withSalt = ok(
      costRecipe(
        'dish',
        ctx({ recipes: [{ ...vinaigrette, asNeeded: ['Salt'] }, { ...octopusSalad, asNeeded: ['Frying oil', 'Salt'] }] }),
      ),
    );
    expect(withSalt.asNeeded).toEqual(['Frying oil', 'Salt']);
    expect(withSalt.batchCost.toString()).toBe(plain.batchCost.toString());
  });
});
