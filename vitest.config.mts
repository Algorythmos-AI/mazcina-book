import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// `npm test` runs the pure unit tests. `npm run test:db` also runs the
// *.db.test.ts files, which need a real Postgres: they use the dev database
// from .env.local and clean up after themselves.
const withDb = process.env.TEST_DB === '1';
if (withDb) config({ path: '.env.local' });
// TEST_DB_DRIVER=pg talks to a plain Postgres (CI) instead of Neon over WebSockets.
const plainPg = process.env.TEST_DB_DRIVER === 'pg';
const root = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      ...(plainPg ? [{ find: /^@\/db$/, replacement: root('./db/test-pg.ts') }] : []),
      { find: '@', replacement: root('.') },
    ],
  },
  test: {
    include: withDb ? ['**/*.db.test.ts'] : ['**/*.test.ts'],
    exclude: withDb ? ['node_modules/**'] : ['node_modules/**', '**/*.db.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
