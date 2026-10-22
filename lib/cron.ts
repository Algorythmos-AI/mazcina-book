import { timingSafeEqual } from 'node:crypto';

/**
 * True when the request carries Vercel Cron's `Authorization: Bearer
 * $CRON_SECRET`. Without CRON_SECRET every call is refused, so a missing
 * variable shows up as 401s in the logs rather than as an open endpoint.
 */
export function cronAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron] CRON_SECRET is not set: scheduled jobs cannot run');
    return false;
  }
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const BACKUP_FILE = /^backups\/(\d{4}-\d{2}-\d{2})\.json$/;

/**
 * The newest nightly backup among blob pathnames, and how many days before
 * `today` (Australia/Sydney) it was taken. A backup is named after the Sydney
 * date it ran, and runs in the early hours, so 0 or 1 day old is normal.
 */
export function latestBackup(pathnames: string[], today: string): { date: string; daysOld: number } | null {
  const dates = pathnames.flatMap((p) => BACKUP_FILE.exec(p)?.[1] ?? []).sort();
  const date = dates.at(-1);
  if (!date) return null;
  const daysOld = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
  return { date, daysOld };
}
