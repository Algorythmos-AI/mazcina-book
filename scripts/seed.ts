/**
 * Idempotent base data: the settings row and the first owner.
 * Usage: tsx scripts/seed.ts <owner-email>
 * Refuses to run against production unless --production is passed, and asks
 * before writing (--yes to skip).
 */
import { config } from 'dotenv';
import { confirmTarget } from './target';
config({ path: '.env.local' });

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Usage: tsx scripts/seed.ts <owner-email>');
  if (process.env.VERCEL_ENV === 'production' && !args.includes('--production')) {
    throw new Error('Refusing to seed production without --production');
  }
  await confirmTarget(`seed settings and the owner ${email}`);
  const { db, schema } = await import('../db');
  const { sql } = await import('drizzle-orm');
  await db.insert(schema.settings).values({ id: 1 }).onConflictDoNothing();
  const existing = await db.select().from(schema.allowedUsers).where(sql`lower(${schema.allowedUsers.email}) = ${email}`);
  if (existing.length === 0) await db.insert(schema.allowedUsers).values({ email, role: 'owner' });
  const count = await db.$count(schema.allowedUsers);
  console.log(`settings ok; allow-list has ${count} user(s)`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
