/**
 * The kitchen data pack: the restaurant's real suppliers, ingredients, prices
 * and recipes in one versioned JSON file (data/kitchen/), loaded into the
 * database by scripts/import-kitchen-data.ts. Pure: validation and checks only,
 * no database access, so it can be tested and run before anything is written.
 *
 * Rules the file must follow:
 * - Names are the join keys: lines name an ingredient or a recipe exactly.
 * - Every price says where it came from (a source key), with the date it applied.
 * - Nothing is invented: a quantity the source does not give stays out of the
 *   lines and goes in `asNeeded` or an open question instead.
 */
import { z } from 'zod';
import { UNITS, type Unit } from '../costing';

const unit = z.enum(['g', 'kg', 'ml', 'l', 'each']);
const baseUnit = z.enum(['g', 'ml', 'each']);
const positive = z.number().positive().finite();
const name = z.string().trim().min(1).max(120);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const sourceSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]+$/),
  kind: z.enum(['recipe-manual', 'invoice', 'note']),
  title: z.string(),
  date: isoDate,
  supplier: z.string().optional(),
  reference: z.string().optional(),
});

export const supplierSchema = z.object({ name, contact: z.string().max(200).optional() });

export const ingredientSchema = z.object({
  name,
  /** The word used in the Spanish manual, for the kitchen team. */
  nameEs: z.string().optional(),
  category: z.string().max(60),
  baseUnit,
  yieldPct: z.number().gt(0).max(100).default(100),
  gramsPerEach: positive.optional(),
  gramsPerMl: positive.optional(),
  preferredSupplier: z.string().optional(),
});

export const priceSchema = z.object({
  ingredient: name,
  supplier: name,
  packSize: positive,
  packUnit: unit,
  /** As charged on the invoice line; 0 for something with no purchase cost, such as tap water. */
  packPrice: z.number().min(0).finite(),
  gstApplicable: z.boolean(),
  priceIncludesGst: z.boolean(),
  effectiveDate: isoDate,
  source: z.string(),
  /** The supplier's own wording and code, so the line can be found on the invoice again. */
  description: z.string(),
  productCode: z.string().optional(),
});

export const lineSchema = z
  .object({
    ingredient: name.optional(),
    recipe: name.optional(),
    quantity: positive,
    unit,
    /** The manual's original wording when it was converted (e.g. "1 cucharada (8-10 g aprox.)"). */
    original: z.string().optional(),
    approx: z.boolean().default(false),
  })
  .refine((l) => !!l.ingredient !== !!l.recipe, 'a line names exactly one ingredient or recipe');

export const recipeSchema = z.object({
  name,
  type: z.enum(['dish', 'prep']),
  section: z.string(),
  portions: positive.default(1),
  yieldQuantity: positive.optional(),
  yieldUnit: unit.optional(),
  /** True when the yield was worked out from the ingredients, not measured: shown as an estimate. */
  yieldEstimated: z.boolean().default(false),
  source: z.string(),
  page: z.number().int().positive().optional(),
  use: z.string().optional(),
  yieldText: z.string().optional(),
  equipment: z.array(z.string()).default([]),
  method: z.array(z.string()).default([]),
  criticalPoints: z.array(z.string()).default([]),
  /** Ingredients used "cantidad necesaria" (as needed): listed, not costed. */
  asNeeded: z.array(z.string()).default([]),
  pending: z.array(z.string()).default([]),
  lines: z.array(lineSchema),
});

export const menuLinkSchema = z.object({ menuItem: name, recipe: name });

export const questionSchema = z.object({
  topic: z.string(),
  question: z.string(),
  why: z.string(),
});

export const packSchema = z.object({
  format: z.literal('mazcina-kitchen-data'),
  version: z.literal(1),
  updated: isoDate,
  sources: z.array(sourceSchema),
  suppliers: z.array(supplierSchema),
  ingredients: z.array(ingredientSchema),
  prices: z.array(priceSchema),
  recipes: z.array(recipeSchema),
  menuLinks: z.array(menuLinkSchema),
  openQuestions: z.array(questionSchema),
  serviceConventions: z.array(z.string()).default([]),
});

export type KitchenPack = z.infer<typeof packSchema>;
export type PackRecipe = z.infer<typeof recipeSchema>;

const key = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Everything that would make the pack wrong to load, as plain sentences.
 * Empty means it is safe to import.
 */
export function checkPack(pack: KitchenPack): string[] {
  const problems: string[] = [];
  const dupes = (label: string, names: string[]) => {
    const seen = new Set<string>();
    for (const n of names) {
      if (seen.has(key(n))) problems.push(`${label} "${n}" appears twice`);
      seen.add(key(n));
    }
  };
  dupes('Supplier', pack.suppliers.map((s) => s.name));
  dupes('Ingredient', pack.ingredients.map((i) => i.name));
  dupes('Recipe', pack.recipes.map((r) => r.name));

  const sources = new Set(pack.sources.map((s) => s.key));
  const suppliers = new Set(pack.suppliers.map((s) => key(s.name)));
  const ingredients = new Map(pack.ingredients.map((i) => [key(i.name), i]));
  const recipes = new Map(pack.recipes.map((r) => [key(r.name), r]));

  for (const i of pack.ingredients) {
    if (i.preferredSupplier && !suppliers.has(key(i.preferredSupplier))) problems.push(`Ingredient "${i.name}": unknown supplier "${i.preferredSupplier}"`);
  }

  for (const p of pack.prices) {
    const ing = ingredients.get(key(p.ingredient));
    if (!ing) problems.push(`Price "${p.description}": unknown ingredient "${p.ingredient}"`);
    if (!suppliers.has(key(p.supplier))) problems.push(`Price "${p.description}": unknown supplier "${p.supplier}"`);
    if (!sources.has(p.source)) problems.push(`Price "${p.description}": unknown source "${p.source}"`);
    if (p.priceIncludesGst && !p.gstApplicable) problems.push(`Price "${p.description}": includes GST but has no GST`);
    if (ing && !convertible(p.packUnit, ing.baseUnit, ing)) {
      problems.push(`Price "${p.description}": a pack in ${p.packUnit} cannot be costed for "${ing.name}" measured in ${ing.baseUnit} without a conversion`);
    }
  }

  for (const r of pack.recipes) {
    if (!sources.has(r.source)) problems.push(`Recipe "${r.name}": unknown source "${r.source}"`);
    if ((r.yieldQuantity === undefined) !== (r.yieldUnit === undefined)) problems.push(`Recipe "${r.name}": yield needs both a quantity and a unit`);
    if (r.type === 'prep' && r.yieldQuantity === undefined) problems.push(`Recipe "${r.name}": a prep needs a yield`);
    if (r.lines.length === 0) problems.push(`Recipe "${r.name}": no lines`);
    for (const l of r.lines) {
      if (l.ingredient) {
        const ing = ingredients.get(key(l.ingredient));
        if (!ing) problems.push(`Recipe "${r.name}": unknown ingredient "${l.ingredient}"`);
        else if (!convertible(l.unit, ing.baseUnit, ing)) problems.push(`Recipe "${r.name}": "${l.ingredient}" in ${l.unit} needs a conversion (it is measured in ${ing.baseUnit})`);
      } else if (l.recipe) {
        const sub = recipes.get(key(l.recipe));
        if (!sub) problems.push(`Recipe "${r.name}": unknown recipe "${l.recipe}"`);
        else if (!sub.yieldUnit) problems.push(`Recipe "${r.name}": uses "${sub.name}", which has no yield`);
        else if (UNITS[l.unit].base !== UNITS[sub.yieldUnit].base) problems.push(`Recipe "${r.name}": uses "${sub.name}" in ${l.unit} but it yields ${sub.yieldUnit}`);
      }
    }
  }
  problems.push(...cycles(pack));

  for (const m of pack.menuLinks) {
    if (!recipes.has(key(m.recipe))) problems.push(`Menu link "${m.menuItem}": unknown recipe "${m.recipe}"`);
  }
  return problems;
}

function convertible(from: Unit, to: 'g' | 'ml' | 'each', ing: { gramsPerEach?: number; gramsPerMl?: number }): boolean {
  const base = UNITS[from].base;
  if (base === to) return true;
  const pair = new Set([base, to]);
  if (pair.has('each') && pair.has('g')) return !!ing.gramsPerEach;
  if (pair.has('ml') && pair.has('g')) return !!ing.gramsPerMl;
  if (pair.has('each') && pair.has('ml')) return !!ing.gramsPerEach && !!ing.gramsPerMl;
  return false;
}

function cycles(pack: KitchenPack): string[] {
  const uses = new Map(pack.recipes.map((r) => [key(r.name), r.lines.filter((l) => l.recipe).map((l) => key(l.recipe!))]));
  const found: string[] = [];
  const visit = (node: string, path: string[]) => {
    if (path.includes(node)) {
      found.push(`Recipes form a loop: ${[...path, node].join(' → ')}`);
      return;
    }
    for (const next of uses.get(node) ?? []) visit(next, [...path, node]);
  };
  for (const r of uses.keys()) visit(r, []);
  return [...new Set(found)].slice(0, 5);
}

/**
 * The method card stored with a recipe: what it is for, equipment, steps,
 * critical points and what is still to confirm, in the manual's own words.
 */
export function recipeNotes(r: PackRecipe): string {
  const parts: string[] = [];
  if (r.use) parts.push(`Uso: ${r.use}`);
  if (r.yieldText) parts.push(`Rendimiento: ${r.yieldText}`);
  if (r.yieldEstimated) parts.push('Rendimiento estimado a partir de los ingredientes: pesar una producción y corregir.');
  if (r.equipment.length) parts.push(`Equipamiento: ${r.equipment.join(' • ')}`);
  if (r.asNeeded.length) parts.push(`Cantidad necesaria (no costeado): ${r.asNeeded.join(', ')}`);
  if (r.method.length) parts.push(['Procedimiento:', ...r.method.map((s, i) => `${i + 1}. ${s}`)].join('\n'));
  if (r.criticalPoints.length) parts.push(['Puntos críticos:', ...r.criticalPoints.map((s) => `- ${s}`)].join('\n'));
  if (r.pending.length) parts.push(['Pendiente de confirmar:', ...r.pending.map((s) => `- ${s}`)].join('\n'));
  const approx = r.lines.filter((l) => l.approx && l.original).map((l) => `- ${l.ingredient ?? l.recipe}: ${l.original}`);
  if (approx.length) parts.push(['Cantidades aproximadas (convertidas):', ...approx].join('\n'));
  parts.push(`Fuente: Manual de Recetas Mazcina${r.page ? `, página ${r.page}` : ''}.`);
  return parts.join('\n\n');
}
