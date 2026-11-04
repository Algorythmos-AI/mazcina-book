-- Preps were created with a made-up yield of 1 kg that read as measured.
-- Those never saved since (version 1) still have it, so mark them as estimates.
UPDATE "recipes"
SET "yield_estimated" = true
WHERE "type" = 'prep'
  AND "yield_quantity" = 1
  AND "yield_unit" = 'kg'
  AND "version" = 1
  AND "yield_estimated" = false;
