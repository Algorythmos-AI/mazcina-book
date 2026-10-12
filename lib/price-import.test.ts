import { describe, expect, it } from 'vitest';
import { matchKey, MAX_IMPORT_ROWS, parsePriceList } from './price-import';

const one = (text: string) => parsePriceList(text).rows[0];

describe('parsePriceList', () => {
  it('reads tab-separated rows pasted from a spreadsheet, without a heading', () => {
    const { rows, error } = parsePriceList('Lemon\tHarris Farm\t5\tkg\t22,50\nOlive oil\tHarris Farm\t4\tl\t$44.00\tyes\tyes');
    expect(error).toBeNull();
    expect(rows).toEqual([
      { line: 1, ingredient: 'Lemon', supplier: 'Harris Farm', packSize: '5', packUnit: 'kg', packPrice: '22.5', gstApplicable: false, priceIncludesGst: false, errors: [] },
      { line: 2, ingredient: 'Olive oil', supplier: 'Harris Farm', packSize: '4', packUnit: 'l', packPrice: '44', gstApplicable: true, priceIncludesGst: true, errors: [] },
    ]);
  });

  it('follows a heading row in any column order', () => {
    const row = one('Price,Unit,Item,Pack size,Supplier,Inc GST,GST\n56.00,kg,Octopus,2,Fish Co,no,no');
    expect(row).toMatchObject({ ingredient: 'Octopus', supplier: 'Fish Co', packSize: '2', packUnit: 'kg', packPrice: '56', errors: [] });
    expect(row.line).toBe(2);
  });

  it('handles quoted commas and semicolons', () => {
    expect(one('"Tomato, cherry","Harris Farm",1,kg,8.90')).toMatchObject({ ingredient: 'Tomato, cherry', packPrice: '8.9', errors: [] });
    expect(one('Cream;Dairy Co;1;l;4,20')).toMatchObject({ ingredient: 'Cream', packPrice: '4.2', errors: [] });
  });

  it('accepts the size and unit in one cell, common unit spellings and a bare unit', () => {
    expect(one('Flour\tMill\t12.5kg\t\t18')).toMatchObject({ packSize: '12.5', packUnit: 'kg', errors: [] });
    expect(one('Milk\tDairy\t2\tLitres\t3.10')).toMatchObject({ packUnit: 'l', errors: [] });
    expect(one('Eggs\tFarm\t180\tea\t65')).toMatchObject({ packUnit: 'each', errors: [] });
    expect(one('Salmon\tFish Co\t\tkg\t38')).toMatchObject({ packSize: '1', packUnit: 'kg', errors: [] });
  });

  it('skips blank lines but keeps the original line numbers', () => {
    const { rows } = parsePriceList('\nLemon\tA\t5\tkg\t10\n\n\nLime\tA\t1\tkg\t9\n');
    expect(rows.map((r) => r.line)).toEqual([2, 5]);
  });

  it('never keeps GST-inclusive on an item that has no GST', () => {
    expect(one('Lemon\tA\t5\tkg\t10\tno\tyes')).toMatchObject({ gstApplicable: false, priceIncludesGst: false, errors: [] });
  });

  it('reports what is wrong with a row instead of guessing', () => {
    const errors = (text: string) => one(text).errors.join(' | ');
    expect(errors('\tA\t5\tkg\t10')).toContain('Ingredient name is missing');
    expect(errors('Lemon\tA\t5\tkg\t')).toContain('Price is missing');
    expect(errors('Lemon\tA\t5\tkg\tabc')).toContain('not a clear number');
    expect(errors('Lemon\tA\t5\tkg\t1,500')).toContain('not a clear number');
    expect(errors('Lemon\tA\t5\tbox\t10')).toContain('"box" is not one of');
    expect(errors('Lemon\tA\t5\t\t10')).toContain('Unit is missing');
    expect(errors('Lemon\tA\t0\tkg\t10')).toContain('more than zero');
    expect(errors('Lemon\tA\tfive\tkg\t10')).toContain('Pack size "five"');
    expect(errors('Lemon\tA\t5\tkg\t10\tmaybe')).toContain('GST: use yes or no');
    expect(errors('Lemon\tA\t5box\t\t10')).toContain('"box" is not one of');
  });

  it('flags a decimal comma that broke a comma-separated row', () => {
    expect(one('Lemon,A,5,kg,22,50,no,no').errors.join(' ')).toContain('Too many columns');
  });

  it('rejects an empty paste, a heading on its own, and an oversized paste', () => {
    expect(parsePriceList('  \n ').error).toBe('Paste your price list first');
    expect(parsePriceList('Ingredient,Supplier,Size,Unit,Price').error).toBe('Only a heading row was found');
    const big = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Item ${i}\tA\t1\tkg\t1`).join('\n');
    expect(parsePriceList(big).error).toContain('Too many rows');
  });
});

describe('matchKey', () => {
  it('ignores case and extra spaces', () => {
    expect(matchKey('  Olive   OIL ')).toBe('olive oil');
  });
});
