'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/menu', label: 'Menu' },
  { href: '/recipes', label: 'Recipes' },
  { href: '/ingredients', label: 'Ingredients' },
  { href: '/suppliers', label: 'Suppliers' },
];

/** Same treatment as the public site's nav: emerald links, the current one in wood with an underline. */
export function Nav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="-mb-px flex gap-5 overflow-x-auto text-[15px] font-medium sm:gap-8">
      {LINKS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-11 shrink-0 items-center border-b-2 transition-colors ${
              active ? 'border-mazcina-wood text-mazcina-wood' : 'border-transparent hover:text-mazcina-wood'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
