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
