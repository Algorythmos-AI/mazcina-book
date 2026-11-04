'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

type Role = 'owner' | 'chef' | 'staff';
interface NavLink {
  href: string;
  label: string;
}

const MENU = { href: '/menu', label: 'Menu' };
const TODO = { href: '/prices-needed', label: 'To do' };
const RECIPES = { href: '/recipes', label: 'Recipes' };
const INGREDIENTS = { href: '/ingredients', label: 'Ingredients' };
const SUPPLIERS = { href: '/suppliers', label: 'Suppliers' };
const STOCK = { href: '/stock', label: 'Stock' };
const CARDS = { href: '/cards', label: 'Gift cards' };
const TEAM = { href: '/team', label: 'Team' };
const ACTIVITY = { href: '/activity', label: 'Activity' };
const HELP = { href: '/help', label: 'How it works' };

function linksFor(role: Role, giftCards: boolean): NavLink[] {
  const cards = giftCards ? [CARDS] : [];
  if (role === 'staff') return cards;
  const kitchen = [MENU, TODO, RECIPES, INGREDIENTS, SUPPLIERS, STOCK, ...cards];
  return role === 'owner' ? [...kitchen, TEAM, ACTIVITY] : kitchen;
}

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

function TodoCount({ todo }: { todo: number }) {
  if (todo <= 0) return null;
  return (
    <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-900" aria-label={`${todo} to do`}>
      {todo}
    </span>
  );
}

/**
 * The row of links under the logo. On a phone the kitchen team gets the
 * bottom bar instead (BottomNav), so this row is for tablets and computers;
 * staff only ever see Gift cards, which fits anywhere.
 */
export function Nav({ role, giftCards, todo = 0 }: { role: Role; giftCards: boolean; todo?: number }) {
  const pathname = usePathname();
  const links = linksFor(role, giftCards);
  return (
    <nav aria-label="Main" className={`-mb-px gap-5 overflow-x-auto text-[15px] font-medium lg:gap-8 ${role === 'staff' ? 'flex' : 'hidden md:flex'}`}>
      {links.map((item) => {
        const active = isActive(pathname, item.href);
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
            {item.href === TODO.href && <TodoCount todo={todo} />}
          </Link>
        );
      })}
    </nav>
  );
}

const TAB_ICONS: Record<string, ReactNode> = {
  '/menu': <path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />,
  '/prices-needed': <path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />,
  '/recipes': <path d="M6 3v8a3 3 0 0 0 6 0V3M9 3v18M17 3c-2 2-2 6 0 8v10" />,
  '/ingredients': <path d="M12 21c-4 0-7-3-7-7 0-5 7-11 7-11s7 6 7 11c0 4-3 7-7 7z" />,
  more: <path d="M4 7h16M4 12h16M4 17h16" />,
};

function Tab({ href, label, active, onClick, badge }: { href?: string; label: string; active: boolean; onClick?: () => void; badge?: number }) {
  const body = (
    <>
      <span className="relative">
        <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          {TAB_ICONS[href ?? 'more']}
        </svg>
        {!!badge && badge > 0 && (
          <span className="absolute -right-3 -top-1.5 min-w-5 rounded-full bg-amber-500 px-1 text-center text-[11px] font-bold leading-5 text-white tabular-nums">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span className="text-[11px] font-semibold">{label}</span>
    </>
  );
  const className = `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 ${active ? 'text-mazcina-wood' : 'text-mazcina-emerald'}`;
  return href ? (
    <Link href={href} aria-current={active ? 'page' : undefined} className={className}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-expanded={active} className={className}>
      {body}
    </button>
  );
}

/**
 * Phone navigation for the kitchen team: the four places used most, always
 * under the thumb, and everything else behind More. It steps out of the way
 * while the keyboard is up so it never covers the field being typed in.
 */
export function BottomNav({ role, giftCards, todo, signOut }: { role: Role; giftCards: boolean; todo: number; signOut: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  // Going to another page closes the More sheet.
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit'].includes(el.type)));
    const onIn = (e: FocusEvent) => setTyping(isField(e.target));
    const onOut = () => setTyping(false);
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, []);

  if (role === 'staff') return null;
  const main = [MENU, TODO, RECIPES, INGREDIENTS];
  const more = linksFor(role, giftCards).filter((l) => !main.includes(l));

  return (
    <div className={`md:hidden print:hidden ${typing ? 'hidden' : ''}`}>
      {open && (
        <>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/30" />
          <nav aria-label="More" className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-50 rounded-t-xl bg-white p-2 shadow-2xl">
            <ul className="grid grid-cols-2 gap-1">
              {[...more, HELP].map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                    className={`flex min-h-12 items-center rounded-md px-3 font-semibold ${isActive(pathname, item.href) ? 'bg-mazcina-surface text-mazcina-wood' : 'hover:bg-mazcina-surface'}`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex justify-end border-t border-gray-100 pt-2">{signOut}</div>
          </nav>
        </>
      )}
      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-50 flex border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
      >
        {main.map((item) => (
          <Tab key={item.href} href={item.href} label={item.label} active={!open && isActive(pathname, item.href)} badge={item.href === TODO.href ? todo : undefined} />
        ))}
        <Tab label="More" active={open || more.some((l) => isActive(pathname, l.href))} onClick={() => setOpen((v) => !v)} />
      </nav>
    </div>
  );
}
