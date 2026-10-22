/**
 * Loads a kitchen data pack into the database without ever overwriting what
 * people have entered: missing suppliers, ingredients and recipes are added,
 * existing ones are left exactly as they are, prices are appended only when the
 * same invoice line is not already there, and a menu item is linked to its
 * recipe only if it has no recipe yet. Safe to run again: a second run adds nothing.
 *
 * Used by the owner-only Kitchen data page and by scripts/import-kitchen-data.ts.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { checkPack, recipeNotes, type KitchenPack } from './pack';

const key = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = typeof db | Tx;

export interface ImportReport {
  problems: string[];
  suppliers: { add: string[]; keep: string[] };
  ingredients: { add: string[]; keep: string[] };
  prices: { add: string[]; keep: string[] };
  recipes: { add: string[]; keep: string[] };
  menuLinks: { add: string[]; keep: string[] };
}

async function current(tx: Db) {
  const [suppliers, ingredients, prices, recipes, items] = await Promise.all([
    tx.select().from(schema.suppliers).where(isNull(schema.suppliers.archivedAt)),
    tx.select().from(schema.ingredients).where(isNull(schema.ingredients.archivedAt)),
    tx.select().from(schema.ingredientPrices),
    tx.select().from(schema.recipes).where(isNull(schema.recipes.archivedAt)),
    tx
      .select({ item: schema.menuItems })
      .from(schema.menuItems)
      .innerJoin(schema.menus, eq(schema.menus.id, schema.menuItems.menuId))
      .where(and(isNull(schema.menuItems.archivedAt), isNull(schema.menus.archivedAt))),
  ]);
  return {
    suppliers: new Map(suppliers.map((s) => [key(s.name), s])),
    ingredients: new Map(ingredients.map((i) => [key(i.name), i])),
    prices,
    recipes: new Map(recipes.map((r) => [key(r.name), r])),
    items: items.map((r) => r.item),
  };
}

const priceKey = (ingredientId: string, supplierId: string, date: string, size: number | string, unit: string, price: number | string) =>
  [ingredientId, supplierId, date, Number(size), unit, Number(price).toFixed(2)].join('|');

/** What an import would do, without changing anything. */
export async function planImport(pack: KitchenPack, tx: Db = db): Promise<ImportReport> {
  const problems = checkPack(pack);
  const now = await current(tx);
  const split = <T,>(list: T[], exists: (x: T) => boolean, label: (x: T) => string) => ({
    add: list.filter((x) => !exists(x)).map(label),
    keep: list.filter(exists).map(label),
  });
  const existingPrices = new Set(now.prices.map((p) => priceKey(p.ingredientId, p.supplierId, p.effectiveDate, p.packSize, p.packUnit, p.packPrice)));
  const priceExists = (p: KitchenPack['prices'][number]) => {
    const ing = now.ingredients.get(key(p.ingredient));
    const sup = now.suppliers.get(key(p.supplier));
    return !!ing && !!sup && existingPrices.has(priceKey(ing.id, sup.id, p.effectiveDate, p.packSize, p.packUnit, p.packPrice));
  };
  const itemsByName = new Map<string, typeof now.items>();
  for (const item of now.items) itemsByName.set(key(item.name), [...(itemsByName.get(key(item.name)) ?? []), item]);
  const links = pack.menuLinks.flatMap((m) => (itemsByName.get(key(m.menuItem)) ?? []).map((item) => ({ m, item })));
  return {
    problems,
    suppliers: split(pack.suppliers, (s) => now.suppliers.has(key(s.name)), (s) => s.name),
    ingredients: split(pack.ingredients, (i) => now.ingredients.has(key(i.name)), (i) => i.name),
    prices: split(pack.prices, priceExists, (p) => `${p.ingredient}: ${p.description}`),
    recipes: split(pack.recipes, (r) => now.recipes.has(key(r.name)), (r) => r.name),
    menuLinks: split(links, (l) => !!l.item.recipeId, (l) => `${l.m.menuItem} → ${l.m.recipe}`),
  };
}

/** Runs the import in one transaction: all of it or none of it. */
export async function applyImport(pack: KitchenPack, actorEmail: string): Promise<ImportReport> {
  const problems = checkPack(pack);
  if (problems.length > 0) throw new Error(`The data pack has ${problems.length} problem(s); nothing was imported.`);

  return db.transaction(async (tx) => {
    const report = await planImport(pack, tx);
    const now = await current(tx);
    const by = `import:${pack.updated}`;

    for (const s of pack.suppliers) {
      if (now.suppliers.has(key(s.name))) continue;
      const [row] = await tx.insert(schema.suppliers).values({ name: s.name, contact: s.contact ?? null }).returning();
      now.suppliers.set(key(row.name), row);
    }
    for (const i of pack.ingredients) {
      if (now.ingredients.has(key(i.name))) continue;
      const [row] = await tx
        .insert(schema.ingredients)
        .values({
          name: i.name,
          category: i.category,
          baseUnit: i.baseUnit,
          yieldPct: String(i.yieldPct),
          gramsPerEach: i.gramsPerEach !== undefined ? String(i.gramsPerEach) : null,
          gramsPerMl: i.gramsPerMl !== undefined ? String(i.gramsPerMl) : null,
          preferredSupplierId: i.preferredSupplier ? now.suppliers.get(key(i.preferredSupplier))!.id : null,
        })
        .returning();
      now.ingredients.set(key(row.name), row);
    }
    const existingPrices = new Set(now.prices.map((p) => priceKey(p.ingredientId, p.supplierId, p.effectiveDate, p.packSize, p.packUnit, p.packPrice)));
    for (const p of pack.prices) {
      const ingredientId = now.ingredients.get(key(p.ingredient))!.id;
      const supplierId = now.suppliers.get(key(p.supplier))!.id;
      const k = priceKey(ingredientId, supplierId, p.effectiveDate, p.packSize, p.packUnit, p.packPrice);
      if (existingPrices.has(k)) continue;
      await tx.insert(schema.ingredientPrices).values({
        ingredientId,
        supplierId,
        packSize: String(p.packSize),
        packUnit: p.packUnit,
        packPrice: p.packPrice.toFixed(2),
        gstApplicable: p.gstApplicable,
        priceIncludesGst: p.priceIncludesGst,
        effectiveDate: p.effectiveDate,
        createdBy: `${by} (${p.source})`,
      });
      existingPrices.add(k);
    }

    // New recipes first, then their lines, so a recipe can use another recipe from the same pack.
    const added: typeof pack.recipes = [];
    for (const r of pack.recipes) {
      if (now.recipes.has(key(r.name))) continue;
      const [row] = await tx
        .insert(schema.recipes)
        .values({
          name: r.name,
          type: r.type,
          portions: String(r.portions),
          yieldQuantity: r.yieldQuantity !== undefined ? String(r.yieldQuantity) : null,
          yieldUnit: r.yieldUnit ?? null,
          yieldEstimated: r.yieldQuantity !== undefined && r.yieldEstimated,
          asNeeded: r.asNeeded,
          notes: recipeNotes(r),
        })
        .returning();
      now.recipes.set(key(row.name), row);
      added.push(r);
    }
    for (const r of added) {
      const recipeId = now.recipes.get(key(r.name))!.id;
      const lines = r.lines.map((l, index) => ({
        recipeId,
        ingredientId: l.ingredient ? now.ingredients.get(key(l.ingredient))!.id : null,
        subRecipeId: l.recipe ? now.recipes.get(key(l.recipe))!.id : null,
        quantity: String(l.quantity),
        unit: l.unit,
        sortOrder: index,
      }));
      if (lines.length > 0) await tx.insert(schema.recipeLines).values(lines);
    }

    for (const link of pack.menuLinks) {
      const recipe = now.recipes.get(key(link.recipe));
      if (!recipe) continue;
      for (const item of now.items.filter((i) => key(i.name) === key(link.menuItem) && !i.recipeId)) {
        await tx
          .update(schema.menuItems)
          .set({ recipeId: recipe.id, updatedAt: new Date(), version: item.version + 1 })
          .where(and(eq(schema.menuItems.id, item.id), isNull(schema.menuItems.recipeId)));
      }
    }

    await tx.insert(schema.auditLog).values({
      actorEmail,
      action: 'import',
      entity: 'kitchen_data',
      entityId: pack.updated,
      after: {
        name: `kitchen data ${pack.updated}`,
        suppliers: report.suppliers.add.length,
        ingredients: report.ingredients.add.length,
        prices: report.prices.add.length,
        recipes: report.recipes.add.length,
        menuLinks: report.menuLinks.add.length,
      },
    });
    return report;
  });
}
