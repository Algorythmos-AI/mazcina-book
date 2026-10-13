/**
 * Connects the restaurant's own Stripe account to the Algorythmos platform and
 * prints a Stripe-hosted onboarding link for the owner. Safe to run again: it
 * reuses the account it made before and only issues a fresh link (links expire).
 * Usage: tsx scripts/stripe-connect-onboard.ts <owner-email> [--live]
 * Uses STRIPE_SECRET_KEY from .env.local. Refuses a live key without --live.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

const CLIENT = 'mazcina';
const SITE = 'https://mazcinarestobar.com.au';

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Usage: tsx scripts/stripe-connect-onboard.ts <owner-email> [--live]');
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set in .env.local');
  const live = /^(sk|rk)_live_/.test(key);
  if (live !== args.includes('--live')) {
    throw new Error(live ? 'This is a live key. Pass --live if you mean it.' : '--live was passed but the key is a test key.');
  }

  const { stripe } = await import('../lib/gift-cards/config');
  const accounts = stripe().v2.core.accounts;

  let account = null;
  for await (const found of accounts.list({ applied_configurations: ['merchant'] })) {
    if (found.metadata?.client === CLIENT) {
      account = found;
      break;
    }
  }
  if (account) {
    console.log(`Using the existing connected account ${account.id}`);
  } else {
    // The restaurant is the seller: its own dashboard, its own Stripe fees, and Stripe carries any negative balance.
    account = await accounts.create({
      display_name: 'Mazcina Restobar',
      contact_email: email,
      dashboard: 'full',
      identity: { country: 'au' },
      configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
      defaults: { currency: 'aud', locales: ['en-AU'], responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' } },
      metadata: { client: CLIENT },
    });
    console.log(`Created connected account ${account.id}`);
  }

  const current = await accounts.retrieve(account.id, { include: ['configuration.merchant', 'requirements'] });
  const status = current.configuration?.merchant?.capabilities?.card_payments?.status ?? 'not requested';
  console.log(`Card payments: ${status}`);
  console.log(`Set STRIPE_CONNECT_ACCOUNT_ID=${account.id} for the ${live ? 'production' : 'development and preview'} environment.`);
  if (status === 'active') return;

  const link = await stripe().v2.core.accountLinks.create({
    account: account.id,
    use_case: {
      type: 'account_onboarding',
      account_onboarding: { collection_options: { fields: 'eventually_due' }, refresh_url: `${SITE}/gift-cards`, return_url: `${SITE}/gift-cards` },
    },
  });
  console.log(`\nOnboarding link for the owner (expires ${link.expires_at}; run this again for a new one):\n${link.url}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
