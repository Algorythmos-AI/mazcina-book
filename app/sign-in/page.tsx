import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/logo';
import { getCurrentUser } from '@/lib/session';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function SignInPage() {
  if (await getCurrentUser()) redirect('/');
  return (
    <main className="bg-marble-emerald flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-md bg-mazcina-surface p-6 shadow-2xl sm:p-8">
        <Logo size="lg" />
        <SignInForm />
      </div>
    </main>
  );
}
