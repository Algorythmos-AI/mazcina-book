import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export * from './auth-schema';

export const unitEnum = pgEnum('unit', ['g', 'kg', 'ml', 'l', 'each']);
export const baseUnitEnum = pgEnum('base_unit', ['g', 'ml', 'each']);
export const roleEnum = pgEnum('role', ['owner', 'chef', 'staff']);
export const recipeTypeEnum = pgEnum('recipe_type', ['dish', 'prep']);
export const menuKindEnum = pgEnum('menu_kind', ['seasonal', 'special']);
export const menuStatusEnum = pgEnum('menu_status', ['draft', 'live', 'archived']);

const id = () => uuid('id').primaryKey().defaultRandom();
const quantity = (name: string) => numeric(name, { precision: 14, scale: 4 });

/** Shared bookkeeping: soft delete via `archivedAt`, optimistic locking via `version`. */
const tracked = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  version: integer('version').notNull().default(1),
};

/** Who may sign in. Checked before a login code is ever sent. */
export const allowedUsers = pgTable(
  'allowed_users',
  {
    id: id(),
    email: text('email').notNull(),
    name: text('name'),
    role: roleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('allowed_users_email_key').on(sql`lower(${t.email})`),
    check('allowed_users_email_trimmed', sql`${t.email} = btrim(${t.email}) AND ${t.email} <> ''`),
  ],
);

/** Single-row venue settings. */
export const settings = pgTable(
  'settings',
  {
    id: integer('id').primaryKey().default(1),
    gstRegistered: boolean('gst_registered').notNull().default(true),
    targetFoodCostPct: numeric('target_food_cost_pct', { precision: 5, scale: 2 }).notNull().default('30'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('settings_single_row', sql`${t.id} = 1`),
    check('settings_target_range', sql`${t.targetFoodCostPct} > 0 AND ${t.targetFoodCostPct} <= 100`),
  ],
);

export const suppliers = pgTable(
  'suppliers',
  {
    id: id(),
    name: text('name').notNull(),
    contact: text('contact'),
    ...tracked,
  },
  (t) => [
    uniqueIndex('suppliers_name_key').on(sql`lower(${t.name})`).where(sql`${t.archivedAt} IS NULL`),
    check('suppliers_name_present', sql`btrim(${t.name}) <> ''`),
  ],
);

export const ingredients = pgTable(
  'ingredients',
  {
    id: id(),
    name: text('name').notNull(),
    category: text('category'),
    baseUnit: baseUnitEnum('base_unit').notNull(),
    yieldPct: numeric('yield_pct', { precision: 5, scale: 2 }).notNull().default('100'),
    preferredSupplierId: uuid('preferred_supplier_id').references(() => suppliers.id, { onDelete: 'restrict' }),
    gramsPerEach: quantity('grams_per_each'),
    gramsPerMl: quantity('grams_per_ml'),
    ...tracked,
  },
  (t) => [
    uniqueIndex('ingredients_name_key').on(sql`lower(${t.name})`).where(sql`${t.archivedAt} IS NULL`),
    check('ingredients_name_present', sql`btrim(${t.name}) <> ''`),
    check('ingredients_yield_range', sql`${t.yieldPct} > 0 AND ${t.yieldPct} <= 100`),
    check('ingredients_grams_per_each_positive', sql`${t.gramsPerEach} IS NULL OR ${t.gramsPerEach} > 0`),
    check('ingredients_grams_per_ml_positive', sql`${t.gramsPerMl} IS NULL OR ${t.gramsPerMl} > 0`),
  ],
);

/** Append-only: a new price is a new row, so history is kept and costs can be read as of any date. */
export const ingredientPrices = pgTable(
  'ingredient_prices',
  {
    id: id(),
    ingredientId: uuid('ingredient_id').notNull().references(() => ingredients.id, { onDelete: 'restrict' }),
    supplierId: uuid('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'restrict' }),
    packSize: quantity('pack_size').notNull(),
    packUnit: unitEnum('pack_unit').notNull(),
    packPrice: numeric('pack_price', { precision: 12, scale: 4 }).notNull(),
    priceIncludesGst: boolean('price_includes_gst').notNull().default(false),
    gstApplicable: boolean('gst_applicable').notNull().default(false),
    /** Calendar date in Australia/Sydney. */
    effectiveDate: date('effective_date').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by'),
  },
  (t) => [
    index('ingredient_prices_lookup').on(t.ingredientId, t.effectiveDate, t.createdAt),
    check('ingredient_prices_pack_size_positive', sql`${t.packSize} > 0`),
    check('ingredient_prices_pack_price_valid', sql`${t.packPrice} >= 0`),
  ],
);

export const recipes = pgTable(
  'recipes',
  {
    id: id(),
    name: text('name').notNull(),
    type: recipeTypeEnum('type').notNull().default('dish'),
    yieldQuantity: quantity('yield_quantity'),
    yieldUnit: unitEnum('yield_unit'),
    portions: quantity('portions').notNull().default('1'),
    notes: text('notes'),
    ...tracked,
  },
  (t) => [
    uniqueIndex('recipes_name_key').on(sql`lower(${t.name})`).where(sql`${t.archivedAt} IS NULL`),
    check('recipes_name_present', sql`btrim(${t.name}) <> ''`),
    check('recipes_portions_positive', sql`${t.portions} > 0`),
    check('recipes_yield_pair', sql`(${t.yieldQuantity} IS NULL) = (${t.yieldUnit} IS NULL)`),
    check('recipes_yield_positive', sql`${t.yieldQuantity} IS NULL OR ${t.yieldQuantity} > 0`),
    // A prep is costed per unit of what it makes, so it must say how much that is.
    check('recipes_prep_has_yield', sql`${t.type} <> 'prep' OR ${t.yieldQuantity} IS NOT NULL`),
  ],
);

export const recipeLines = pgTable(
  'recipe_lines',
  {
    id: id(),
    recipeId: uuid('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id').references(() => ingredients.id, { onDelete: 'restrict' }),
    subRecipeId: uuid('sub_recipe_id').references(() => recipes.id, { onDelete: 'restrict' }),
    quantity: quantity('quantity').notNull(),
    unit: unitEnum('unit').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('recipe_lines_recipe').on(t.recipeId, t.sortOrder),
    index('recipe_lines_ingredient').on(t.ingredientId),
    index('recipe_lines_sub_recipe').on(t.subRecipeId),
    check('recipe_lines_one_source', sql`(${t.ingredientId} IS NULL) <> (${t.subRecipeId} IS NULL)`),
    check('recipe_lines_not_self', sql`${t.subRecipeId} IS NULL OR ${t.subRecipeId} <> ${t.recipeId}`),
    check('recipe_lines_quantity_positive', sql`${t.quantity} > 0`),
  ],
);

export const menus = pgTable(
  'menus',
  {
    id: id(),
    name: text('name').notNull(),
    kind: menuKindEnum('kind').notNull().default('seasonal'),
    status: menuStatusEnum('status').notNull().default('draft'),
    startsOn: date('starts_on'),
    endsOn: date('ends_on'),
    ...tracked,
  },
  (t) => [
    check('menus_name_present', sql`btrim(${t.name}) <> ''`),
    check('menus_dates_ordered', sql`${t.startsOn} IS NULL OR ${t.endsOn} IS NULL OR ${t.startsOn} <= ${t.endsOn}`),
  ],
);

export const menuItems = pgTable(
  'menu_items',
  {
    id: id(),
    menuId: uuid('menu_id').notNull().references(() => menus.id, { onDelete: 'cascade' }),
    /** Null until the dish has been costed. */
    recipeId: uuid('recipe_id').references(() => recipes.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    category: text('category').notNull(),
    /** Menu price in cents, GST included when the venue is registered. */
    sellPriceCents: integer('sell_price_cents').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...tracked,
  },
  (t) => [
    index('menu_items_menu').on(t.menuId, t.sortOrder),
    index('menu_items_recipe').on(t.recipeId),
    check('menu_items_name_present', sql`btrim(${t.name}) <> ''`),
    check('menu_items_price_valid', sql`${t.sellPriceCents} >= 0`),
  ],
);

/** Frozen when a menu is archived, so its history does not move with later price changes. */
export const menuCostSnapshots = pgTable('menu_cost_snapshots', {
  id: id(),
  menuId: uuid('menu_id').notNull().references(() => menus.id, { onDelete: 'cascade' }),
  takenAt: timestamp('taken_at', { withTimezone: true }).notNull().defaultNow(),
  asOf: date('as_of').notNull(),
  items: jsonb('items').notNull(),
});

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    actorEmail: text('actor_email').notNull(),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
  },
  (t) => [index('audit_log_at').on(t.at), index('audit_log_entity').on(t.entity, t.entityId)],
);
