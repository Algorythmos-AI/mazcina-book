import 'server-only';
import { db, schema } from '@/db';

/**
 * A complete copy of the kitchen's own data as plain JSON. Login sessions and
 * one-time codes are left out: they are not the restaurant's records and
 * should never sit in a backup.
 */
export async function exportEverything() {
  const [settings, team, suppliers, ingredients, ingredientPrices, recipes, recipeLines, menus, menuItems, menuCostSnapshots, auditLog] =
    await Promise.all([
      db.select().from(schema.settings),
      db.select().from(schema.allowedUsers),
      db.select().from(schema.suppliers),
      db.select().from(schema.ingredients),
      db.select().from(schema.ingredientPrices),
      db.select().from(schema.recipes),
      db.select().from(schema.recipeLines),
      db.select().from(schema.menus),
      db.select().from(schema.menuItems),
      db.select().from(schema.menuCostSnapshots),
      db.select().from(schema.auditLog),
    ]);
  return {
    format: 'mazcina-kitchen-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: { settings, team, suppliers, ingredients, ingredientPrices, recipes, recipeLines, menus, menuItems, menuCostSnapshots, auditLog },
  };
}
