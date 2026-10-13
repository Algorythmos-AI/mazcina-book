import { EXPIRY_YEARS, MAX_AMOUNT_CENTS, MIN_AMOUNT_CENTS, PRESET_AMOUNTS_CENTS } from '@/lib/gift-cards/codes';
import { giftCardSalesReady } from '@/lib/gift-cards/config';
import { json, preflight } from '@/lib/gift-cards/site';

export const OPTIONS = preflight;

/** Tells the website whether gift cards are on sale and which amounts to offer. Nothing private. Off until the restaurant's Stripe account can take payments. */
export async function GET(request: Request) {
  const sales = await giftCardSalesReady();
  return json(request, {
    enabled: sales.enabled,
    testMode: sales.enabled && sales.testMode,
    presets: PRESET_AMOUNTS_CENTS.map((c) => c / 100),
    min: MIN_AMOUNT_CENTS / 100,
    max: MAX_AMOUNT_CENTS / 100,
    expiryYears: EXPIRY_YEARS,
  });
}
