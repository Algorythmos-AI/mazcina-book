import { describe, expect, it } from 'vitest';
import { nameKey, nearMatches } from './names';

describe('nameKey', () => {
  it('treats plurals, case and spacing as the same name', () => {
    expect(nameKey('Lemons')).toBe(nameKey('lemon'));
    expect(nameKey('Tomatoes')).toBe(nameKey('Tomato'));
    expect(nameKey('Cherries')).toBe(nameKey('cherry'));
    expect(nameKey('Olive  Oil')).toBe(nameKey('olive oil'));
    expect(nameKey('Red onions, diced')).toBe(nameKey('red onion diced'));
  });
});

describe('nearMatches', () => {
  const list = ['Lemon', 'Chilli, fresh', 'Basil', 'Olive oil', 'Gouda cheese'];
  it('finds the same ingredient typed another way', () => {
    expect(nearMatches('Lemons', list)).toEqual(['Lemon']);
    expect(nearMatches('chili, fresh', list)).toEqual(['Chilli, fresh']);
    expect(nearMatches('olive  OIL', list)).toEqual(['Olive oil']);
  });

  it('leaves genuinely different names alone', () => {
    expect(nearMatches('Basin', list)).toEqual([]);
    expect(nearMatches('Lime', list)).toEqual([]);
    expect(nearMatches('Cheddar cheese', list)).toEqual([]);
    expect(nearMatches('Lemon', list)).toEqual([]);
  });
});
