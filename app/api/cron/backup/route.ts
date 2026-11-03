import { del, list, put } from '@vercel/blob';
import { alert } from '@/lib/alert';
import { cronAuthorised } from '@/lib/cron';
import { exportEverything } from '@/lib/export';
import { todaySydney } from '@/lib/format';
import { clearOldKeys } from '@/lib/idempotency';
import { daysAgo } from '@/lib/impact';

const PREFIX = 'backups/';
const KEEP_DAYS = 30;

/**
 * Nightly backup, called by Vercel Cron. Writes one private JSON file per day
 * and removes files older than 30 days. Re-running on the same day replaces
 * that day's file.
 */
export async function GET(request: Request) {
  if (!cronAuthorised(request)) return new Response('Unauthorized', { status: 401 });
  try {
    return await backUp();
  } catch (error) {
    await alert('Last night\'s backup failed', `${error instanceof Error ? error.stack ?? error.message : String(error)}\nThe previous backups are untouched. Download all data from the Team page if you need a copy today.`);
    return new Response('Backup failed', { status: 500 });
  }
}

async function backUp(): Promise<Response> {
  const today = todaySydney();
  const data = await exportEverything();
  const body = JSON.stringify(data);
  const blob = await put(`${PREFIX}${today}.json`, body, {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  const cutoff = `${PREFIX}${daysAgo(today, KEEP_DAYS)}.json`;
  const { blobs } = await list({ prefix: PREFIX, limit: 1000 });
  const expired = blobs.filter((b) => /^backups\/\d{4}-\d{2}-\d{2}\.json$/.test(b.pathname) && b.pathname < cutoff).map((b) => b.url);
  if (expired.length > 0) await del(expired);
  await clearOldKeys();

  const rows = Object.fromEntries(Object.entries(data.tables).map(([name, table]) => [name, table.length]));
  console.log(`[backup] wrote ${blob.pathname} (${body.length} bytes), removed ${expired.length} old`, rows);
  return Response.json({ ok: true, pathname: blob.pathname, bytes: body.length, removed: expired.length, rows });
}
