import { requireRole } from '@/lib/session';
import { SignOutButton } from './sign-out-button';

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const user = await requireRole();
  return (
    <>
      <header className="bg-mazcina-emerald text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <p className="font-serif text-2xl font-bold italic leading-none">
            Mazcina <span className="font-sans text-[10px] font-bold uppercase not-italic tracking-[0.3em] text-mazcina-gold">Book</span>
          </p>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-white/70 sm:inline">{user.name ?? user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
