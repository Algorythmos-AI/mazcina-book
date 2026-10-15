/**
 * Gift card codes. A code is the only thing a customer needs to spend a card,
 * so it is treated like a password: generated from a secure source, looked up
 * by a keyed hash, and stored only in encrypted form (so the email can be
 * re-sent). The key lives in the environment, never in the database.
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, randomInt } from 'node:crypto';

/** No I, L, O, 0 or 1: nothing that can be misread from an email or over the phone. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 16;

export const MIN_AMOUNT_CENTS = 2500;
export const MAX_AMOUNT_CENTS = 50000;
export const PRESET_AMOUNTS_CENTS = [5000, 10000, 15000, 20000];
export const EXPIRY_YEARS = 3;

export function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** "abcd-efgh jkmn pqrs" -> "ABCDEFGHJKMNPQRS", or null if it cannot be a code. */
export function normaliseCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** "ABCD-EFGH-JKMN-PQRS" */
export function formatCode(code: string): string {
  return code.match(/.{1,4}/g)!.join('-');
}

function subkey(key: string, purpose: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(key)) throw new Error('GIFT_CODE_KEY must be 64 hex characters');
  return Buffer.from(hkdfSync('sha256', Buffer.from(key, 'hex'), Buffer.alloc(0), `mazcina-gift-card:${purpose}`, 32));
}

/** A buyer's IP address, hashed with its own subkey: enough to count checkouts per address, not to recover it. */
export function hashClientIp(ip: string, key: string): string {
  return createHmac('sha256', subkey(key, 'client-ip')).update(ip.trim()).digest('hex');
}

export function hashCode(code: string, key: string): string {
  return createHmac('sha256', subkey(key, 'lookup')).update(code).digest('hex');
}

export function encryptCode(code: string, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', subkey(key, 'storage'), iv);
  const body = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString('base64url')).join('.');
}

export function decryptCode(stored: string, key: string): string {
  const [iv, tag, body] = stored.split('.').map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', subkey(key, 'storage'), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

/** Whole dollars between the limits, from what the buyer typed. Returns cents or null. */
export function parseAmount(raw: string): number | null {
  const text = raw.trim().replace(/^\$/, '');
  if (!/^\d{1,4}(\.00?)?$/.test(text)) return null;
  const cents = Number.parseInt(text, 10) * 100;
  return cents >= MIN_AMOUNT_CENTS && cents <= MAX_AMOUNT_CENTS ? cents : null;
}

/** Last usable day: the purchase date plus three years (29 Feb rolls back to 28 Feb). */
export function expiryFor(purchasedOn: string): string {
  const [y, m, d] = purchasedOn.split('-').map(Number);
  const year = y + EXPIRY_YEARS;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const day = m === 2 && d === 29 && !leap ? 28 : d;
  return `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
