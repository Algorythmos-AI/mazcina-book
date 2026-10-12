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
npm run test:db   # needs .env.local; runs against the dev database
```

## Database changes

Edit `db/schema.ts`, run `npm run db:generate`, commit the migration. It is
applied by the Vercel build (`scripts/deploy-migrate.mjs`): preview builds
migrate the dev database, production builds migrate the live one. Keep each
migration compatible with the previous deployment (add first, remove later).

## Gift cards

Customers buy on the public website (`mazcinarestobar.com.au/gift-cards`), which calls this app's small public API under `/api/gift-cards/` (config, checkout, order status). Only the website's own origins may call it (`lib/gift-cards/site.ts`; add more with `GIFT_SITE_ORIGINS`). Staff redeem at `/cards`. Money rules live
in `lib/gift-cards/core.ts`; `npm run test:db` proves them against the dev
database (no double issue, no overspend under 20 simultaneous redemptions,
refund handling, webhook replays).

Needed per environment: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`GIFT_CODE_KEY` (64 hex characters; losing it makes every unsent code
unreadable, changing it breaks lookups for existing cards). The Stripe webhook
endpoint is `/api/stripe/webhook` with events `checkout.session.completed`,
`checkout.session.async_payment_succeeded`,
`checkout.session.async_payment_failed`, `checkout.session.expired`,
`charge.refunded`, `charge.dispute.created`.

Production stays off until it has live keys **and** `GIFT_CARDS_LIVE=true`.
Test keys are refused in production and live keys are refused everywhere else.

Before going live: the restaurant's own Stripe account with a restricted live
key; `EMAIL_REPLY_TO` set to a monitored inbox; a "Gift card" payment type in
the POS; the website change that adds the order form merged and deployed.

## Backups

A Vercel Cron job (`/api/cron/backup`, 16:00 UTC, which is 2am or 3am in Sydney depending on
daylight saving; see `vercel.json`) writes a full JSON export to the private
Blob store `mazcina-kitchen-backups` as `backups/YYYY-MM-DD.json` and deletes
files older than 30 days. Owners can download the same export any time from
the Team page. To restore, load the JSON back table by table into a fresh
database; rehearse this before relying on it.

## Deploying

Push to `main`. If a git deployment fails with "Git information retrieval
failed", reconnect the repository (`vercel git disconnect`, then
`vercel git connect`) and push again; `vercel deploy --prod` from a clean
checkout is the fallback.
