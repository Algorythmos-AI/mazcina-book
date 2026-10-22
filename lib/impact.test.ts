import { describe, expect, it } from 'vitest';
import { dayBefore, daysAgo, priceImpact } from './impact';
import type { CostingData, MenuItemDto } from './types';

const data: CostingData = {
  asOf: '2026-10-13',
  settings: { gstRegistered: true, targetFoodCostPct: '30' },
  suppliers: [{ id: 's', name: 'S', contact: null, archived: false }],
  ingredients: [
    { id: 'oil', name: 'Oil', category: null, baseUnit: 'ml', yieldPct: '100', preferredSupplierId: 's', gramsPerEach: null, gramsPerMl: null, parLevel: null, version: 1, archived: false },
    { id: 'salt', name: 'Salt', category: null, baseUnit: 'g', yieldPct: '100', preferredSupplierId: 's', gramsPerEach: null, gramsPerMl: null, parLevel: null, version: 1, archived: false },
    { id: 'new', name: 'New', category: null, baseUnit: 'g', yieldPct: '100', preferredSupplierId: 's', gramsPerEach: null, gramsPerMl: null, parLevel: null, version: 1, archived: false },
  ],
  prices: [
    { id: 'p1', ingredientId: 'oil', supplierId: 's', packSize: '1', packUnit: 'l', packPrice: '10', priceIncludesGst: false, gstApplicable: false, effectiveDate: '2026-01-01', createdBy: null },
    { id: 'p2', ingredientId: 'oil', supplierId: 's', packSize: '1', packUnit: 'l', packPrice: '12', priceIncludesGst: false, gstApplicable: false, effectiveDate: '2026-10-10', createdBy: null },
    { id: 'p3', ingredientId: 'salt', supplierId: 's', packSize: '1', packUnit: 'kg', packPrice: '2', priceIncludesGst: false, gstApplicable: false, effectiveDate: '2026-01-01', createdBy: null },
    { id: 'p4', ingredientId: 'new', supplierId: 's', packSize: '1', packUnit: 'kg', packPrice: '5', priceIncludesGst: false, gstApplicable: false, effectiveDate: '2026-10-12', createdBy: null },
  ],
  recipes: [
    { id: 'chips', name: 'Chips', type: 'dish', yieldQuantity: null, yieldUnit: null, yieldEstimated: false, portions: '1', asNeeded: [], notes: null, version: 1, archived: false, lines: [{ id: 'l1', ingredientId: 'oil', quantity: '300', unit: 'ml' }] },
    { id: 'plain', name: 'Plain', type: 'dish', yieldQuantity: null, yieldUnit: null, yieldEstimated: false, portions: '1', asNeeded: [], notes: null, version: 1, archived: false, lines: [{ id: 'l2', ingredientId: 'salt', quantity: '10', unit: 'g' }] },
  ],
};
const items: MenuItemDto[] = [{ id: 'm1', menuId: 'm', recipeId: 'chips', name: 'Chips', category: 'Sides', sellPriceCents: 900, sortOrder: 0, version: 1, archived: false }];

describe('priceImpact', () => {
  it('reports only what moved, with the effect on linked menu items', () => {
    const { ingredients, dishes } = priceImpact(data, items, '2026-10-06');
    expect(ingredients.map((i) => [i.name, i.before?.toString() ?? null, i.after.toString(), i.changePct?.toFixed(1) ?? null])).toEqual([
      ['New', null, '0.005', null],
      ['Oil', '0.01', '0.012', '20.0'],
    ]);
    expect(dishes).toHaveLength(1);
    expect(dishes[0]).toMatchObject({ name: 'Chips' });
    expect([dishes[0].before.toString(), dishes[0].after.toString(), dishes[0].delta.toString()]).toEqual(['3', '3.6', '0.6']);
    // 3.00 and 3.60 against $9 inc GST
    expect(dishes[0].menuItems.map((m) => [m.beforePct?.toFixed(1), m.afterPct?.toFixed(1)])).toEqual([['36.7', '44.0']]);
  });

  it('shows nothing when the window starts after the change', () => {
    expect(priceImpact(data, items, '2026-10-13')).toEqual({ ingredients: [], dishes: [] });
  });

  it('counts a change made on the first day of the window', () => {
    expect(priceImpact(data, items, '2026-10-10').dishes).toHaveLength(1);
    expect(priceImpact(data, items, '2026-10-11').dishes).toHaveLength(0);
  });
});

describe('date helpers', () => {
  it('steps across month and year ends', () => {
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
    expect(dayBefore('2026-01-01')).toBe('2025-12-31');
    expect(daysAgo('2026-10-03', 7)).toBe('2026-09-26');
  });
});
