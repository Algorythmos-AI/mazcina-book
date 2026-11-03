import { inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, schema } from '@/db';
import { Invalid } from './invalid';
import { assertCanStopBeingPrep, assertPrepsUsable, assertUnitCanChange, lockRecipeGraph, openMenuItemsUsing } from './kitchen-rules';

const TAG = `rulestest-${Date.now()}`;
const made = { ingredients: [] as string[], recipes: [] as string[], menus: [] as string[] };

beforeAll(() => {
  if (process.env.VERCEL_ENV === 'production') throw new Error('Refusing to run database tests against production');
});

afterAll(async () => {
  if (made.menus.length > 0) {
    await db.delete(schema.menuItems).where(inArray(schema.menuItems.menuId, made.menus));
    await db.delete(schema.menus).where(inArray(schema.menus.id, made.menus));
  }
  if (made.recipes.length > 0) {
    await db.delete(schema.recipeLines).where(inArray(schema.recipeLines.recipeId, made.recipes));
    await db.delete(schema.recipes).where(inArray(schema.recipes.id, made.recipes));
  }
  if (made.ingredients.length > 0) {
    await db.delete(schema.stockMovements).where(inArray(schema.stockMovements.ingredientId, made.ingredients));
    await db.delete(schema.ingredients).where(inArray(schema.ingredients.id, made.ingredients));
  }
});

let n = 0;
const name = (what: string) => `${TAG} ${what} ${n++}`;

async function ingredient(parLevel: string | null = null) {
  const [row] = await db.insert(schema.ingredients).values({ name: name('ingredient'), baseUnit: 'g', parLevel }).returning();
  made.ingredients.push(row.id);
  return row;
}

async function recipe(type: 'dish' | 'prep' = 'prep', withYield = type === 'prep') {
  const [row] = await db
    .insert(schema.recipes)
    .values({ name: name(type), type, ...(withYield ? { yieldQuantity: '1', yieldUnit: 'kg' as const } : {}) })
    .returning();
  made.recipes.push(row.id);
  return row;
}

async function uses(parentId: string, subId: string) {
  await db.insert(schema.recipeLines).values({ recipeId: parentId, subRecipeId: subId, quantity: '100', unit: 'g' });
}

const prepLine = (subRecipeId: string) => ({ ingredientId: null, subRecipeId, unit: 'g' as const });
const none = new Set<string>();

describe('changing how an ingredient is measured', () => {
  it('is allowed when nothing is stored in the old unit', async () => {
    const eggs = await ingredient();
    await expect(db.transaction((tx) => assertUnitCanChange(tx, eggs))).resolves.toBeUndefined();
  });

  it('is refused while there is stock on hand', async () => {
    const eggs = await ingredient();
    await db.insert(schema.stockMovements).values({ ingredientId: eggs.id, kind: 'receive', quantityDelta: '6000', actorEmail: 'test@example.com' });
    await expect(db.transaction((tx) => assertUnitCanChange(tx, eggs))).rejects.toThrow(/6 kg in stock/);
  });

  it('is allowed again once the stock is counted to zero', async () => {
    const eggs = await ingredient();
    await db.insert(schema.stockMovements).values([
      { ingredientId: eggs.id, kind: 'receive', quantityDelta: '6000', actorEmail: 'test@example.com' },
      { ingredientId: eggs.id, kind: 'count', quantityDelta: '-6000', countedQuantity: '0', actorEmail: 'test@example.com' },
    ]);
    await expect(db.transaction((tx) => assertUnitCanChange(tx, eggs))).resolves.toBeUndefined();
  });

  it('is refused while a minimum level is set', async () => {
    const eggs = await ingredient('500');
    await expect(db.transaction((tx) => assertUnitCanChange(tx, eggs))).rejects.toThrow(/minimum stock level/);
  });
});

describe('a recipe on a menu', () => {
  it('stops counting as "on the menu" once that menu is archived', async () => {
    const dish = await recipe('dish');
    const [menu] = await db.insert(schema.menus).values({ name: name('menu'), kind: 'special', status: 'draft' }).returning();
    made.menus.push(menu.id);
    await db.insert(schema.menuItems).values({ menuId: menu.id, recipeId: dish.id, name: 'Winter soup', category: 'Mains', sellPriceCents: 2000 });

    expect(await db.transaction((tx) => openMenuItemsUsing(tx, dish.id))).toEqual(['Winter soup']);
    await db.update(schema.menus).set({ status: 'archived' }).where(inArray(schema.menus.id, [menu.id]));
    expect(await db.transaction((tx) => openMenuItemsUsing(tx, dish.id))).toEqual([]);
  });
});

describe('preps inside recipes', () => {
  it('only lets a prep go inside another recipe, but keeps older dish lines working', async () => {
    const parent = await recipe('dish');
    const other = await recipe('dish', true);
    await expect(db.transaction((tx) => assertPrepsUsable(tx, { id: parent.id, previousSubIds: none }, [prepLine(other.id)]))).rejects.toThrow(
      /is a dish, not a prep/,
    );
    await expect(
      db.transaction((tx) => assertPrepsUsable(tx, { id: parent.id, previousSubIds: new Set([other.id]) }, [prepLine(other.id)])),
    ).resolves.toBeUndefined();
  });

  it('refuses a chain deeper than costing can follow', async () => {
    const chain: { id: string }[] = [];
    for (let i = 0; i < 8; i++) chain.push(await recipe('prep'));
    for (let i = 0; i < 7; i++) await uses(chain[i].id, chain[i + 1].id);
    const top = await recipe('dish');
    // top → 8 preps is 9 recipes deep.
    await expect(db.transaction((tx) => assertPrepsUsable(tx, { id: top.id, previousSubIds: none }, [prepLine(chain[0].id)]))).rejects.toThrow(
      /Too many preps inside preps/,
    );
    // Seven deep is fine.
    await expect(
      db.transaction((tx) => assertPrepsUsable(tx, { id: top.id, previousSubIds: none }, [prepLine(chain[1].id)])),
    ).resolves.toBeUndefined();
  });

  it('lets only one of two crossing saves through, so preps never contain each other', async () => {
    const a = await recipe('prep');
    const b = await recipe('prep');
    const save = (parent: string, sub: string) =>
      db.transaction(async (tx) => {
        await lockRecipeGraph(tx);
        await assertPrepsUsable(tx, { id: parent, previousSubIds: none }, [prepLine(sub)]);
        // Give the other save time to run its own check, as a slow phone would.
        await new Promise((resolve) => setTimeout(resolve, 300));
        await tx.insert(schema.recipeLines).values({ recipeId: parent, subRecipeId: sub, quantity: '100', unit: 'g' });
      });
    const results = await Promise.allSettled([save(a.id, b.id), save(b.id, a.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(Invalid);
    expect(failed.reason.message).toMatch(/already contains this recipe/);
  });

  it('keeps a prep a prep while other recipes use it', async () => {
    const sauce = await recipe('prep');
    const dish = await recipe('dish');
    await uses(dish.id, sauce.id);
    await expect(db.transaction((tx) => assertCanStopBeingPrep(tx, sauce.id))).rejects.toThrow(/has to stay a prep/);
  });
});
