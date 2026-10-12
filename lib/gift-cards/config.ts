import Stripe from 'stripe';

export class GiftCardError extends Error {}

export function codeKey(): string {
  const key = process.env.GIFT_CODE_KEY;
  if (!key) throw new Error('GIFT_CODE_KEY is not set');
  return key;
}

/**
 * Whether gift cards can be sold here. Test keys work anywhere except
 * production; production needs live keys and an explicit switch, so real money
 * can never start moving because a variable was copied across by accident.
 */
export function giftCardSales(): { enabled: true; testMode: boolean } | { enabled: false; reason: string } {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !process.env.GIFT_CODE_KEY) return { enabled: false, reason: 'not configured' };
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
  client ??= new Stripe(key, { appInfo: { name: 'mazcina-kitchen' } });
  return client;
}
