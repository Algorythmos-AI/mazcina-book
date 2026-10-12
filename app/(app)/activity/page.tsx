import type { Metadata } from 'next';
import { card, h1, muted } from '@/components/ui';
import { loadActivity } from '@/lib/queries';
import { requireRole } from '@/lib/session';

export const metadata: Metadata = { title: 'Activity' };

const ENTITY: Record<string, string> = {
  supplier: 'supplier',
  ingredient: 'ingredient',
  recipe: 'recipe',
  menu: 'menu',
  menu_item: 'menu item',
  settings: 'costing settings',
  team: 'team member',
  prices: 'price list',
};

const VERB: Record<string, string> = {
  create: 'added a',
  update: 'changed a',
  archive: 'moved to trash a',
  restore: 'restored a',
  price: 'added a price to an',
  clone: 'copied a',
  status: 'set the status of a',
  role: 'changed the role of a',
  remove: 'removed a',
  import: 'imported a',
};

function subject(row: { before: unknown; after: unknown }): string {
  for (const value of [row.after, row.before]) {
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const name = record.name ?? record.email;
      if (typeof name === 'string') {
        const detail = record.status ?? record.role;
        return typeof detail === 'string' ? `${name} (${detail})` : name;
      }
    }
  }
  return '';
}

export default async function ActivityPage() {
  await requireRole('owner');
  const rows = await loadActivity();
  const when = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="space-y-6">
      <h1 className={h1}>Activity</h1>
      <section className={card}>
        {rows.length === 0 ? (
          <p className={muted}>Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5">
                <span>
                  <span className="font-semibold">{row.actorEmail === 'seed' ? 'Setup' : row.actorEmail}</span>{' '}
                  {VERB[row.action] ?? row.action} {ENTITY[row.entity] ?? row.entity}
                  {subject(row) && <span className="font-semibold">: {subject(row)}</span>}
                </span>
                <span className={muted}>{when.format(row.at)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className={`mt-3 ${muted}`}>The latest 100 changes, Sydney time.</p>
      </section>
    </div>
  );
}
