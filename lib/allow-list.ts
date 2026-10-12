import { sql } from 'drizzle-orm';
import { db, schema } from '@/db';

export type Role = (typeof schema.roleEnum.enumValues)[number];

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findAllowedUser(email: string) {
  const [row] = await db
    .select()
    .from(schema.allowedUsers)
    .where(sql`lower(${schema.allowedUsers.email}) = ${normaliseEmail(email)}`)
    .limit(1);
  return row ?? null;
}
