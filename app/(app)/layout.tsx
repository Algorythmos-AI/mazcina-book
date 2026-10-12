import Link from 'next/link';
import { Logo } from '@/components/logo';
import { Nav } from '@/components/nav';
import { requireRole } from '@/lib/session';
import { SignOutButton } from './sign-out-button';

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const user = await requireRole();
  return (
    <>
      <div className="bg-mazcina-ink text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="truncate text-[13px] font-medium text-mazcina-gold">{user.name ?? user.email}</span>
          <SignOutButton />
        </div>
      </div>
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-x-8 gap-y-2 px-4 pt-3 sm:px-6">
          <Link href="/" aria-label="Mazcina Kitchen home" className="pb-3">
            <Logo />
          </Link>
          {user.role !== 'staff' && <Nav />}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </>
  );
}
