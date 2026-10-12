import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage() {
  if (await getCurrentUser()) redirect('/');
  return (
    <main className="flex flex-1 items-center justify-center bg-mazcina-emerald px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl bg-mazcina-surface p-6 shadow-xl sm:p-8">
        <p className="font-serif text-4xl font-bold italic leading-none">Mazcina</p>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.3em] text-mazcina-wood">Book</p>
        <SignInForm />
      </div>
    </main>
  );
}
