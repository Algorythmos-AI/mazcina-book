import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// `npm test` runs the pure unit tests. `npm run test:db` also runs the
// *.db.test.ts files, which need a real Postgres: they use the dev database
// from .env.local and clean up after themselves.
const withDb = process.env.TEST_DB === '1';
if (withDb) config({ path: '.env.local' });

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    include: withDb ? ['**/*.db.test.ts'] : ['**/*.test.ts'],
    exclude: withDb ? ['node_modules/**'] : ['node_modules/**', '**/*.db.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
