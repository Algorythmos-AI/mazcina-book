import { describe, expect, it } from 'vitest';
import { createContext, type Ingredient, type Recipe } from './costing';
import DecimalJs from 'decimal.js';
import { menuSummary, rootIssues, type ItemCosting } from './menu';

const salt: Ingredient = { id: 'salt', name: 'Salt', baseUnit: 'g', yieldPct: 100 };
const parsley: Ingredient = { id: 'parsley', name: 'Parsley', baseUnit: 'g', yieldPct: 100 };
const beef: Ingredient = { id: 'beef', name: 'Beef', baseUnit: 'g', yieldPct: 100 };

const chimichurri: Recipe = {
  id: 'chimi',
  name: 'Chimichurri',
  yieldQuantity: 500,
  yieldUnit: 'g',
  portions: 1,
  lines: [
    { id: 'c1', ingredientId: 'parsley', quantity: 200, unit: 'g' },
    { id: 'c2', ingredientId: 'salt', quantity: 5, unit: 'g' },
  ],
};
const steak: Recipe = {
  id: 'steak',
  name: 'Steak',
  portions: 1,
  lines: [
    { id: 's1', ingredientId: 'beef', quantity: 300, unit: 'g' },
    { id: 's2', subRecipeId: 'chimi', quantity: 30, unit: 'g' },
    { id: 's3', ingredientId: 'salt', quantity: 2, unit: 'g' },
  ],
};

describe('rootIssues', () => {
  it('traces an incomplete prep down to the ingredients that block it, each once', () => {
    const ctx = createContext({
      ingredients: [salt, parsley, beef],
      recipes: [chimichurri, steak],
      prices: [{ ingredientId: 'beef', supplierId: 's', packSize: 1, packUnit: 'kg', packPrice: '30', priceIncludesGst: false, gstApplicable: false, effectiveDate: '2026-01-01' }],
      asOf: '2026-10-01',
    });
    const issues = rootIssues('steak', ctx);
    expect(issues.map((i) => `${i.code}:${i.subject}`).sort()).toEqual(['no_price:Parsley', 'no_price:Salt']);
  });

  it('is empty for a recipe that costs', () => {
    const ctx = createContext({
      ingredients: [beef],
      recipes: [{ id: 'b', name: 'Beef', portions: 1, lines: [{ id: 'l', ingredientId: 'beef', quantity: 1, unit: 'g' }] }],
      prices: [{ ingredientId: 'beef', supplierId: 's', packSize: 1, packUnit: 'kg', packPrice: '30', priceIncludesGst: false, gstApplicable: false, effectiveDate: '2026-01-01' }],
      asOf: '2026-10-01',
    });
    expect(rootIssues('b', ctx)).toEqual([]);
  });
});

describe('menuSummary', () => {
  const ok = (pct: number | null, rating: 'good' | 'watch' | 'high' | 'none' = 'good'): ItemCosting => ({
    status: 'ok',
    cost: new DecimalJs(1),
    foodCostPct: pct === null ? null : new DecimalJs(pct),
    grossProfit: new DecimalJs(1),
    suggestedCents: null,
    rating,
    estimates: [],
    asNeeded: [],
  });
  const incomplete: ItemCosting = { status: 'incomplete', issues: [], blockers: [] };
  const dish = (costing: ItemCosting, category = 'Mains', sellPriceCents = 2500) => ({ item: { category, sellPriceCents }, costing });

  it('withholds the average when one add-on is all that is costed (the live menu in October 2026)', () => {
    const rows = [dish(ok(16.6), 'Add-ons', 200), ...Array.from({ length: 33 }, () => dish(incomplete)), ...Array.from({ length: 9 }, () => dish({ status: 'uncosted' }))];
    const s = menuSummary(rows);
    expect(s.average).toBeNull();
    expect(s).toMatchObject({ costed: 1, incomplete: 33, unlinked: 9, dishes: 42, dishesCosted: 0 });
  });

  it('withholds the average below five dishes, even when they are the whole menu', () => {
    expect(menuSummary([dish(ok(20)), dish(ok(30)), dish(ok(40)), dish(ok(25))]).average).toBeNull();
  });

  it('withholds the average until half the dishes are costed', () => {
    const rows = [...Array.from({ length: 5 }, () => dish(ok(30))), ...Array.from({ length: 6 }, () => dish(incomplete))];
    expect(menuSummary(rows).average).toBeNull();
    expect(menuSummary(rows.slice(0, 10)).average?.toString()).toBe('30');
  });

  it('averages dishes only: add-ons and unpriced items stay out', () => {
    const rows = [
      ...[20, 30, 40, 30, 30].map((p) => dish(ok(p))),
      dish(ok(10), 'Add-ons', 200),
      dish(ok(null, 'none'), 'Mains', 0),
    ];
    const s = menuSummary(rows);
    expect(s.average?.toString()).toBe('30');
    expect(s).toMatchObject({ costed: 7, dishes: 5, dishesCosted: 5 });
  });

  it('counts watch and high separately', () => {
    const s = menuSummary([dish(ok(33, 'watch')), dish(ok(50, 'high')), dish(ok(50, 'high')), dish(ok(20))]);
    expect(s).toMatchObject({ watch: 1, high: 2 });
  });
});
