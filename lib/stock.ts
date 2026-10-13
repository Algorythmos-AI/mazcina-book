/**
 * Stock on hand. Pure functions: no database, no clock.
 *
 * Stock is kept in each ingredient's base unit (g, ml or each), as bought:
 * a 20 kg sack of potatoes is 20 000 g of stock, peel and all. It moves only
 * when someone records something: a delivery, waste, or a stocktake count.
 * Nothing is taken off automatically when dishes are sold, so the figure is
 * only as fresh as the last count.
 */
import DecimalJs from 'decimal.js';
import type { BaseUnit, Unit } from './costing';

const D = DecimalJs.clone({ precision: 40, rounding: DecimalJs.ROUND_HALF_UP });
type Numeric = string | number | DecimalJs;

export type StockStatus = 'uncounted' | 'out' | 'low' | 'ok' | 'no_par';

export interface StockLine {
  /** Current quantity in base units; null when nothing has ever been recorded. */
  onHand: DecimalJs | null;
  status: StockStatus;
  /** How much to order to get back to par, in base units; null when not needed or no par is set. */
  toOrder: DecimalJs | null;
  /** onHand at the current unit cost, before GST; null when either is unknown. */
  value: DecimalJs | null;
}

export function stockLine(input: { onHand: Numeric | null; parLevel: Numeric | null; unitCost: Numeric | null }): StockLine {
  const onHand = input.onHand === null ? null : new D(input.onHand);
  const par = input.parLevel === null ? null : new D(input.parLevel);
  const value = onHand && input.unitCost !== null ? onHand.times(input.unitCost) : null;

  if (!onHand) return { onHand: null, status: 'uncounted', toOrder: par && par.gt(0) ? par : null, value: null };
  const short = par && par.gt(0) && onHand.lt(par) ? par.minus(onHand) : null;
  const status: StockStatus = onHand.lte(0) ? 'out' : !par || par.lte(0) ? 'no_par' : short ? 'low' : 'ok';
  return { onHand, status, toOrder: short, value };
}

/** The change a stocktake count makes: what was counted minus what the books said. */
export function countDelta(counted: Numeric, onHand: Numeric | null): DecimalJs {
  return new D(counted).minus(onHand ?? 0);
}

/** "12.5 kg", "750 g", "3 l", "24 each": the largest unit that reads naturally. */
export function formatStock(quantity: Numeric, baseUnit: BaseUnit): string {
  const q = new D(quantity);
  const show = (value: DecimalJs, unit: string) => `${value.toDecimalPlaces(2).toString()} ${unit}`;
  if (baseUnit === 'each') return show(q, 'each');
  const big = baseUnit === 'g' ? 'kg' : 'l';
  return q.abs().gte(1000) ? show(q.div(1000), big) : show(q, baseUnit);
}

/** The unit a chef would count this ingredient in by default. */
export function countUnit(baseUnit: BaseUnit): Unit {
  return baseUnit === 'g' ? 'kg' : baseUnit === 'ml' ? 'l' : 'each';
}
