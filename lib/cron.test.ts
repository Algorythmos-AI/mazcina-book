import { afterEach, describe, expect, it, vi } from 'vitest';
import { cronAuthorised } from './cron';

const call = (authorization?: string) => new Request('https://x/api/cron/backup', { headers: authorization ? { authorization } : {} });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('cronAuthorised', () => {
  it('accepts only the exact bearer secret', () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    expect(cronAuthorised(call('Bearer s3cret'))).toBe(true);
    expect(cronAuthorised(call('Bearer s3cre'))).toBe(false);
    expect(cronAuthorised(call('s3cret'))).toBe(false);
    expect(cronAuthorised(call())).toBe(false);
  });

  it('refuses everything, loudly, when no secret is set', () => {
    vi.stubEnv('CRON_SECRET', '');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(cronAuthorised(call('Bearer '))).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('CRON_SECRET is not set'));
  });
});
