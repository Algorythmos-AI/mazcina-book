import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createContext, costRecipe } from '../costing';
import { checkPack, packSchema, recipeNotes } from './pack';

const pack = packSchema.parse(JSON.parse(readFileSync('data/kitchen/mazcina-kitchen-data.json', 'utf8')));

describe('the Mazcina kitchen data pack', () => {
  it('is consistent: every name resolves, units convert, no loops', () => {
    expect(checkPack(pack)).toEqual([]);
  });

  it('keeps every recipe method within what the app can edit', () => {
    for (const r of pack.recipes) expect(recipeNotes(r).length).toBeLessThanOrEqual(12000);
  });

  it('costs with the engine the app uses, and never shows an estimate as measured', () => {
    const id = (s: string) => s.toLowerCase();
    const ctx = createContext({
      asOf: '2026-10-16',
      ingredients: pack.ingredients.map((i) => ({ id: id(i.name), name: i.name, baseUnit: i.baseUnit, yieldPct: String(i.yieldPct), gramsPerEach: i.gramsPerEach ? String(i.gramsPerEach) : null, gramsPerMl: i.gramsPerMl ? String(i.gramsPerMl) : null, preferredSupplierId: null })),
      prices: pack.prices.map((p, n) => ({ id: `p${n}`, ingredientId: id(p.ingredient), supplierId: id(p.supplier), packSize: String(p.packSize), packUnit: p.packUnit, packPrice: String(p.packPrice), priceIncludesGst: p.priceIncludesGst, gstApplicable: p.gstApplicable, effectiveDate: p.effectiveDate })),
      recipes: pack.recipes.map((r) => ({ id: id(r.name), name: r.name, portions: String(r.portions), yieldQuantity: r.yieldQuantity ? String(r.yieldQuantity) : null, yieldUnit: r.yieldUnit ?? null, yieldEstimated: r.yieldEstimated, lines: r.lines.map((l, n) => ({ id: `${r.name}-${n}`, ingredientId: l.ingredient ? id(l.ingredient) : null, subRecipeId: l.recipe ? id(l.recipe) : null, quantity: String(l.quantity), unit: l.unit })) })),
    });
    // Roasted pepper sauce: every ingredient but one is unpriced today, so it must be incomplete, never a low number.
    expect(costRecipe(id('Salsa Brava Mazcina'), ctx).status).toBe('incomplete');
    // Strawberries alone are priced in the berry sauce; the dish is incomplete until the rest is.
    expect(costRecipe(id('Pudín de Sémola con Berries y Vino Tinto'), ctx).status).toBe('incomplete');
  });
});
