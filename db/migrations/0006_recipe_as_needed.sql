ALTER TABLE "recipes" ADD COLUMN "as_needed" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
-- Recipes imported from the kitchen data pack listed these only in their notes, as
-- "Cantidad necesaria (no costeado): a, b (x, y)". Split on commas outside brackets.
UPDATE "recipes" SET "as_needed" = (
  SELECT coalesce(array_agg(btrim(item)), '{}'::text[])
  FROM regexp_split_to_table(
    substring("notes" from '(?n)^Cantidad necesaria \(no costeado\): (.+)$'),
    ',\s*(?![^(]*\))'
  ) AS item
  WHERE btrim(item) <> ''
)
WHERE "notes" ~ '(?n)^Cantidad necesaria \(no costeado\): ';
