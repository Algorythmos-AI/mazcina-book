CREATE TYPE "public"."base_unit" AS ENUM('g', 'ml', 'each');--> statement-breakpoint
CREATE TYPE "public"."menu_kind" AS ENUM('seasonal', 'special');--> statement-breakpoint
CREATE TYPE "public"."menu_status" AS ENUM('draft', 'live', 'archived');--> statement-breakpoint
CREATE TYPE "public"."recipe_type" AS ENUM('dish', 'prep');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'chef', 'staff');--> statement-breakpoint
CREATE TYPE "public"."unit" AS ENUM('g', 'kg', 'ml', 'l', 'each');--> statement-breakpoint
CREATE TABLE "allowed_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allowed_users_email_trimmed" CHECK ("allowed_users"."email" = btrim("allowed_users"."email") AND "allowed_users"."email" <> '')
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb
);
--> statement-breakpoint
CREATE TABLE "ingredient_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"pack_size" numeric(14, 4) NOT NULL,
	"pack_unit" "unit" NOT NULL,
	"pack_price" numeric(12, 4) NOT NULL,
	"price_includes_gst" boolean DEFAULT false NOT NULL,
	"gst_applicable" boolean DEFAULT false NOT NULL,
	"effective_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text,
	CONSTRAINT "ingredient_prices_pack_size_positive" CHECK ("ingredient_prices"."pack_size" > 0),
	CONSTRAINT "ingredient_prices_pack_price_valid" CHECK ("ingredient_prices"."pack_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"base_unit" "base_unit" NOT NULL,
	"yield_pct" numeric(5, 2) DEFAULT '100' NOT NULL,
	"preferred_supplier_id" uuid,
	"grams_per_each" numeric(14, 4),
	"grams_per_ml" numeric(14, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ingredients_name_present" CHECK (btrim("ingredients"."name") <> ''),
	CONSTRAINT "ingredients_yield_range" CHECK ("ingredients"."yield_pct" > 0 AND "ingredients"."yield_pct" <= 100),
	CONSTRAINT "ingredients_grams_per_each_positive" CHECK ("ingredients"."grams_per_each" IS NULL OR "ingredients"."grams_per_each" > 0),
	CONSTRAINT "ingredients_grams_per_ml_positive" CHECK ("ingredients"."grams_per_ml" IS NULL OR "ingredients"."grams_per_ml" > 0)
);
--> statement-breakpoint
CREATE TABLE "menu_cost_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_id" uuid NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"as_of" date NOT NULL,
	"items" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"menu_id" uuid NOT NULL,
	"recipe_id" uuid,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"sell_price_cents" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "menu_items_name_present" CHECK (btrim("menu_items"."name") <> ''),
	CONSTRAINT "menu_items_price_valid" CHECK ("menu_items"."sell_price_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "menus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "menu_kind" DEFAULT 'seasonal' NOT NULL,
	"status" "menu_status" DEFAULT 'draft' NOT NULL,
	"starts_on" date,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "menus_name_present" CHECK (btrim("menus"."name") <> ''),
	CONSTRAINT "menus_dates_ordered" CHECK ("menus"."starts_on" IS NULL OR "menus"."ends_on" IS NULL OR "menus"."starts_on" <= "menus"."ends_on")
);
--> statement-breakpoint
CREATE TABLE "recipe_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"ingredient_id" uuid,
	"sub_recipe_id" uuid,
	"quantity" numeric(14, 4) NOT NULL,
	"unit" "unit" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_lines_one_source" CHECK (("recipe_lines"."ingredient_id" IS NULL) <> ("recipe_lines"."sub_recipe_id" IS NULL)),
	CONSTRAINT "recipe_lines_not_self" CHECK ("recipe_lines"."sub_recipe_id" IS NULL OR "recipe_lines"."sub_recipe_id" <> "recipe_lines"."recipe_id"),
	CONSTRAINT "recipe_lines_quantity_positive" CHECK ("recipe_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "recipe_type" DEFAULT 'dish' NOT NULL,
	"yield_quantity" numeric(14, 4),
	"yield_unit" "unit",
	"portions" numeric(14, 4) DEFAULT '1' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "recipes_name_present" CHECK (btrim("recipes"."name") <> ''),
	CONSTRAINT "recipes_portions_positive" CHECK ("recipes"."portions" > 0),
	CONSTRAINT "recipes_yield_pair" CHECK (("recipes"."yield_quantity" IS NULL) = ("recipes"."yield_unit" IS NULL)),
	CONSTRAINT "recipes_yield_positive" CHECK ("recipes"."yield_quantity" IS NULL OR "recipes"."yield_quantity" > 0),
	CONSTRAINT "recipes_prep_has_yield" CHECK ("recipes"."type" <> 'prep' OR "recipes"."yield_quantity" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"gst_registered" boolean DEFAULT true NOT NULL,
	"target_food_cost_pct" numeric(5, 2) DEFAULT '30' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_single_row" CHECK ("settings"."id" = 1),
	CONSTRAINT "settings_target_range" CHECK ("settings"."target_food_cost_pct" > 0 AND "settings"."target_food_cost_pct" <= 100)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"contact" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "suppliers_name_present" CHECK (btrim("suppliers"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingredient_prices" ADD CONSTRAINT "ingredient_prices_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_prices" ADD CONSTRAINT "ingredient_prices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_preferred_supplier_id_suppliers_id_fk" FOREIGN KEY ("preferred_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_cost_snapshots" ADD CONSTRAINT "menu_cost_snapshots_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_sub_recipe_id_recipes_id_fk" FOREIGN KEY ("sub_recipe_id") REFERENCES "public"."recipes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "allowed_users_email_key" ON "allowed_users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "audit_log_at" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_log_entity" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "ingredient_prices_lookup" ON "ingredient_prices" USING btree ("ingredient_id","effective_date","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ingredients_name_key" ON "ingredients" USING btree (lower("name")) WHERE "ingredients"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "menu_items_menu" ON "menu_items" USING btree ("menu_id","sort_order");--> statement-breakpoint
CREATE INDEX "menu_items_recipe" ON "menu_items" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_lines_recipe" ON "recipe_lines" USING btree ("recipe_id","sort_order");--> statement-breakpoint
CREATE INDEX "recipe_lines_ingredient" ON "recipe_lines" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "recipe_lines_sub_recipe" ON "recipe_lines" USING btree ("sub_recipe_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipes_name_key" ON "recipes" USING btree (lower("name")) WHERE "recipes"."archived_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_name_key" ON "suppliers" USING btree (lower("name")) WHERE "suppliers"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "account_user" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier" ON "verification" USING btree ("identifier");