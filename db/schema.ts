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
    /** Reorder point in base units: below this the ingredient shows as low. */
    parLevel: quantity('par_level'),
    ...tracked,
  },
  (t) => [
    uniqueIndex('ingredients_name_key').on(sql`lower(${t.name})`).where(sql`${t.archivedAt} IS NULL`),
    check('ingredients_name_present', sql`btrim(${t.name}) <> ''`),
    check('ingredients_yield_range', sql`${t.yieldPct} > 0 AND ${t.yieldPct} <= 100`),
    check('ingredients_grams_per_each_positive', sql`${t.gramsPerEach} IS NULL OR ${t.gramsPerEach} > 0`),
    check('ingredients_grams_per_ml_positive', sql`${t.gramsPerMl} IS NULL OR ${t.gramsPerMl} > 0`),
    check('ingredients_par_level_valid', sql`${t.parLevel} IS NULL OR ${t.parLevel} >= 0`),
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
    /** The yield was worked out from the ingredients, not weighed; cleared once a batch is weighed. */
    yieldEstimated: boolean('yield_estimated').notNull().default(false),
    portions: quantity('portions').notNull().default('1'),
    /** Ingredients used "as needed" (salt, frying oil, ...): shown with the recipe, left out of its cost. */
    asNeeded: text('as_needed').array().notNull().default(sql`'{}'::text[]`),
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
    // One seasonal menu is live at a time; making another live archives it (setMenuStatus).
    uniqueIndex('menus_one_live_seasonal').on(t.kind).where(sql`${t.status} = 'live' AND ${t.kind} = 'seasonal' AND ${t.archivedAt} IS NULL`),
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

// ---------------------------------------------------------------- gift cards

export const giftOrderStatusEnum = pgEnum('gift_order_status', ['pending', 'paid', 'failed', 'expired']);
export const giftCardStatusEnum = pgEnum('gift_card_status', ['active', 'void']);
export const giftLedgerKindEnum = pgEnum('gift_ledger_kind', ['issue', 'redeem', 'reverse', 'void', 'adjust']);
export const outboxStatusEnum = pgEnum('outbox_status', ['pending', 'sent', 'failed']);

/** What the buyer asked for, saved before they are sent to Stripe. The card is only created once Stripe says it is paid. */
export const giftCardOrders = pgTable(
  'gift_card_orders',
  {
    id: id(),
    amountCents: integer('amount_cents').notNull(),
    buyerName: text('buyer_name').notNull(),
    buyerEmail: text('buyer_email').notNull(),
    recipientName: text('recipient_name').notNull(),
    recipientEmail: text('recipient_email').notNull(),
    message: text('message'),
    status: giftOrderStatusEnum('status').notNull().default('pending'),
    stripeSessionId: text('stripe_session_id').unique(),
    /** Keyed hash of the buyer's IP address, only for the per-address checkout limit. */
    clientIpHash: text('client_ip_hash'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    /** The connected Stripe account the checkout was opened on. */
    stripeAccountId: text('stripe_account_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    /**
     * A refund or dispute Stripe reported before the card existed (events can
     * arrive in any order). Applied to the card the moment it is created.
     */
    paymentIssue: text('payment_issue'),
    /** True when that issue cancels the card outright (full refund, dispute); false when it only puts it on hold. */
    paymentIssueVoids: boolean('payment_issue_voids').notNull().default(false),
  },
  (t) => [
    index('gift_card_orders_payment_intent').on(t.stripePaymentIntentId),
    index('gift_card_orders_ip_recent').on(t.clientIpHash, t.createdAt),
    check('gift_card_orders_amount_range', sql`${t.amountCents} >= 2500 AND ${t.amountCents} <= 50000 AND ${t.amountCents} % 100 = 0`),
  ],
);

export const giftCards = pgTable(
  'gift_cards',
  {
    id: id(),
    /** One card per paid order: the second line of defence against issuing twice. */
    orderId: uuid('order_id').notNull().unique().references(() => giftCardOrders.id, { onDelete: 'restrict' }),
    /** Keyed hash of the code, for lookup. The code itself is never stored in the clear. */
    codeHash: text('code_hash').notNull().unique(),
    /** The code encrypted with a key held outside the database, so the email can be re-sent. */
    codeEncrypted: text('code_encrypted').notNull(),
    codeLast4: text('code_last4').notNull(),
    initialCents: integer('initial_cents').notNull(),
    /** Kept in step with the ledger inside the same transaction; the constraint makes overspending impossible. */
    balanceCents: integer('balance_cents').notNull(),
    status: giftCardStatusEnum('status').notNull().default('active'),
    /** Last day the card can be used, Australia/Sydney. Three years from purchase. */
    expiresOn: date('expires_on').notNull(),
    /** Set when a refund or dispute needs a person to decide. The card cannot be used until the owner clears it. */
    flaggedReason: text('flagged_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
  },
  (t) => [
    check('gift_cards_initial_positive', sql`${t.initialCents} > 0`),
    check('gift_cards_balance_range', sql`${t.balanceCents} >= 0 AND ${t.balanceCents} <= ${t.initialCents}`),
  ],
);

/** Every movement of value on a card. Rows are only ever added; a mistake is corrected with a `reverse` row. */
export const giftCardLedger = pgTable(
  'gift_card_ledger',
  {
    id: id(),
    cardId: uuid('card_id').notNull().references(() => giftCards.id, { onDelete: 'restrict' }),
    kind: giftLedgerKindEnum('kind').notNull(),
    /** Positive adds value (issue, reverse), negative takes it (redeem, void); an owner's `adjust` goes either way. */
    amountCents: integer('amount_cents').notNull(),
    actorEmail: text('actor_email').notNull(),
    note: text('note'),
    /** For a `reverse` row: the redemption it undoes. Unique, so a redemption can be reversed once. */
    reversesId: uuid('reverses_id').unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('gift_card_ledger_card').on(t.cardId, t.createdAt),
    check('gift_card_ledger_nonzero', sql`${t.amountCents} <> 0`),
    // Compared as text: 'adjust' is added to the enum in the same migration, and a
    // new enum value cannot be used as one until that transaction commits.
    check(
      'gift_card_ledger_sign',
      sql`(${t.kind}::text IN ('issue', 'reverse') AND ${t.amountCents} > 0) OR (${t.kind}::text IN ('redeem', 'void') AND ${t.amountCents} < 0) OR ${t.kind}::text = 'adjust'`,
    ),
    check('gift_card_ledger_reverse_target', sql`(${t.kind} = 'reverse') = (${t.reversesId} IS NOT NULL)`),
  ],
);

/** Stripe event ids already handled, so a retried or replayed webhook does nothing the second time. */
export const stripeEvents = pgTable('stripe_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Emails owed to customers. Written in the same transaction as the card, sent
 * afterwards with retries, so a mail outage can never lose a paid card. The
 * body is built at send time; no code is stored here.
 */
export const emailOutbox = pgTable(
  'email_outbox',
  {
    id: id(),
    kind: text('kind').notNull(),
    giftCardId: uuid('gift_card_id').notNull().references(() => giftCards.id, { onDelete: 'cascade' }),
    status: outboxStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [index('email_outbox_pending').on(t.status, t.createdAt)],
);

// --------------------------------------------------------------------- stock

export const stockMovementKindEnum = pgEnum('stock_movement_kind', ['count', 'receive', 'waste', 'adjust']);

/**
 * Every change to stock on hand, in the ingredient's base unit. Rows are only
 * ever added; on hand is the sum of `quantity_delta`. A stocktake is stored as
 * the difference it made, with the counted figure kept alongside.
 */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: id(),
    ingredientId: uuid('ingredient_id').notNull().references(() => ingredients.id, { onDelete: 'restrict' }),
    kind: stockMovementKindEnum('kind').notNull(),
    quantityDelta: quantity('quantity_delta').notNull(),
    /** For a `count`: what was physically counted. */
    countedQuantity: quantity('counted_quantity'),
    /** Groups the lines of one stocktake or one delivery. */
    batchId: uuid('batch_id'),
    note: text('note'),
    actorEmail: text('actor_email').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('stock_movements_ingredient').on(t.ingredientId, t.createdAt),
    index('stock_movements_batch').on(t.batchId),
    check('stock_movements_count_has_figure', sql`(${t.kind} = 'count') = (${t.countedQuantity} IS NOT NULL)`),
    check('stock_movements_counted_valid', sql`${t.countedQuantity} IS NULL OR ${t.countedQuantity} >= 0`),
    check('stock_movements_receive_positive', sql`${t.kind} <> 'receive' OR ${t.quantityDelta} > 0`),
    check('stock_movements_waste_negative', sql`${t.kind} <> 'waste' OR ${t.quantityDelta} < 0`),
  ],
);

// ------------------------------------------------------------- idempotency

/**
 * One row per save that must not happen twice (a delivery, a gift card
 * redemption). The phone makes up the key when the form opens and sends it
 * with every try, so a retry after a dropped connection is recognised.
 * Rows older than 30 days are cleared by the nightly job.
 */
export const idempotencyKeys = pgTable('idempotency_keys', {
  key: uuid('key').primaryKey(),
  action: text('action').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
