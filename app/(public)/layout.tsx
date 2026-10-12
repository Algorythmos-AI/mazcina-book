import { Logo } from '@/components/logo';

/** Pages customers see without signing in. Nothing here may show kitchen data. */
export default function PublicLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <header className="border-b border-gray-100 bg-white shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <a href="https://mazcinarestobar.com.au" aria-label="Mazcina Resto - Bar website">
            <Logo label="Resto - Bar" />
          </a>
          <a href="https://mazcinarestobar.com.au" className="text-sm font-semibold text-mazcina-wood underline-offset-4 hover:underline">
            Back to the website
          </a>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <footer className="bg-mazcina-ink px-4 py-6 text-center text-sm text-white/80">
        Mazcina Resto - Bar · 248 Palmer St, Darlinghurst NSW 2010
      </footer>
    </>
  );
}
