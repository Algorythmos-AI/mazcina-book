import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { json, preflight } from '@/lib/gift-cards/site';

export const OPTIONS = preflight;

const maskEmail = (email: string) =>
  email.replace(/^(.)(.*)(@.*)$/, (_, first: string, middle: string, domain: string) => `${first}${'•'.repeat(Math.min(middle.length, 6))}${domain}`);

/**
 * What the thank-you page shows after Stripe sends the buyer back. It only
 * reads the order, keyed by Stripe's unguessable session id; the card itself
 * is issued by the webhook, never here. The code is never returned.
 */
export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get('session_id') ?? '';
  if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(sessionId)) return json(request, { error: 'Not found' }, 404);
  const [order] = await db.select().from(schema.giftCardOrders).where(eq(schema.giftCardOrders.stripeSessionId, sessionId));
  if (!order) return json(request, { error: 'Not found' }, 404);
  return json(request, {
    status: order.status,
    amount: order.amountCents / 100,
    recipientName: order.recipientName,
    recipientEmail: maskEmail(order.recipientEmail),
  });
}
