CREATE TYPE "public"."stock_movement_kind" AS ENUM('count', 'receive', 'waste', 'adjust');--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"kind" "stock_movement_kind" NOT NULL,
	"quantity_delta" numeric(14, 4) NOT NULL,
	"counted_quantity" numeric(14, 4),
	"batch_id" uuid,
	"note" text,
	"actor_email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_count_has_figure" CHECK (("stock_movements"."kind" = 'count') = ("stock_movements"."counted_quantity" IS NOT NULL)),
	CONSTRAINT "stock_movements_counted_valid" CHECK ("stock_movements"."counted_quantity" IS NULL OR "stock_movements"."counted_quantity" >= 0),
	CONSTRAINT "stock_movements_receive_positive" CHECK ("stock_movements"."kind" <> 'receive' OR "stock_movements"."quantity_delta" > 0),
	CONSTRAINT "stock_movements_waste_negative" CHECK ("stock_movements"."kind" <> 'waste' OR "stock_movements"."quantity_delta" < 0)
);
--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "par_level" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_ingredient" ON "stock_movements" USING btree ("ingredient_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_movements_batch" ON "stock_movements" USING btree ("batch_id");--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_par_level_valid" CHECK ("ingredients"."par_level" IS NULL OR "ingredients"."par_level" >= 0);