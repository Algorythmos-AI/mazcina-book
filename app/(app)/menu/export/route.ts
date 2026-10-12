import { loadMenuSheet } from '@/lib/menu-sheet';
import { getCurrentUser } from '@/lib/session';

/** Quotes a cell, and defuses anything a spreadsheet would run as a formula. */
function cell(value: string | null): string {
  const text = value ?? '';
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** The costing sheet as a CSV that opens in Excel or Google Sheets. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response('Sign in first', { status: 401 });
  if (user.role === 'staff') return new Response('Not found', { status: 404 });

  const sheet = await loadMenuSheet(new URL(request.url).searchParams.get('m') ?? undefined);
  if (!sheet) return new Response('Not found', { status: 404 });

  const header = ['Section', 'Item', 'Menu price', 'Cost per serve', 'Food cost %', 'Profit per serve', 'Price at target', 'Note'];
  const lines = sheet.groups.flatMap(([, rows]) =>
    rows.map((r) => [r.category, r.name, r.price, r.cost, r.foodCostPct, r.profit, r.suggested, r.note].map(cell).join(',')),
  );
  // The byte-order mark makes Excel read accents (and the dollar sign) correctly.
  const body = `﻿${[header.map(cell).join(','), ...lines].join('\r\n')}\r\n`;
  const name = sheet.menu.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'menu';
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${name}-costing-${sheet.asOf}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
