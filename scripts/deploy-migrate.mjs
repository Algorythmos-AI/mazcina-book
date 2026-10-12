// Runs committed migrations as a deploy step, for production builds only.
// Preview builds never touch the schema.
import { execSync } from 'node:child_process';

if (process.env.VERCEL_ENV === 'production') {
  execSync('npx drizzle-kit migrate', { stdio: 'inherit' });
} else {
  console.log(`[migrate] skipped (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'})`);
}
