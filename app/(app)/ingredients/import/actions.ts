'use server';

import DecimalJs from 'decimal.js';
import { revalidatePath } from 'next/cache';
import { db, schema } from '@/db';
import { audit, Invalid, mutate } from '@/lib/action-helpers';
import { convertToBase, ingredientUnitCost, packPriceExGst, type Unit } from '@/lib/costing';
import { todaySydney, unitPrice } from '@/lib/format';
import { matchKey, parsePriceList } from '@/lib/price-import';
import { contextFrom, loadCostingData } from '@/lib/queries';
import { requireRole } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

export interface ImportPreviewRow {
  line: number;
  ingredient: string;
  supplier: string;
  pack: string;
  /** Current and new cost at kitchen scale, e.g. "$4.50 / kg". */
  before: string | null;
  after: string | null;
  /** Percentage change in unit cost, rounded to one decimal; null when there was no price before. */
  changePct: string | null;
  errors: string[];
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  ready: number;
  failed: number;
  warnings: string[];
}

interface ResolvedRow {
  ingredientId: string;
  supplierId: string;
  packSize: string;
  packUnit: Unit;
  packPrice: string;
  gstApplicable: boolean;
  priceIncludesGst: boolean;
}

const MAX_TEXT = 200_000;

/** Parses the paste and matches every row to an existing ingredient and supplier. Never creates either. */
async function resolve(text: string): Promise<{ preview: ImportPreview; resolved: ResolvedRow[] }> {
  if (text.length > MAX_TEXT) throw new Invalid('That is too much text to import at once');
  const parsed = parsePriceList(text);
  if (parsed.error) throw new Invalid(parsed.error);

  const data = await loadCostingData();
  const ctx = contextFrom(data);
  const ingredients = new Map(data.ingredients.filter((i) => !i.archived).map((i) => [matchKey(i.name), i]));
  const suppliers = new Map(data.suppliers.filter((s) => !s.archived).map((s) => [matchKey(s.name), s]));
  const supplierNames = new Map(data.suppliers.map((s) => [s.id, s.name]));
  const seen = new Set<string>();
  const resolved: ResolvedRow[] = [];

  const rows = parsed.rows.map((row): ImportPreviewRow => {
    const errors = [...row.errors];
    const ingredient = row.ingredient ? ingredients.get(matchKey(row.ingredient)) : undefined;
    if (row.ingredient && !ingredient) errors.push(`No ingredient called "${row.ingredient}". Add it first, or fix the spelling.`);

    let supplierId: string | null = null;
    if (row.supplier) {
      supplierId = suppliers.get(matchKey(row.supplier))?.id ?? null;
      if (!supplierId) errors.push(`No supplier called "${row.supplier}". Add it first, or fix the spelling.`);
    } else if (ingredient) {
      supplierId = ingredient.preferredSupplierId ?? null;
      if (!supplierId) errors.push('Supplier is missing and this ingredient has no preferred supplier');
    }

    let before: string | null = null;
    let after: string | null = null;
    let changePct: string | null = null;

    if (ingredient && row.packSize && row.packUnit && row.packPrice) {
      const packInBase = convertToBase(row.packSize, row.packUnit, ingredient.baseUnit, ingredient);
      if (!packInBase) {
        errors.push(`${ingredient.name} is measured in ${ingredient.baseUnit}; to price it per ${row.packUnit} it needs a conversion first`);
      } else {
        const exGst = packPriceExGst({
          ingredientId: ingredient.id,
          supplierId: supplierId ?? '',
          packSize: row.packSize,
          packUnit: row.packUnit,
          packPrice: row.packPrice,
          gstApplicable: row.gstApplicable,
          priceIncludesGst: row.priceIncludesGst,
          effectiveDate: data.asOf,
        }, data.settings.gstRegistered);
        if (exGst) {
          const next = exGst.div(packInBase);
          after = unitPrice(next, ingredient.baseUnit);
          const current = ingredientUnitCost(ingredient.id, ctx);
          if (current.ok) {
            before = unitPrice(current.value, ingredient.baseUnit);
            if (current.value.gt(0)) changePct = next.minus(current.value).div(current.value).times(100).toFixed(1, DecimalJs.ROUND_HALF_UP);
          }
        }
      }
    }

    if (ingredient && supplierId) {
      const key = `${ingredient.id}:${supplierId}`;
      if (seen.has(key)) errors.push('This ingredient and supplier appear twice in the list');
      seen.add(key);
    }

    if (errors.length === 0 && ingredient && supplierId && row.packSize && row.packUnit && row.packPrice) {
      resolved.push({
        ingredientId: ingredient.id,
        supplierId,
        packSize: row.packSize,
        packUnit: row.packUnit,
        packPrice: row.packPrice,
        gstApplicable: row.gstApplicable,
        priceIncludesGst: row.priceIncludesGst,
      });
    }

    return {
      line: row.line,
      ingredient: ingredient?.name ?? row.ingredient,
      supplier: (supplierId && supplierNames.get(supplierId)) || row.supplier,
      pack: row.packSize && row.packUnit && row.packPrice ? `$${new DecimalJs(row.packPrice).toFixed(2)} for ${row.packSize} ${row.packUnit}` : '',
      before,
      after,
      changePct,
      errors,
    };
  });

  const failed = rows.filter((r) => r.errors.length > 0).length;
  return { preview: { rows, ready: rows.length - failed, failed, warnings: parsed.warnings }, resolved };
}

/** Shows what an import would do. Changes nothing. */
export async function previewPriceImport(text: string): Promise<ActionResult<ImportPreview>> {
  await requireRole('owner', 'chef');
  return mutate(async () => (await resolve(String(text ?? ''))).preview);
}

/** Saves every row as a new price dated today, or nothing at all if any row has a problem. */
export async function applyPriceImport(text: string): Promise<ActionResult<{ saved: number }>> {
  const result = await mutate(async (user) => {
    const { preview, resolved } = await resolve(String(text ?? ''));
    if (preview.failed > 0) throw new Invalid(`${preview.failed} row${preview.failed === 1 ? '' : 's'} still need fixing. Nothing was saved.`);
    if (resolved.length === 0) throw new Invalid('There is nothing to save');
    const effectiveDate = todaySydney();
    await db.transaction(async (tx) => {
      await tx.insert(schema.ingredientPrices).values(resolved.map((r) => ({ ...r, effectiveDate, createdBy: user.email })));
      await audit(tx, user, 'import', 'prices', effectiveDate, { after: { name: resolved.length === 1 ? '1 price' : `${resolved.length} prices`, rows: resolved.length } });
    });
    return { saved: resolved.length };
  });
  if (result.ok) revalidatePath('/', 'layout');
  return result;
}
