import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PrintButton } from '@/components/print-button';
import { card, h1, h2, link, muted } from '@/components/ui';
import { requireRole } from '@/lib/session';

export const metadata: Metadata = { title: 'How it works' };

interface Task {
  id: string;
  title: string;
  steps: ReactNode[];
}

const KITCHEN: Task[] = [
  {
    id: 'prices',
    title: 'Fill in prices',
    steps: [
      <>Open <Link href="/prices-needed" className={link}>To do</Link>. It lists every ingredient with no price, the ones holding back the most dishes first.</>,
      <>Type the pack size and the pack price from the invoice or the supplier&apos;s list, for example 5 kg for $22.50. You can type the $ sign. A new supplier? Pick <strong>+ New supplier…</strong> at the bottom of the list.</>,
      <>Herbs bought by the bunch: choose <strong>bunch</strong> as the unit. The first time, weigh one bunch and type its weight; recipes can then use grams or part of a bunch.</>,
      <>Under the price you see what it works out to per kg, litre or each. Check it looks right.</>,
      <>Choose the GST option that matches the invoice, then press Save (or Enter). The next ingredient is ready to type into.</>,
      <>Got a whole price list? Use <Link href="/ingredients/import" className={link}>Import prices</Link> and paste it in.</>,
    ],
  },
  {
    id: 'price-list',
    title: 'Update prices from an invoice',
    steps: [
      <>Open the <Link href="/prices" className={link}>Price list</Link> (under More on a phone). It shows every price in use, grouped by supplier.</>,
      <>Tap the supplier on the invoice to see only their items, or search for one by name.</>,
      <>Tap <strong>Change</strong>, type the new pack price and press Save (or Enter). Every recipe that uses it is re-costed straight away.</>,
    ],
  },
  {
    id: 'recipe',
    title: 'Build a recipe',
    steps: [
      <>In <Link href="/recipes" className={link}>Recipes</Link>, type a name, choose Dish or Prep, then Create and open.</>,
      <>Tap <strong>+ Add ingredient</strong> (on a computer, tap or drag from the list on the left) and type how much goes in one batch.</>,
      <>Set how many portions the batch makes. A prep also needs how much the batch makes, for example 2 l.</>,
      <>It saves by itself. A line with no quantity yet waits until you type one; the rest is already saved.</>,
    ],
  },
  {
    id: 'cost',
    title: "Check a dish's cost",
    steps: [
      <>In <Link href="/menu" className={link}>Menu</Link>, each dish shows its food cost %. Green is at or under your target, amber is up to 5 points over, red is more.</>,
      <>A dish that says <strong>Add 3 prices →</strong> is not costed yet. Tap it to type those prices straight away.</>,
      <>Open a dish to link its recipe, change its menu price, and see the price that would hit your target.</>,
      <><Link href="/changes" className={link}>Price changes</Link> shows which dishes moved when supplier prices changed.</>,
    ],
  },
  {
    id: 'stocktake',
    title: 'Do a stocktake',
    steps: [
      <>In <Link href="/stock" className={link}>Stock</Link>, tap Do a stocktake. Walk round with your phone and type what is on the shelf.</>,
      <>Leave blank what you did not count. Type 0 for nothing left.</>,
      <>Your counts are kept on the phone as you go. Tap Save when you are done; deliveries booked while you counted are kept.</>,
    ],
  },
  {
    id: 'delivery',
    title: 'Take a delivery',
    steps: [
      <>In <Link href="/stock" className={link}>Stock</Link>, tap Receive a delivery. Type a few letters to find each ingredient, then the quantity.</>,
      <>If the price changed, type what you paid for that line; it becomes the new price from today.</>,
      <>Tap Add to stock. If the signal drops, tap it again: the delivery is never booked twice.</>,
    ],
  },
];

const CARDS: Task = {
  id: 'gift-card',
  title: 'Take a gift card',
  steps: [
    <>Open <Link href="/cards" className={link}>Gift cards</Link> and scan the QR code, or type the code.</>,
    <>Type the amount to take off and tap Take it off the card. Then record it in the till as usual.</>,
    <>If the bill is more than what is left, take off everything that is left and charge the rest.</>,
    <>A card on hold must not be accepted: ask the owner.</>,
  ],
};

const WORDS: [string, string][] = [
  ['Prep', 'Something made in a batch and used inside dishes: a sauce, a stock, a dough.'],
  ['Usable %', 'How much is left after peeling or trimming. A whole fish that gives 45% fillet is 45.'],
  ['As needed', 'Salt, frying oil and the like with no set amount. Listed with the recipe, not counted in its cost.'],
  ['Estimate', 'A prep whose batch has not been weighed yet. Weigh one and type the real amount to make the cost exact.'],
  ['Not costed yet', 'Something is missing (a price, a quantity, a conversion). No cost is shown until it is sorted, so you never see a number that is too low.'],
  ['Trash', 'Nothing is deleted. Move to trash hides it; Undo or Restore brings it back.'],
];

export default async function HelpPage() {
  const user = await requireRole();
  const tasks = user.role === 'staff' ? [CARDS] : [...KITCHEN, CARDS];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className={h1}>How it works</h1>
        <PrintButton />
      </div>

      <nav aria-label="On this page" className={`${card} print:hidden`}>
        <h2 className={h2}>I want to…</h2>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {tasks.map((t) => (
            <li key={t.id}>
              <a href={`#${t.id}`} className={`${link} flex min-h-11 items-center`}>{t.title}</a>
            </li>
          ))}
          {user.role !== 'staff' && (
            <li>
              <a href="#words" className={`${link} flex min-h-11 items-center`}>Know what a word means</a>
            </li>
          )}
        </ul>
      </nav>

      {tasks.map((task) => (
        <section key={task.id} id={task.id} className={`${card} scroll-mt-6 break-inside-avoid`}>
          <h2 className={h2}>{task.title}</h2>
          <ol className="mt-2 list-decimal space-y-2 pl-5 leading-relaxed">
            {task.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>
      ))}

      {user.role !== 'staff' && (
        <section id="words" className={`${card} scroll-mt-6 break-inside-avoid`}>
          <h2 className={h2}>Words used here</h2>
          <dl className="mt-2 space-y-3">
            {WORDS.map(([word, meaning]) => (
              <div key={word}>
                <dt className="font-semibold">{word}</dt>
                <dd className="leading-relaxed">{meaning}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 leading-relaxed">
            <strong>Numbers:</strong> type 0.5 or 0,5. For fifteen hundred type 1500, not 1,500. Prices can be typed as $22.50 or $1,234.50.
          </p>
          {user.role === 'owner' && (
            <p className="mt-3 leading-relaxed">
              <strong>Owners:</strong> add or remove people under <Link href="/team" className={link}>Team</Link>. A full copy of the data is
              saved every night and kept for 30 days; you can download one any time from the Team page.
            </p>
          )}
        </section>
      )}

      <p className={muted}>Stuck? Message Sam with what you were doing.</p>
    </div>
  );
}
