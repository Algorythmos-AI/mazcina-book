/**
 * Second looks before a price is saved. Pure: the price form uses these to
 * ask "Is this right?" and the tests pin down when it asks.
 */
import DecimalJs from 'decimal.js';
import { convertToBase, packPriceExGst, parseDecimalInput, parseMoneyInput, type Ingredient, type Unit } from './costing';

/** How a price was written on the invoice. Replaces two checkboxes that had to agree. */
export type GstMode = 'free' | 'inc' | 'ex';

export function gstFlags(mode: GstMode): { gstApplicable: boolean; priceIncludesGst: boolean } {
  return { gstApplicable: mode !== 'free', priceIncludesGst: mode === 'inc' };
}

export function gstMode(flags: { gstApplicable: boolean; priceIncludesGst: boolean }): GstMode {
  return !flags.gstApplicable ? 'free' : flags.priceIncludesGst ? 'inc' : 'ex';
}

/** A new price this many times higher (or lower) than the last one gets a second look. */
export const SANITY_FACTOR = 3;
/** A start date further back than this gets a second look: it may never be the price in use. */
export const BACKDATE_DAYS = 30;

/** Cost of one base unit (g, ml or each) from what was typed, or null while it is incomplete or unreadable. */
export function typedUnitCost(
  ingredient: Pick<Ingredient, 'baseUnit' | 'gramsPerEach' | 'gramsPerMl' | 'gramsPerBunch'>,
  typed: { packSize: string; packUnit: Unit; packPrice: string; gst: GstMode },
  gstRegistered: boolean,
): DecimalJs | null {
  const size = parseDecimalInput(typed.packSize);
  const price = parseMoneyInput(typed.packPrice);
  if (size === null || price === null || Number(size) <= 0) return null;
  const inBase = convertToBase(size, typed.packUnit, ingredient.baseUnit, ingredient);
  const exGst = packPriceExGst(
    { ingredientId: '', supplierId: '', packSize: size, packUnit: typed.packUnit, packPrice: price, effectiveDate: '', ...gstFlags(typed.gst) },
    gstRegistered,
  );
  if (!inBase || inBase.lte(0) || !exGst) return null;
  return new DecimalJs(exGst.toString()).div(inBase.toString());
}

function days(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

export type PriceWarning =
  | { kind: 'jump'; ratio: number; higher: boolean }
  | { kind: 'future'; days: number }
  | { kind: 'backdated'; days: number };

export function priceWarnings(input: { next: DecimalJs | null; last: DecimalJs | null; date: string; today: string }): PriceWarning[] {
  const warnings: PriceWarning[] = [];
  if (input.next && input.last && input.next.gt(0) && input.last.gt(0)) {
    const ratio = input.next.div(input.last).toNumber();
    if (ratio >= SANITY_FACTOR) warnings.push({ kind: 'jump', ratio, higher: true });
    else if (ratio <= 1 / SANITY_FACTOR) warnings.push({ kind: 'jump', ratio: 1 / ratio, higher: false });
  }
  if (input.date) {
    const ahead = days(input.today, input.date);
    if (ahead > 0) warnings.push({ kind: 'future', days: ahead });
    else if (-ahead > BACKDATE_DAYS) warnings.push({ kind: 'backdated', days: -ahead });
  }
  return warnings;
}
