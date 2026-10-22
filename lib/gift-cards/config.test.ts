import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectAccount, forgetReadiness, giftCardEvents, giftCardSales, giftCardSalesReady, platformFee } from './config';
import * as config from './config';

const ACCOUNT = 'acct_1TestMazcina0001';
const KEYS = ['STRIPE_SECRET_KEY', 'GIFT_CODE_KEY', 'STRIPE_CONNECT_ACCOUNT_ID', 'GIFT_PLATFORM_FEE_BPS', 'GIFT_CARDS_LIVE', 'VERCEL_ENV'] as const;
const saved: Record<string, string | undefined> = {};

function env(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, { STRIPE_SECRET_KEY: 'rk_test_x', GIFT_CODE_KEY: 'c'.repeat(64), STRIPE_CONNECT_ACCOUNT_ID: ACCOUNT, ...values });
}

beforeEach(() => {
  for (const key of KEYS) saved[key] = process.env[key];
  forgetReadiness();
});
afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('whether gift cards are on sale', () => {
  it('is on in test mode with a test key, a code key and a connected account', () => {
    env({});
    expect(giftCardSales()).toEqual({ enabled: true, testMode: true });
  });

  it('is off without a connected account, or with something that is not an account id', () => {
    for (const bad of ['', '   ', 'mazcina', 'acct_', 'rk_test_x', 'acct_123 456789']) {
      env({ STRIPE_CONNECT_ACCOUNT_ID: bad });
      expect(giftCardSales()).toEqual({ enabled: false, reason: 'no connected Stripe account' });
      expect(() => connectAccount()).toThrow();
    }
  });

  it('is off when the platform fee is not a whole number from 0 to 1000', () => {
    for (const bad of ['-1', '1001', '2.5', 'abc', '1e2', '99999']) {
      env({ GIFT_PLATFORM_FEE_BPS: bad });
      expect(giftCardSales()).toEqual({ enabled: false, reason: 'platform fee is not valid' });
      expect(() => platformFee(10000)).toThrow();
    }
  });

  it('keeps test keys out of production and live keys out of everywhere else', () => {
    env({ VERCEL_ENV: 'production' });
    expect(giftCardSales()).toMatchObject({ enabled: false, reason: 'test Stripe key in production' });
    env({ STRIPE_SECRET_KEY: 'rk_live_x', VERCEL_ENV: 'preview' });
    expect(giftCardSales()).toMatchObject({ enabled: false, reason: 'live Stripe key outside production' });
    env({ STRIPE_SECRET_KEY: 'rk_live_x', VERCEL_ENV: 'production' });
    expect(giftCardSales()).toMatchObject({ enabled: false, reason: 'not switched on' });
    env({ STRIPE_SECRET_KEY: 'rk_live_x', VERCEL_ENV: 'production', GIFT_CARDS_LIVE: 'true' });
    expect(giftCardSales()).toEqual({ enabled: true, testMode: false });
  });
});

describe('whether Stripe events are acted on', () => {
  it('stays on while sales are paused, so refunds and disputes still land', () => {
    env({ STRIPE_SECRET_KEY: 'rk_live_x', VERCEL_ENV: 'production' });
    expect(giftCardSales()).toMatchObject({ enabled: false, reason: 'not switched on' });
    expect(giftCardEvents()).toEqual({ enabled: true, testMode: false });
    env({ GIFT_PLATFORM_FEE_BPS: 'oops' });
    expect(giftCardEvents()).toEqual({ enabled: true, testMode: true });
  });

  it('still keeps keys in their own environment and needs the account and code key', () => {
    env({ STRIPE_SECRET_KEY: 'rk_live_x', VERCEL_ENV: 'preview' });
    expect(giftCardEvents().enabled).toBe(false);
    env({ VERCEL_ENV: 'production', GIFT_CARDS_LIVE: 'true' });
    expect(giftCardEvents().enabled).toBe(false);
    env({ STRIPE_CONNECT_ACCOUNT_ID: 'nope' });
    expect(giftCardEvents().enabled).toBe(false);
    env({ GIFT_CODE_KEY: '' });
    expect(giftCardEvents().enabled).toBe(false);
  });
});

describe('the platform fee', () => {
  it('is nothing unless set, and rounds down', () => {
    env({});
    expect(platformFee(10000)).toBe(0);
    env({ GIFT_PLATFORM_FEE_BPS: '0' });
    expect(platformFee(10000)).toBe(0);
    env({ GIFT_PLATFORM_FEE_BPS: '250' });
    expect(platformFee(10000)).toBe(250);
    expect(platformFee(2500)).toBe(62);
    env({ GIFT_PLATFORM_FEE_BPS: '1000' });
    expect(platformFee(50000)).toBe(5000);
  });
});

describe('whether the connected account can take payments', () => {
  const account = (status: string) => ({ configuration: { merchant: { capabilities: { card_payments: { status } } } } });
  function stripeAnswers(...answers: Array<ReturnType<typeof account> | Error>) {
    const retrieve = vi.fn();
    for (const answer of answers) {
      if (answer instanceof Error) retrieve.mockRejectedValueOnce(answer);
      else retrieve.mockResolvedValueOnce(answer);
    }
    vi.spyOn(config.stripe().v2.core.accounts, 'retrieve').mockImplementation(retrieve);
    return retrieve;
  }

  it('does not ask Stripe when sales are off anyway', async () => {
    env({ STRIPE_CONNECT_ACCOUNT_ID: '' });
    const retrieve = stripeAnswers();
    expect(await giftCardSalesReady()).toMatchObject({ enabled: false });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('is on only when card payments are active, asking for the right account and remembering the answer', async () => {
    env({});
    const retrieve = stripeAnswers(account('active'));
    expect(await giftCardSalesReady()).toEqual({ enabled: true, testMode: true });
    expect(await giftCardSalesReady()).toEqual({ enabled: true, testMode: true });
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(retrieve.mock.calls[0][0]).toBe(ACCOUNT);
  });

  it('is off while onboarding is unfinished, and comes on once Stripe says so', async () => {
    vi.useFakeTimers();
    env({});
    const retrieve = stripeAnswers(account('pending'), account('active'));
    expect(await giftCardSalesReady()).toMatchObject({ enabled: false });
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(await giftCardSalesReady()).toMatchObject({ enabled: true });
    expect(retrieve).toHaveBeenCalledTimes(2);
  });

  it('is off when Stripe cannot be reached and there is no earlier answer', async () => {
    env({});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stripeAnswers(new Error('network'));
    expect(await giftCardSalesReady()).toEqual({ enabled: false, reason: 'could not check the Stripe account' });
  });

  it('keeps the last answer through a Stripe outage and asks again soon, not on every request', async () => {
    vi.useFakeTimers();
    env({});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const retrieve = stripeAnswers(account('active'), new Error('network'), account('restricted'));
    expect(await giftCardSalesReady()).toMatchObject({ enabled: true });
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(await giftCardSalesReady()).toMatchObject({ enabled: true });
    expect(await giftCardSalesReady()).toMatchObject({ enabled: true });
    expect(retrieve).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(30 * 1000);
    expect(await giftCardSalesReady()).toMatchObject({ enabled: false });
  });

  it('does not reuse an answer given for a different account', async () => {
    env({});
    const retrieve = stripeAnswers(account('active'), account('pending'));
    expect(await giftCardSalesReady()).toMatchObject({ enabled: true });
    env({ STRIPE_CONNECT_ACCOUNT_ID: 'acct_1AnotherAccount02' });
    expect(await giftCardSalesReady()).toMatchObject({ enabled: false });
    expect(retrieve).toHaveBeenCalledTimes(2);
  });
});
