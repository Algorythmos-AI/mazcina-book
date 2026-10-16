# Kitchen data

The restaurant's real recipes, ingredients and supplier prices, kept as one versioned file:
`mazcina-kitchen-data.json` (format `mazcina-kitchen-data`, version 1). It is loaded into the database
by an owner from **Team → Kitchen data** (production), or with `npx tsx scripts/import-kitchen-data.ts --apply`
(the dev database in `.env.local`).

Loading is **additive and safe to repeat**:
- missing suppliers, ingredients and recipes are added;
- anything already in the app is left exactly as it is;
- a price is added only if the same invoice line is not already there;
- a menu item is linked to its recipe only if it has none.

Once loaded, the **app is the source of truth**: the kitchen edits recipes and adds prices there, and the nightly
backup keeps it. This file is the starting point and the audit trail of where each number came from.

## What is in it (16 Oct 2026)

| | |
|---|---|
| Sources | *Manual de Recetas de Cocina Mazcina*, working version August 2026 (54 pages, sent by Nacha); Bidfood invoice I71906625.BOT (15 Oct 2026); Mickey's Fruit & Veg invoice INV-23412 (31 Aug 2026) |
| Recipes | 67: 33 bases (sauces, doughs, fillings…) and 34 dishes, including the three cocktail empanadas and five sandwich extras |
| Ingredients | 113, in English (the supplier's language), with the manual's Spanish word kept as `nameEs` |
| Prices | 14 invoice lines (plus tap water at $0) |
| Menu links | 34 of the 43 menu items |
| Open questions | 15, shown on the Kitchen data page |

## Rules followed

- **Nothing invented.** Quantities are the manual's. A range becomes its midpoint and is marked approximate; the
  original wording is kept in the recipe notes. Spoon or cup measures are converted only where the manual gives the
  grams or ml. Items with no amount ("cantidad necesaria") are listed in the notes, not costed.
- **Estimated yields are labelled.** The manual rarely states what a batch of a base makes. Those yields are worked
  out from the ingredients (or from the manual's own instructions, e.g. "reducir a la mitad") and carry
  `yieldEstimated: true`. The app shows any cost that depends on them as **Estimate** until someone weighs a batch
  and unticks "Estimated, not weighed yet" on the recipe.
- **Prices are as invoiced**, with the supplier's description and product code, ex GST. Lines whose pack size is not
  on the invoice (a "bag" of potatoes, a "box" of lemons) or sold by the bunch are left out until the size is known.
- **The method stays in Spanish**, as the kitchen team wrote it: use, yield, equipment, steps, critical points and
  pending checks are stored in each recipe's notes.
- **No supplier bank or account details** are copied from the invoices.

## Updating it

`build/` holds the faithful transcription of the manual (`extract-*.json`, see `build/EXTRACT-SCHEMA.md`) and
`build/build_pack.py`, which applies every mapping decision (Spanish wording → ingredient, splits, overrides,
yields, prices, menu links) and writes the pack:

```bash
python3 data/kitchen/build/build_pack.py data/kitchen/build data/kitchen/mazcina-kitchen-data.json
npx vitest run lib/kitchen-data        # the pack must pass every check
```

For day-to-day changes (a new price list, a corrected quantity) use the app instead: **Ingredients → Import prices**
and the recipe screens. Rebuild this file only for a new edition of the manual.
