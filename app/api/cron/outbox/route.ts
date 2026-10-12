import { timingSafeEqual } from 'node:crypto';
import { sendPendingEmails } from '@/lib/gift-cards/outbox';

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Retries gift card emails that did not go out the first time. Called by Vercel Cron. */
export async function GET(request: Request) {
  if (!authorised(request)) return new Response('Unauthorized', { status: 401 });
  if (!process.env.GIFT_CODE_KEY) return Response.json({ ok: true, skipped: 'gift cards not configured' });
  return Response.json({ ok: true, ...(await sendPendingEmails(50)) });
}
