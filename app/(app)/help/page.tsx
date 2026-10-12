import type { Metadata } from 'next';
import Link from 'next/link';
import { PrintButton } from '@/components/print-button';
import { card, h1, h2, link, muted } from '@/components/ui';
import { requireRole } from '@/lib/session';

export const metadata: Metadata = { title: 'How it works' };

export default async function HelpPage() {
  const user = await requireRole('owner', 'chef');
  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: '1. Add your suppliers',
      body: <>Go to <Link href="/suppliers" className={link}>Suppliers</Link> and add each one by name. You only do this once.</>,
    },
    {
      title: '2. Add ingredients and what they cost',
      body: (
        <>
          In <Link href="/ingredients" className={link}>Ingredients</Link>, add an ingredient, then type the pack size and pack price from the
          supplier&apos;s list (for example 5 kg for $22.50). If you trim or peel it, set the usable % so the waste is paid for. To load a whole
          price list at once, use <Link href="/ingredients/import" className={link}>Import prices</Link>.
        </>
      ),
    },
    {
      title: '3. Build each recipe',
      body: (
        <>
          In <Link href="/recipes" className={link}>Recipes</Link>, create a dish, tap or drag ingredients in and type the quantity for one batch.
          Set how many portions the batch makes. Sauces and mixes you use in several dishes go in as a Prep, then you add the prep to the dish
          like any ingredient. The cost updates as you type and saves by itself.
        </>
      ),
    },
    {
      title: '4. Link recipes to the menu',
      body: (
        <>
          In <Link href="/menu" className={link}>Menu</Link>, open an item and choose its recipe. You then see the cost of one serve, the food
          cost % against the menu price, and the price that would hit your target.
        </>
      ),
    },
    {
      title: '5. When a supplier price changes',
      body: (
        <>
          Open the ingredient and add the new price, or import the new list. Every dish that uses it updates straight away.{' '}
          <Link href="/changes" className={link}>Price changes</Link> shows which dishes moved and by how much.
        </>
      ),
    },
    {
      title: '6. New season or a special',
      body: (
        <>
          On the Menu page, copy the menu to a new draft, change items and prices there, then press Make live when it starts. The old menu is
          kept with the costs it had on its last day.
        </>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className={h1}>How it works</h1>
        <PrintButton />
      </div>

      {steps.map((step) => (
        <section key={step.title} className={`${card} break-inside-avoid`}>
          <h2 className={h2}>{step.title}</h2>
          <p className="mt-2 leading-relaxed">{step.body}</p>
        </section>
      ))}

      <section className={`${card} break-inside-avoid`}>
        <h2 className={h2}>Good to know</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 leading-relaxed">
          <li><strong>Incomplete</strong> means a recipe has something missing (a price, a quantity or a conversion). No cost is shown until it is fixed, so you never see a number that is too low.</li>
          <li><strong>Colours:</strong> green is at or under your target food cost, amber is up to 5 points over, red is more than that.</li>
          <li><strong>Numbers:</strong> type 0.5 or 0,5. For fifteen hundred type 1500, not 1,500.</li>
          <li><strong>GST:</strong> fresh produce, meat and fish have none. Tick the GST boxes on packaged goods and drinks when the supplier&apos;s price includes it. Costs are always shown before GST.</li>
          <li><strong>Nothing is deleted.</strong> Move to trash hides something; Restore brings it back.</li>
          <li><strong>Two people editing:</strong> if someone else changed the same recipe, you are told to reload instead of overwriting their work.</li>
          {user.role === 'owner' && (
            <li><strong>Owners:</strong> add or remove people under <Link href="/team" className={link}>Team</Link>. A full copy of the data is saved every night and kept for 30 days, and you can download one any time from the Team page.</li>
          )}
        </ul>
        <p className={`mt-3 ${muted}`}>Stuck? Message Sam.</p>
      </section>
    </div>
  );
}
