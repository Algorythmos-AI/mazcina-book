import { cronAuthorised } from '@/lib/cron';
import { sendPendingEmails } from '@/lib/gift-cards/outbox';

/** Retries gift card emails that did not go out the first time. Called by Vercel Cron. */
export async function GET(request: Request) {
  if (!cronAuthorised(request)) return new Response('Unauthorized', { status: 401 });
  if (!process.env.GIFT_CODE_KEY) return Response.json({ ok: true, skipped: 'gift cards not configured' });
  return Response.json({ ok: true, ...(await sendPendingEmails(50)) });
}
