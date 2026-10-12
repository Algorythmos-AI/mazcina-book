import { exportEverything } from '@/lib/export';
import { todaySydney } from '@/lib/format';
import { getCurrentUser } from '@/lib/session';

/** Owner-only download of all kitchen data as one JSON file. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response('Sign in first', { status: 401 });
  if (user.role !== 'owner') return new Response('Not found', { status: 404 });
  const body = JSON.stringify(await exportEverything(), null, 2);
  return new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="mazcina-kitchen-${todaySydney()}.json"`,
      'cache-control': 'no-store',
    },
  });
}
