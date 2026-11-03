import DecimalJs from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { gstFlags, gstMode, priceWarnings, typedUnitCost } from './price-check';

const lemon = { baseUnit: 'g' as const, gramsPerEach: 120 };
const d = (v: string) => new DecimalJs(v);

describe('typedUnitCost', () => {
  it('works out the cost per gram as it is typed, with $ and GST handled', () => {
    expect(typedUnitCost(lemon, { packSize: '5', packUnit: 'kg', packPrice: '$22.50', gst: 'free' }, true)?.toString()).toBe('0.0045');
    expect(typedUnitCost(lemon, { packSize: '1', packUnit: 'kg', packPrice: '11', gst: 'inc' }, true)?.toString()).toBe('0.01');
    expect(typedUnitCost(lemon, { packSize: '10', packUnit: 'each', packPrice: '12', gst: 'free' }, true)?.toString()).toBe('0.01');
  });

  it('stays empty until the numbers make sense', () => {
    expect(typedUnitCost(lemon, { packSize: '', packUnit: 'kg', packPrice: '22', gst: 'free' }, true)).toBeNull();
    expect(typedUnitCost(lemon, { packSize: '5', packUnit: 'kg', packPrice: '22,50,1', gst: 'free' }, true)).toBeNull();
    expect(typedUnitCost({ baseUnit: 'g' }, { packSize: '5', packUnit: 'each', packPrice: '5', gst: 'free' }, true)).toBeNull();
  });
});

describe('priceWarnings', () => {
  const base = { date: '2026-11-03', today: '2026-11-03' };
  it('asks when a price is three times higher or lower than the last', () => {
    expect(priceWarnings({ ...base, next: d('0.045'), last: d('0.0045') })).toEqual([{ kind: 'jump', ratio: 10, higher: true }]);
    expect(priceWarnings({ ...base, next: d('0.001'), last: d('0.0045') })[0]).toMatchObject({ kind: 'jump', higher: false });
    expect(priceWarnings({ ...base, next: d('0.009'), last: d('0.0045') })).toEqual([]);
    expect(priceWarnings({ ...base, next: d('0.009'), last: null })).toEqual([]);
  });

  it('asks about a date in the future or long ago', () => {
    expect(priceWarnings({ next: null, last: null, date: '2026-11-10', today: '2026-11-03' })).toEqual([{ kind: 'future', days: 7 }]);
    expect(priceWarnings({ next: null, last: null, date: '2026-09-01', today: '2026-11-03' })).toEqual([{ kind: 'backdated', days: 63 }]);
    expect(priceWarnings({ next: null, last: null, date: '2026-10-20', today: '2026-11-03' })).toEqual([]);
  });
});

describe('GST choice', () => {
  it('round-trips the three ways a price can be written', () => {
    for (const mode of ['free', 'inc', 'ex'] as const) expect(gstMode(gstFlags(mode))).toBe(mode);
  });
});
