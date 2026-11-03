import Link from 'next/link';
import { card, h1, link, muted } from '@/components/ui';

export default function NotFound() {
  return (
    <section className={`${card} mx-auto max-w-xl`}>
      <h1 className={h1}>Not here</h1>
      <p className="mt-3">That page does not exist, or what it showed has been deleted.</p>
      <p className={`mt-2 ${muted}`}>Things moved to the trash can be found at the bottom of their list and restored.</p>
      <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        <Link href="/menu" className={link}>Menu</Link>
        <Link href="/recipes" className={link}>Recipes</Link>
        <Link href="/ingredients" className={link}>Ingredients</Link>
      </p>
    </section>
  );
}
