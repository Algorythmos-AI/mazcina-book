import Stripe from 'stripe';

export class GiftCardError extends Error {}

export function codeKey(): string {
  const key = process.env.GIFT_CODE_KEY;
  if (!key) throw new Error('GIFT_CODE_KEY is not set');
  return key;
}

const ACCOUNT_ID = /^acct_[A-Za-z0-9]{8,}$/;
const MAX_FEE_BPS = 1000;

/**
 * Payments are taken on the restaurant's own Stripe account, connected to the
 * Algorythmos platform. The id is checked here so a typo can never send a
 * charge to the platform account instead.
 */
function accountId(): string | null {
  const id = process.env.STRIPE_CONNECT_ACCOUNT_ID?.trim();
  return id && ACCOUNT_ID.test(id) ? id : null;
}

export function connectAccount(): string {
  const id = accountId();
  if (!id) throw new Error('STRIPE_CONNECT_ACCOUNT_ID is not set or is not an account id');
  return id;
}

/** The platform's share in basis points (100 = 1%). Unset means none; anything odd is refused. */
function feeBps(): number | null {
  const raw = process.env.GIFT_PLATFORM_FEE_BPS?.trim();
  if (!raw) return 0;
  if (!/^\d{1,4}$/.test(raw)) return null;
  const bps = Number(raw);
  return bps <= MAX_FEE_BPS ? bps : null;
}

/** The platform fee for a sale in cents, rounded down. */
export function platformFee(amountCents: number): number {
  const bps = feeBps();
  if (bps === null) throw new Error('GIFT_PLATFORM_FEE_BPS is not a whole number from 0 to 1000');
  return Math.floor((amountCents * bps) / 10_000);
}

type Sales = { enabled: true; testMode: boolean } | { enabled: false; reason: string };

/**
 * Whether gift cards can be sold here. Test keys work anywhere except
 * production; production needs live keys and an explicit switch, so real money
 * can never start moving because a variable was copied across by accident.
 * A missing or malformed connected account, or a fee that makes no sense,
 * switches sales off rather than guessing.
 */
export function giftCardSales(): Sales {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !process.env.GIFT_CODE_KEY) return { enabled: false, reason: 'not configured' };
  if (!accountId()) return { enabled: false, reason: 'no connected Stripe account' };
  if (feeBps() === null) return { enabled: false, reason: 'platform fee is not valid' };
  const live = /^(sk|rk)_live_/.test(key);
  const production = process.env.VERCEL_ENV === 'production';
  if (live && !production) return { enabled: false, reason: 'live Stripe key outside production' };
  if (production && !live) return { enabled: false, reason: 'test Stripe key in production' };
  if (production && process.env.GIFT_CARDS_LIVE !== 'true') return { enabled: false, reason: 'not switched on' };
  return { enabled: true, testMode: !live };
}

let client: Stripe | null = null;
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  client ??= new Stripe(key, { apiVersion: '2026-09-30.endive', appInfo: { name: 'mazcina-kitchen' } });
  return client;
}

const READY_TTL_MS = 5 * 60 * 1000;
const READY_RETRY_MS = 30 * 1000;
let ready: { account: string; active: boolean; checkedAt: number } | null = null;

/**
 * `giftCardSales()` plus a question to Stripe: can the restaurant's account
 * take card payments right now? The answer is kept for five minutes. If Stripe
 * cannot be reached the last answer stands; with no answer yet, sales are off.
 */
export async function giftCardSalesReady(): Promise<Sales> {
  const sales = giftCardSales();
  if (!sales.enabled) return sales;
  const account = connectAccount();
  if (!ready || ready.account !== account || Date.now() - ready.checkedAt >= READY_TTL_MS) {
    try {
      const found = await stripe().v2.core.accounts.retrieve(account, { include: ['configuration.merchant'] });
      const active = found.configuration?.merchant?.capabilities?.card_payments?.status === 'active';
      ready = { account, active, checkedAt: Date.now() };
    } catch (error) {
      console.error('[gift-cards] could not check the connected Stripe account', error);
      if (!ready || ready.account !== account) return { enabled: false, reason: 'could not check the Stripe account' };
      // Ask again shortly, not on every request.
      ready.checkedAt = Date.now() - READY_TTL_MS + READY_RETRY_MS;
    }
  }
  return ready.active ? sales : { enabled: false, reason: 'the Stripe account cannot take card payments yet' };
}

/** For tests only. */
export function forgetReadiness(): void {
  ready = null;
}
