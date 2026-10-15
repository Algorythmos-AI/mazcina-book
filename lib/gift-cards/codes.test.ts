import { GIFT_CODE_PATTERN } from './code-pattern';
import { describe, expect, it } from 'vitest';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  decryptCode,
  encryptCode,
  expiryFor,
  formatCode,
  generateCode,
  hashCode,
  normaliseCode,
  parseAmount,
} from './codes';

const KEY = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

describe('the scanner pattern', () => {
  it('accepts exactly what the code generator produces', () => {
    expect(GIFT_CODE_PATTERN.source).toBe(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
  });
});

describe('codes', () => {
  it('generates 16 unambiguous characters, different every time', () => {
    const codes = new Set(Array.from({ length: 500 }, generateCode));
    expect(codes.size).toBe(500);
    for (const code of codes) {
      expect(code).toHaveLength(16);
      expect([...code].every((ch) => CODE_ALPHABET.includes(ch))).toBe(true);
    }
    expect(CODE_ALPHABET).not.toMatch(/[ILO01]/);
  });

  it('accepts a code however it is typed and rejects anything else', () => {
    expect(normaliseCode('abcd-efgh jkmn-pqrs')).toBe('ABCDEFGHJKMNPQRS');
    expect(normaliseCode(' ABCDEFGHJKMNPQRS ')).toBe('ABCDEFGHJKMNPQRS');
    for (const bad of ['', 'ABCD', 'ABCDEFGHJKMNPQRSX', 'ABCDEFGHJKMNPQR0', 'ABCDEFGHJKMNPQRI', 'ABCD_EFGH_JKMN_PQRS', "' OR 1=1 --     "]) {
      expect(normaliseCode(bad), bad).toBeNull();
    }
    expect(formatCode('ABCDEFGHJKMNPQRS')).toBe('ABCD-EFGH-JKMN-PQRS');
  });

  it('hashes the same code the same way, and differently under another key', () => {
    expect(hashCode('ABCDEFGHJKMNPQRS', KEY)).toBe(hashCode('ABCDEFGHJKMNPQRS', KEY));
    expect(hashCode('ABCDEFGHJKMNPQRS', KEY)).not.toBe(hashCode('ABCDEFGHJKMNPQRT', KEY));
    expect(hashCode('ABCDEFGHJKMNPQRS', KEY)).not.toBe(hashCode('ABCDEFGHJKMNPQRS', OTHER));
    expect(hashCode('ABCDEFGHJKMNPQRS', KEY)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('encrypts so only the right key reads it back, and never the same way twice', () => {
    const stored = encryptCode('ABCDEFGHJKMNPQRS', KEY);
    expect(stored).not.toContain('ABCDEFGHJKMNPQRS');
    expect(encryptCode('ABCDEFGHJKMNPQRS', KEY)).not.toBe(stored);
    expect(decryptCode(stored, KEY)).toBe('ABCDEFGHJKMNPQRS');
    expect(() => decryptCode(stored, OTHER)).toThrow();
    const [iv, tag, body] = stored.split('.');
    expect(() => decryptCode([iv, tag, `${body}AA`].join('.'), KEY)).toThrow();
  });

  it('refuses a malformed key', () => {
    expect(() => hashCode('ABCDEFGHJKMNPQRS', 'short')).toThrow('GIFT_CODE_KEY');
  });
});

describe('parseAmount', () => {
  it('takes whole dollars from $25 to $500', () => {
    expect(parseAmount('25')).toBe(2500);
    expect(parseAmount(' $100 ')).toBe(10000);
    expect(parseAmount('500.00')).toBe(50000);
    for (const bad of ['', '24', '501', '50.50', '1e2', '-50', '0x40', '100 ', 'abc', '99999999999'].filter((b) => b !== '100 ')) {
      expect(parseAmount(bad), bad).toBeNull();
    }
  });
});

describe('expiryFor', () => {
  it('is three years on, to the day', () => {
    expect(expiryFor('2026-10-13')).toBe('2029-10-13');
    expect(expiryFor('2028-02-29')).toBe('2031-02-28');
    expect(expiryFor('2025-02-28')).toBe('2028-02-28');
  });
});
