import { describe, expect, it } from 'vitest';
import { createContext, type Ingredient, type Recipe } from './costing';
import { menuBlockers } from './menu';
import type { MenuItemDto } from './types';

const ingredients: Ingredient[] = [
  { id: 'lemon', name: 'Lemon', baseUnit: 'g', yieldPct: 100 },
  { id: 'oil', name: 'Olive oil', baseUnit: 'ml', yieldPct: 100 },
];
const recipes: Recipe[] = [
  { id: 'dressing', name: 'Dressing', portions: 1, yieldQuantity: 1, yieldUnit: 'l', lines: [{ id: 'd1', ingredientId: 'oil', quantity: 1, unit: 'l' }] },
  { id: 'salad', name: 'Salad', portions: 1, lines: [{ id: 's1', ingredientId: 'lemon', quantity: 10, unit: 'g' }, { id: 's2', subRecipeId: 'dressing', quantity: 50, unit: 'ml' }] },
  { id: 'fish', name: 'Fish', portions: 1, lines: [{ id: 'f1', ingredientId: 'lemon', quantity: 10, unit: 'g' }] },
];
const item = (id: string, recipeId: string | null): MenuItemDto => ({ id, name: id, category: 'Mains', sellPriceCents: 2000, recipeId, sortOrder: 0, version: 1, archived: false }) as MenuItemDto;

describe('menuBlockers', () => {
  it('names each missing price once, with every dish it holds back, looking inside preps', () => {
    const ctx = createContext({ ingredients, recipes, prices: [], asOf: '2026-11-03' });
    const list = menuBlockers([item('Salad', 'salad'), item('Fish', 'fish'), item('Bread', null)], ctx, { ingredients, recipes });
    expect(list.map((b) => [b.subject, b.ingredientId, b.items.map((i) => i.name)])).toEqual([
      ['Lemon', 'lemon', ['Salad', 'Fish']],
      ['Olive oil', 'oil', ['Salad']],
    ]);
  });
});
