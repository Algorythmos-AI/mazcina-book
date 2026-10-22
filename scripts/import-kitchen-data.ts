/**
 * Loads data/kitchen/mazcina-kitchen-data.json into the database in .env.local
 * (the dev database). Production is loaded by an owner from the Kitchen data page.
 * Usage: npx tsx scripts/import-kitchen-data.ts [--apply [--yes]]
 * Without --apply it only reports what would be added.
 */
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';
import { confirmTarget } from './target';
config({ path: '.env.local' });

async function main() {
  if (process.env.VERCEL_ENV === 'production') throw new Error('Refusing to run against production; use the Kitchen data page.');
  const { packSchema } = await import('../lib/kitchen-data/pack');
  const { applyImport, planImport } = await import('../lib/kitchen-data/import');
  const pack = packSchema.parse(JSON.parse(readFileSync('data/kitchen/mazcina-kitchen-data.json', 'utf8')));
  const apply = process.argv.includes('--apply');
  if (apply) await confirmTarget('import the kitchen data pack');
  const report = apply ? await applyImport(pack, 'import-script') : await planImport(pack);
  if (report.problems.length) console.log('PROBLEMS:\n- ' + report.problems.join('\n- '));
  for (const k of ['suppliers', 'ingredients', 'prices', 'recipes', 'menuLinks'] as const) {
    console.log(`${k.padEnd(12)} ${apply ? 'added' : 'to add'} ${String(report[k].add.length).padStart(3)}   already here ${report[k].keep.length}`);
  }
  if (!apply) console.log('\nDry run. Run again with --apply to load it.');
  process.exit(0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
