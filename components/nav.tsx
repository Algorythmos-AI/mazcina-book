'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/recipes', label: 'Recipes' },
  { href: '/ingredients', label: 'Ingredients' },
  { href: '/suppliers', label: 'Suppliers' },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-2 pb-2">
      {LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`min-h-11 rounded-lg px-3 py-2.5 text-sm font-semibold ${active ? 'bg-white/15 text-white' : 'text-white/75'}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
