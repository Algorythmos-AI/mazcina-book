# Mazcina Kitchen

Back office for Mazcina Resto - Bar: recipe costing, menus and (later) gift
cards and inventory. Live at https://kitchen.mazcinarestobar.com.au.

Next.js App Router, Neon Postgres with Drizzle, Better Auth (email code,
allow-list), Resend. Hosted on Vercel in Sydney.

## Environments

| | Database | Email | Banner |
|---|---|---|---|
| Production | `mazcina-book-db` | sent for real | none |
| Preview | `mazcina-book-db-dev` | only to `EMAIL_OVERRIDE_TO`, otherwise not sent | "Test copy" |
| Local | `mazcina-book-db-dev` | printed to the terminal | "Test copy" |

The two databases are separate Neon projects connected through the Vercel
Marketplace, so nothing done locally or in a preview can reach live data.
Local and preview share one dev database.

## Local setup

```bash
npm install
vercel env pull .env.local   # development variables, dev database
npm run db:migrate
npx tsx scripts/seed.ts you@example.com
npx tsx scripts/seed-menu.ts
npm run dev
```

Sign in with the email you seeded; the code is printed in the terminal.

## Checks

```bash
npm run lint && npm run typecheck && npm test
```

## Database changes

Edit `db/schema.ts`, run `npm run db:generate`, commit the migration. It is
applied by the Vercel build (`scripts/deploy-migrate.mjs`): preview builds
migrate the dev database, production builds migrate the live one. Keep each
migration compatible with the previous deployment (add first, remove later).

## Deploying

Push to `main`. If a git deployment fails with "Git information retrieval
failed", reconnect the repository (`vercel git disconnect`, then
`vercel git connect`) and push again; `vercel deploy --prod` from a clean
checkout is the fallback.
