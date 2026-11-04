/**
 * Saves that must happen once even when the phone sends them twice: a tap
 * that timed out but did reach the server, then a second tap on Save.
 */
import { lt } from 'drizzle-orm';
import { db, schema } from '@/db';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const KEEP_KEYS_DAYS = 30;

/**
 * Claims `key` for this save, inside its transaction. Returns false when the
 * same key was already used, meaning the save already went through. No key,
 * no check (older screens still open on a phone).
 */
export async function claimOnce(tx: Tx, key: string | null | undefined, action: string): Promise<boolean> {
  if (!key) return true;
  const claimed = await tx.insert(schema.idempotencyKeys).values({ key, action }).onConflictDoNothing().returning({ key: schema.idempotencyKeys.key });
  return claimed.length > 0;
}

export async function clearOldKeys(now = new Date()): Promise<void> {
  await db.delete(schema.idempotencyKeys).where(lt(schema.idempotencyKeys.createdAt, new Date(now.getTime() - KEEP_KEYS_DAYS * 86_400_000)));
}
