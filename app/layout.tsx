import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ variable: '--font-jakarta', subsets: ['latin'] });
const cormorant = Cormorant_Garamond({
  variable: '--font-cormorant',
  subsets: ['latin'],
  weight: ['600', '700'],
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  title: { default: 'Mazcina Book', template: '%s | Mazcina Book' },
  description: 'Recipe costing for Mazcina Resto - Bar.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#0d2c23', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-AU" className={`${jakarta.variable} ${cormorant.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
