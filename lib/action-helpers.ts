import 'server-only';
import DecimalJs from 'decimal.js';
import { z } from 'zod';
import { db, schema } from '@/db';
import { parseDecimalInput } from '@/lib/costing';
import { Invalid } from '@/lib/invalid';
import { requireRole, type CurrentUser } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

/** Shared plumbing for server actions: input reading, validation, role check, error mapping, audit. */

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export { Invalid };

export const uuid = z.uuid();
export const unit = z.enum(['g', 'kg', 'ml', 'l', 'each']);
export const baseUnit = z.enum(['g', 'ml', 'each']);
export const isoDate = z.iso.date();

export function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export function required(raw: string, label: string, max = 120): string {
  // Single-spaced, so "Harris  Farm" and "Harris Farm" cannot both exist.
  const value = raw.replace(/\s+/g, ' ').trim();
  if (!value) throw new Invalid(`${label} is required`);
  if (value.length > max) throw new Invalid(`${label} is too long`);
  return value;
}

export function parse<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Invalid(`${label} is not valid`);
  return result.data;
}

/** A typed number: dot or comma decimals, never a guess. Returns a normalised string or null when empty. */
export function decimal(
  raw: string,
  label: string,
  opts: { min?: number; max?: number; minExclusive?: boolean; optional?: boolean; places?: number } = {},
): string | null {
  if (!raw) {
    if (opts.optional) return null;
    throw new Invalid(`${label} is required`);
  }
  const parsed = parseDecimalInput(raw);
  if (parsed === null) throw new Invalid(`${label}: type a number like 1500 or 1.5`);
  const d = new DecimalJs(parsed);
  const min = opts.min ?? 0;
  if (opts.minExclusive ? d.lte(min) : d.lt(min)) {
    throw new Invalid(`${label} must be ${opts.minExclusive ? 'more than' : 'at least'} ${min}`);
  }
  if (opts.max !== undefined && d.gt(opts.max)) throw new Invalid(`${label} must be at most ${opts.max}`);
  if (d.decimalPlaces() > (opts.places ?? 4)) throw new Invalid(`${label} has too many decimal places`);
  if (d.gte(1e9)) throw new Invalid(`${label} is too large`);
  return d.toString();
}

function pgError(error: unknown): { code: string; constraint?: string } | undefined {
  for (let e = error as { code?: unknown; constraint?: unknown; cause?: unknown } | undefined, i = 0; e && i < 4; e = e.cause as typeof e, i++) {
    if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) {
      return { code: e.code, constraint: typeof e.constraint === 'string' ? e.constraint : undefined };
    }
  }
  return undefined;
}

/** Runs a mutation for a chef or owner and turns expected failures into a message for the form. */
export async function mutate<T>(fn: (user: CurrentUser) => Promise<T>): Promise<ActionResult<T>> {
  const user = await requireRole('owner', 'chef');
  try {
    return { ok: true, data: await fn(user) };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: error.message };
    const { code, constraint } = pgError(error) ?? {};
    if (constraint === 'menus_one_live_seasonal') return { ok: false, error: 'Another seasonal menu went live at the same moment. Reload the page and try again.' };
    if (code === '23505') return { ok: false, error: 'That name is already used' };
    if (code === '23503') return { ok: false, error: 'This is still used somewhere else' };
    if (code === '23514') return { ok: false, error: 'One of the values is out of range' };
    if (code === '22003') return { ok: false, error: 'That number is too big. Check it and try again.' };
    console.error('[action] unexpected failure', error);
    return { ok: false, error: 'Something went wrong. Nothing was saved, please try again.' };
  }
}

export async function audit(
  tx: Tx,
  user: CurrentUser,
  action: string,
  entity: string,
  entityId: string,
  change: { before?: unknown; after?: unknown } = {},
) {
  await tx.insert(schema.auditLog).values({
    actorEmail: user.email,
    action,
    entity,
    entityId,
    before: change.before ?? null,
    after: change.after ?? null,
  });
}
