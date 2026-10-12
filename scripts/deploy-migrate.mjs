// Runs committed migrations as a deploy step. Production builds migrate the
// live database; preview builds migrate the separate dev database they are
// connected to. Each environment only ever has its own DATABASE_URL.
import { execSync } from 'node:child_process';

const env = process.env.VERCEL_ENV;
if (env === 'production' || env === 'preview') {
  console.log(`[migrate] applying migrations to the ${env} database`);
  execSync('npx drizzle-kit migrate', { stdio: 'inherit' });
} else {
  console.log(`[migrate] skipped (VERCEL_ENV=${env ?? 'unset'})`);
}
