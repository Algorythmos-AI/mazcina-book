import { afterEach, describe, expect, it, vi } from 'vitest';
import { cronAuthorised, latestBackup } from './cron';

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

describe('latestBackup', () => {
  it('finds the newest nightly file and its age in days, ignoring anything else', () => {
    const files = ['backups/2026-10-20.json', 'backups/2026-10-21.json', 'backups/manual.json', 'other/2026-10-22.json'];
    expect(latestBackup(files, '2026-10-22')).toEqual({ date: '2026-10-21', daysOld: 1 });
    expect(latestBackup(files, '2026-10-25')).toEqual({ date: '2026-10-21', daysOld: 4 });
  });

  it('is null when there has never been a backup', () => {
    expect(latestBackup([], '2026-10-22')).toBeNull();
    expect(latestBackup(['backups/notes.txt'], '2026-10-22')).toBeNull();
  });

  it('counts across a daylight-saving change as whole days', () => {
    expect(latestBackup(['backups/2026-10-03.json'], '2026-10-05')?.daysOld).toBe(2);
  });
});
