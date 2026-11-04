import 'server-only';
import { db, schema } from '@/db';

/**
 * A complete copy of the kitchen's own data as plain JSON. Login sessions and
 * one-time codes are left out: they are not the restaurant's records and
 * should never sit in a backup. Gift card codes are included only in their
 * encrypted form, which is useless without the key held in the environment.
 */
export async function exportEverything() {
  // One read-only snapshot: every table as it stood at the same instant, so a
  // gift card redeemed mid-backup cannot leave its ledger and balance disagreeing.
  return db.transaction(
    async (tx) => {
      const settings = await tx.select().from(schema.settings);
      const team = await tx.select().from(schema.allowedUsers);
      const suppliers = await tx.select().from(schema.suppliers);
      const ingredients = await tx.select().from(schema.ingredients);
      const ingredientPrices = await tx.select().from(schema.ingredientPrices);
      const recipes = await tx.select().from(schema.recipes);
      const recipeLines = await tx.select().from(schema.recipeLines);
      const menus = await tx.select().from(schema.menus);
      const menuItems = await tx.select().from(schema.menuItems);
      const menuCostSnapshots = await tx.select().from(schema.menuCostSnapshots);
      const auditLog = await tx.select().from(schema.auditLog);
      const stockMovements = await tx.select().from(schema.stockMovements);
      const giftCardOrders = await tx.select().from(schema.giftCardOrders);
      const giftCards = await tx.select().from(schema.giftCards);
      const giftCardLedger = await tx.select().from(schema.giftCardLedger);
      // Gift card emails still waiting to go out, and which Stripe events were already handled.
      const emailOutbox = await tx.select().from(schema.emailOutbox);
      const stripeEvents = await tx.select().from(schema.stripeEvents);
      return {
        format: 'mazcina-kitchen-export',
        version: 2,
        exportedAt: new Date().toISOString(),
        tables: {
          settings, team, suppliers, ingredients, ingredientPrices, recipes, recipeLines, menus, menuItems, menuCostSnapshots,
          auditLog, stockMovements, giftCardOrders, giftCards, giftCardLedger, emailOutbox, stripeEvents,
        },
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
