import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Nav } from '@/components/nav';
import { requireRole } from '@/lib/session';
import { SignOutButton } from './sign-out-button';

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const user = await requireRole();
  return (
    <>
      {process.env.VERCEL_ENV !== 'production' && (
        <p className="bg-amber-300 px-4 print:hidden py-1 text-center text-xs font-bold uppercase tracking-wide text-amber-950">
          Test copy: changes here do not touch the real kitchen data
        </p>
      )}
      <div className="bg-mazcina-ink text-white print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="truncate text-[13px] font-medium text-mazcina-gold">{user.name ?? user.email}</span>
          <div className="flex items-center gap-4">
            {user.role !== 'staff' && (
              <Link href="/help" className="flex min-h-11 items-center text-sm font-semibold text-white/85 hover:text-white">
                How it works
              </Link>
            )}
            <SignOutButton />
          </div>
        </div>
      </div>
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white shadow-sm print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-x-8 gap-y-2 px-4 pt-3 sm:px-6">
          <Link href="/" aria-label="Mazcina Kitchen home" className="pb-3">
            <Logo />
          </Link>
          {user.role !== 'staff' && <Nav owner={user.role === 'owner'} />}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </>
  );
}
