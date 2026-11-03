'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/menu', label: 'Menu' },
  { href: '/prices-needed', label: 'To do' },
  { href: '/recipes', label: 'Recipes' },
  { href: '/ingredients', label: 'Ingredients' },
  { href: '/suppliers', label: 'Suppliers' },
  { href: '/stock', label: 'Stock' },
];

const OWNER_LINKS = [
  { href: '/team', label: 'Team' },
  { href: '/activity', label: 'Activity' },
];

/** Same treatment as the public site's nav: emerald links, the current one in wood with an underline. */
const STAFF_LINKS = [{ href: '/cards', label: 'Gift cards' }];

export function Nav({ role, giftCards, todo = 0 }: { role: 'owner' | 'chef' | 'staff'; giftCards: boolean; todo?: number }) {
  const cards = giftCards ? STAFF_LINKS : [];
  const links = role === 'staff' ? cards : role === 'owner' ? [...LINKS, ...cards, ...OWNER_LINKS] : [...LINKS, ...cards];
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="-mb-px flex gap-5 overflow-x-auto text-[15px] font-medium sm:gap-8">
      {links.map((item) => {
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
            {item.href === '/prices-needed' && todo > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-900" aria-label={`${todo} to do`}>
                {todo}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
