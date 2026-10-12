/**
 * The public website is where customers buy gift cards; this app is the engine
 * behind it. These helpers decide which website origins may call the public
 * gift card API and where to send the customer back to after paying.
 */
const PRODUCTION_SITE = 'https://mazcinarestobar.com.au';

export function siteOrigins(): string[] {
  const configured = (process.env.GIFT_SITE_ORIGINS ?? '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
  const origins = new Set([PRODUCTION_SITE, 'https://www.mazcinarestobar.com.au', ...configured]);
  // The website's local dev server, never accepted by the live app.
  if (process.env.VERCEL_ENV !== 'production') origins.add('http://localhost:4321');
  return [...origins];
}

/** The caller's origin if it is one of ours, otherwise null. */
export function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get('origin');
  return origin && siteOrigins().includes(origin) ? origin : null;
}

export function primarySite(): string {
  return PRODUCTION_SITE;
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = allowedOrigin(request);
  return {
    ...(origin ? { 'access-control-allow-origin': origin } : {}),
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '600',
    vary: 'Origin',
    'cache-control': 'no-store',
  };
}

export function json(request: Request, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(request) });
}

export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
