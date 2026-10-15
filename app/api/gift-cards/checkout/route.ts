import { createCheckout } from '@/lib/gift-cards/checkout';
import { allowedOrigin, json, preflight } from '@/lib/gift-cards/site';

export const OPTIONS = preflight;

/** Called by the gift card form on the website. Only our own website origins may start a checkout. */
export async function POST(request: Request) {
  const origin = allowedOrigin(request);
  if (!origin) return json(request, { error: 'Not allowed from this site' }, 403);
  if (!request.headers.get('content-type')?.includes('application/json')) return json(request, { error: 'Send JSON' }, 415);

  let input: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 5000) return json(request, { error: 'Too much data' }, 413);
    input = JSON.parse(raw);
  } catch {
    return json(request, { error: 'Could not read the form' }, 400);
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return json(request, { error: 'Could not read the form' }, 400);

  // On Vercel the first x-forwarded-for entry is the client, set by the platform rather than the caller.
  const ip = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const result = await createCheckout(input as Record<string, unknown>, origin, ip);
  return result.ok ? json(request, { url: result.url }) : json(request, { error: result.error }, result.status);
}
