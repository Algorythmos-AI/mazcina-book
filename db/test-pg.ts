/**
 * Test-only stand-in for ./index: the same schema over node-postgres, so the
 * database tests can run against a plain Postgres (CI, or one on a laptop)
 * instead of Neon. vitest.config.mts swaps it in when TEST_DB_DRIVER=pg; the
 * app never imports it.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set');

export const db = drizzle(new Pool({ connectionString }), { schema });
export type Db = typeof db;
export { schema };
