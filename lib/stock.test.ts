import { describe, expect, it } from 'vitest';
import { countDelta, countUnit, formatStock, stockLine } from './stock';

const line = (onHand: string | null, parLevel: string | null, unitCost: string | null = '0.0015') => {
  const l = stockLine({ onHand, parLevel, unitCost });
  return { status: l.status, toOrder: l.toOrder?.toString() ?? null, value: l.value?.toString() ?? null };
};

describe('stockLine', () => {
  it('is ok at or above par, low below it, out at zero', () => {
    expect(line('20000', '10000')).toEqual({ status: 'ok', toOrder: null, value: '30' });
    expect(line('10000', '10000')).toEqual({ status: 'ok', toOrder: null, value: '15' });
    expect(line('4000', '10000')).toEqual({ status: 'low', toOrder: '6000', value: '6' });
    expect(line('0', '10000')).toEqual({ status: 'out', toOrder: '10000', value: '0' });
  });

  it('never calls something counted when nothing was ever recorded', () => {
    expect(line(null, '10000')).toEqual({ status: 'uncounted', toOrder: '10000', value: null });
    expect(line(null, null)).toEqual({ status: 'uncounted', toOrder: null, value: null });
  });

  it('has nothing to say about ordering without a par level', () => {
    expect(line('500', null)).toEqual({ status: 'no_par', toOrder: null, value: '0.75' });
    expect(line('500', '0')).toEqual({ status: 'no_par', toOrder: null, value: '0.75' });
  });

  it('gives no value without a price, but still a status', () => {
    expect(line('4000', '10000', null)).toEqual({ status: 'low', toOrder: '6000', value: null });
  });

  it('keeps exact decimals', () => {
    expect(stockLine({ onHand: '0.1', parLevel: '0.3', unitCost: '0.2' })).toMatchObject({ status: 'low' });
    expect(stockLine({ onHand: '0.1', parLevel: '0.3', unitCost: '0.2' }).toOrder?.toString()).toBe('0.2');
    expect(stockLine({ onHand: '0.1', parLevel: null, unitCost: '0.2' }).value?.toString()).toBe('0.02');
  });
});

describe('countDelta', () => {
  it('is the difference between the count and the books', () => {
    expect(countDelta('12000', '15000').toString()).toBe('-3000');
    expect(countDelta('15000', '12000').toString()).toBe('3000');
    expect(countDelta('5000', null).toString()).toBe('5000');
    expect(countDelta('0', '250').toString()).toBe('-250');
    expect(countDelta('7', '7').toString()).toBe('0');
  });
});

describe('formatStock', () => {
  it('reads naturally', () => {
    expect(formatStock('12500', 'g')).toBe('12.5 kg');
    expect(formatStock('750', 'g')).toBe('750 g');
    expect(formatStock('1000', 'ml')).toBe('1 l');
    expect(formatStock('24', 'each')).toBe('24 each');
    expect(formatStock('1333.333', 'g')).toBe('1.33 kg');
    expect(formatStock('-2500', 'g')).toBe('-2.5 kg');
    expect(formatStock('0', 'ml')).toBe('0 ml');
  });
  it('picks a counting unit', () => {
    expect([countUnit('g'), countUnit('ml'), countUnit('each')]).toEqual(['kg', 'l', 'each']);
  });
});
