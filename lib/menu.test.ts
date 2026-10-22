import { describe, expect, it } from 'vitest';
import { createContext, type Ingredient, type Recipe } from './costing';
import { rootIssues } from './menu';

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
