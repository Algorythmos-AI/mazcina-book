ALTER TYPE "public"."unit" ADD VALUE 'bunch';--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "grams_per_bunch" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_grams_per_bunch_positive" CHECK ("ingredients"."grams_per_bunch" IS NULL OR "ingredients"."grams_per_bunch" > 0);