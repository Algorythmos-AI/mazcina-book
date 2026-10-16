import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton } from '@/components/action-button';
import { badgeBad, badgeOk, badgeWarn, card, h1, h2, link, muted, primary } from '@/components/ui';
import packJson from '@/data/kitchen/mazcina-kitchen-data.json';
import { displayDate } from '@/lib/format';
import { planImport } from '@/lib/kitchen-data/import';
import { packSchema } from '@/lib/kitchen-data/pack';
import { requireRole } from '@/lib/session';
import { importKitchenData } from './actions';

export const metadata: Metadata = { title: 'Kitchen data' };

const SECTIONS = [
  ['suppliers', 'Suppliers'],
  ['ingredients', 'Ingredients'],
  ['prices', 'Prices'],
  ['recipes', 'Recipes'],
  ['menuLinks', 'Menu items linked to a recipe'],
] as const;

/** The restaurant's real recipes and prices (data/kitchen/), what loading them would add, and what is still to confirm. */
export default async function KitchenDataPage() {
  await requireRole('owner');
  const pack = packSchema.parse(packJson);
  const report = await planImport(pack);
  const toAdd = SECTIONS.reduce((n, [k]) => n + report[k].add.length, 0);
  const estimated = pack.recipes.filter((r) => r.yieldEstimated).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/team" className={`${muted} font-semibold hover:text-mazcina-wood`}>← Team</Link>
        <h1 className={`mt-1 ${h1}`}>Kitchen data</h1>
        <p className={muted}>
          The real recipes and supplier prices, version {displayDate(pack.updated)}. Loading adds what is missing and never changes anything already here.
        </p>
      </div>

      <section className={card}>
        <h2 className={h2}>Where it comes from</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {pack.sources.map((s) => (
            <li key={s.key}>
              <span className="font-semibold">{s.title}</span> <span className={muted}>· {displayDate(s.date)}</span>
            </li>
          ))}
        </ul>
        <p className={`mt-3 ${muted}`}>
          {pack.recipes.length} recipes ({pack.recipes.filter((r) => r.type === 'prep').length} bases), {pack.ingredients.length} ingredients,{' '}
          {pack.prices.length} prices. {estimated} bases have an estimated batch yield until a batch is weighed.
        </p>
      </section>

      <section className={card}>
        <h2 className={h2}>Load into the kitchen</h2>
        {report.problems.length > 0 ? (
          <div className="mt-2">
            <p className={badgeBad}>The file has problems; it cannot be loaded</p>
            <ul className="mt-2 list-disc pl-5 text-sm">{report.problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        ) : (
          <>
            <ul className="mt-2 divide-y divide-gray-100">
              {SECTIONS.map(([k, label]) => (
                <li key={k} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span className="font-semibold">{label}</span>
                  <span className="flex gap-2 text-sm">
                    <span className={report[k].add.length ? badgeOk : muted}>{report[k].add.length} to add</span>
                    <span className={muted}>{report[k].keep.length} already here</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              {toAdd > 0 ? (
                <ActionButton
                  action={importKitchenData}
                  label={`Load ${toAdd} new records`}
                  confirm="Load the kitchen data now? Existing suppliers, ingredients, recipes and menu links are not changed."
                  className={primary}
                />
              ) : (
                <p className={badgeOk}>Everything in this file is already loaded</p>
              )}
            </div>
            {report.recipes.add.length > 0 && (
              <details className="mt-4">
                <summary className={`${link} cursor-pointer`}>Recipes that will be added</summary>
                <p className="mt-2 text-sm">{report.recipes.add.join(' · ')}</p>
              </details>
            )}
          </>
        )}
      </section>

      <section className={card}>
        <h2 className={h2}>Still to confirm with the kitchen ({pack.openQuestions.length})</h2>
        <p className={muted}>Each answer turns more dishes from incomplete or estimated into an exact cost.</p>
        <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm">
          {pack.openQuestions.map((q) => (
            <li key={q.topic}>
              <span className="font-semibold">{q.topic}:</span> {q.question}
              <span className={`block ${muted}`}>{q.why}</span>
            </li>
          ))}
        </ol>
      </section>

      {pack.serviceConventions.length > 0 && (
        <section className={card}>
          <h2 className={h2}>Service conventions (from the manual)</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{pack.serviceConventions.map((c) => <li key={c}>{c}</li>)}</ul>
        </section>
      )}
      <p className={`${badgeWarn} inline-block`}>Prices: Bidfood 15 Oct 2026 and Mickey&apos;s Fruit &amp; Veg 31 Aug 2026. Add new invoices on Ingredients or Import prices.</p>
    </div>
  );
}
