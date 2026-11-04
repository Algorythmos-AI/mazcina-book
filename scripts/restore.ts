/**
 * Restores a backup file (the nightly one, or "Download all data") into an
 * EMPTY, already-migrated database, then reads everything back and checks it
 * matches the file row for row.
 *
 * Usage: DATABASE_URL=<target> tsx scripts/restore.ts <backup.json> [--yes]
 *
 * It never overwrites: if the target holds any kitchen data it stops. Login
 * sessions are not in a backup, so everyone signs in again afterwards. Gift
 * card codes come back encrypted and need the same GIFT_CODE_KEY to be read.
 */
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import { confirmTarget } from './target';
config({ path: '.env.local' });

// Parents before children, so foreign keys are satisfied as rows go in.
const ORDER = [
  ['settings', 'settings'],
  ['team', 'allowedUsers'],
  ['suppliers', 'suppliers'],
  ['ingredients', 'ingredients'],
  ['ingredientPrices', 'ingredientPrices'],
  ['recipes', 'recipes'],
  ['recipeLines', 'recipeLines'],
  ['menus', 'menus'],
  ['menuItems', 'menuItems'],
  ['menuCostSnapshots', 'menuCostSnapshots'],
  ['auditLog', 'auditLog'],
  ['stockMovements', 'stockMovements'],
  ['giftCardOrders', 'giftCardOrders'],
  ['giftCards', 'giftCards'],
  ['giftCardLedger', 'giftCardLedger'],
  // Version 2 backups onwards.
  ['emailOutbox', 'emailOutbox'],
  ['stripeEvents', 'stripeEvents'],
] as const;

type Row = Record<string, unknown>;

/** Stable text form of a row, for comparing the file with what was read back. */
function canonical(row: Row): string {
  return JSON.stringify(row, (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value as Row).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );
}

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!file) throw new Error('Usage: DATABASE_URL=<target> tsx scripts/restore.ts <backup.json>');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

  const backup = JSON.parse(readFileSync(file, 'utf8')) as { format?: string; version?: number; exportedAt?: string; tables?: Record<string, Row[]> };
  if (backup.format !== 'mazcina-kitchen-export' || (backup.version !== 1 && backup.version !== 2) || !backup.tables) {
    throw new Error('Not a Mazcina Kitchen backup file (format or version does not match)');
  }
  const unknown = Object.keys(backup.tables).filter((name) => !ORDER.some(([key]) => key === name));
  if (unknown.length > 0) throw new Error(`The file has tables this script does not know: ${unknown.join(', ')}`);

  await confirmTarget(`restore ${file} (exported ${backup.exportedAt ?? 'at an unknown time'})`);
  const { db, schema } = await import('../db');
  const { getTableColumns } = await import('drizzle-orm');
  const target = new URL(process.env.DATABASE_URL);
  console.log(`[restore] file from ${backup.exportedAt}; target ${target.hostname}${target.pathname}`);

  for (const [key, tableName] of ORDER) {
    const count = await db.$count(schema[tableName]);
    if (count > 0) throw new Error(`Target is not empty: ${key} already has ${count} row(s). Restore only into a fresh database.`);
  }

  await db.transaction(async (tx) => {
    for (const [key, tableName] of ORDER) {
      const table = schema[tableName];
      const dates = Object.entries(getTableColumns(table))
        .filter(([, column]) => column.dataType === 'date')
        .map(([name]) => name);
      const rows = [...(backup.tables![key] ?? [])]
        // Oldest first: a ledger row that reverses another must come after it.
        .sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')))
        .map((row) => {
          const copy: Row = { ...row };
          for (const name of dates) if (typeof copy[name] === 'string') copy[name] = new Date(copy[name] as string);
          return copy;
        });
      for (let i = 0; i < rows.length; i += 200) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows are checked against the file below
        await tx.insert(table).values(rows.slice(i, i + 200) as any);
      }
    }
  });

  let mismatches = 0;
  for (const [key, tableName] of ORDER) {
    const expected = (backup.tables[key] ?? []).map(canonical).sort();
    const actual = (JSON.parse(JSON.stringify(await db.select().from(schema[tableName]))) as Row[]).map(canonical).sort();
    const same = expected.length === actual.length && expected.every((row, index) => row === actual[index]);
    if (!same) mismatches++;
    console.log(`[restore] ${same ? 'ok      ' : 'MISMATCH'} ${key}: ${actual.length} of ${expected.length} rows`);
  }
  if (mismatches > 0) throw new Error(`${mismatches} table(s) do not match the file`);
  console.log('[restore] done: every table matches the file');
  process.exit(0);
}

main().catch((error) => {
  console.error(`[restore] FAILED: ${error.message}`);
  process.exit(1);
});
