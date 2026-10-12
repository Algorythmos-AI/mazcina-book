/**
 * Loads the printed 2026 menu (public/menu/mazcina-menu-2026.pdf on the public
 * site; the takeaway menu carries the same prices) as the live menu.
 * Idempotent: does nothing if a menu with this name already exists.
 * Usage: tsx scripts/seed-menu.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

const MENU_NAME = 'Menu 2026';

// [category, name, price in dollars]
const ITEMS: [string, string, number][] = [
  ['Starters', 'Mushroom Ceviche', 19],
  ['Starters', 'Napo Chicken Bites', 19],
  ['Starters', 'Baked Feta Pot', 18],
  ['Starters', 'Mazcina Salmon Ceviche', 29],
  ['Starters', 'Mazcina Bravas', 19],
  ['Starters', 'Mazcina Garlic Prawns', 23],
  ['Starters', 'Crab Gratin', 23],
  ['Starters', 'Cocktail Empanada: Beef', 5],
  ['Starters', 'Cocktail Empanada: Cheese', 5],
  ['Starters', 'Cocktail Empanada: Prawn & Cheese', 5],
  ['Chef Suggestions for Sharing', 'Mazcina Earth Board', 74],
  ['Chef Suggestions for Sharing', 'Mazcina Ocean Board', 79],
  ['Chef Suggestions for Sharing', 'Chorrillana', 32],
  ['Mains', 'Red Mechada Pasta', 27],
  ['Mains', 'Green Creamy Pasta', 24],
  ['Mains', 'Mazcina Grilled Barramundi', 28],
  ['Mains', 'Saltado', 20],
  ['Mains', 'Mazcina Mediterranean Rice', 34],
  ['Mains', 'Mazcina Salmon Cancato', 36],
  ['Sandwiches', 'Barros Luco', 24],
  ['Sandwiches', 'Fish Sandwich', 25],
  ['Sandwiches', 'Mechada Sandwich', 27],
  ['Salads', 'Chilena Salad', 9],
  ['Salads', 'Mazcina Salad', 15],
  ['Salads', 'Queen Avo Salad', 19],
  ['Sides', 'Sopaipillas', 1.5],
  ['Sides', 'Chips', 9],
  ['Sides', 'Provenzal Potatoes', 14],
  ['Kids Menu', 'Chicken, Fries and Salad', 16],
  ['Kids Menu', 'Fish Bites, Fries and Salad', 17],
  ['Desserts', 'Four Milks', 26],
  ['Desserts', 'Semolina Pudding', 22],
  ['Desserts', 'Celestinos', 22],
  ['Add-ons', 'Sandwich: Caramelized onion', 2.5],
  ['Add-ons', 'Sandwich: Fresh tomato slices', 2],
  ['Add-ons', 'Sandwich: Melted cheese', 3],
  ['Add-ons', 'Sandwich: Fried egg', 3.5],
  ['Add-ons', 'Sandwich: Smashed avocado', 5.5],
  ['Add-ons', 'Sandwich: Provenzal potatoes instead of fries', 3],
  ['Add-ons', 'Saltado: Homemade potatoes instead of chips', 3],
  ['Add-ons', 'Salad: Grilled chicken', 9],
  ['Add-ons', 'Salad: Grilled barramundi bites', 9],
  ['Add-ons', 'Salad: Garlic prawns', 10.5],
];

async function main() {
  const { db, schema } = await import('../db');
  const { eq } = await import('drizzle-orm');
  const existing = await db.select().from(schema.menus).where(eq(schema.menus.name, MENU_NAME));
  if (existing.length > 0) {
    console.log(`"${MENU_NAME}" already exists; nothing changed`);
    process.exit(0);
  }
  await db.transaction(async (tx) => {
    const [menu] = await tx
      .insert(schema.menus)
      .values({ name: MENU_NAME, kind: 'seasonal', status: 'live' })
      .returning({ id: schema.menus.id });
    await tx.insert(schema.menuItems).values(
      ITEMS.map(([category, name, dollars], index) => ({
        menuId: menu.id,
        category,
        name,
        sellPriceCents: Math.round(dollars * 100),
        sortOrder: index,
      })),
    );
    await tx.insert(schema.auditLog).values({
      actorEmail: 'seed',
      action: 'create',
      entity: 'menu',
      entityId: menu.id,
      after: { name: MENU_NAME, items: ITEMS.length, source: 'mazcina-menu-2026.pdf' },
    });
  });
  console.log(`created "${MENU_NAME}" with ${ITEMS.length} items`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
