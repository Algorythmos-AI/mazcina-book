'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { input as field, primary } from '@/components/ui';
import { authClient } from '@/lib/auth-client';

const input = `${field} mt-2 text-lg`;
const button = `${primary} mt-5 w-full`;

export function SignInForm() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: 'sign-in' });
    setBusy(false);
    if (error) {
      setError(error.status === 429 ? 'Too many tries. Wait a minute and try again.' : 'Could not send a code. Try again.');
      return;
    }
    setCode('');
    setStep('code');
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.emailOtp({ email: email.trim(), otp: code.trim() });
    if (error) {
      setBusy(false);
      setError(
        error.status === 429
          ? 'Too many tries. Wait a minute and try again.'
          : 'That code did not work. Check it, or ask for a new one.',
      );
      return;
    }
    router.replace('/');
    router.refresh();
  }

  if (step === 'email') {
    return (
      <form onSubmit={requestCode} className="mt-8">
        <label htmlFor="email" className="text-sm font-semibold">
          Your email
        </label>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className={button}>
          {busy ? 'Sending…' : 'Email me a code'}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="mt-8">
      <p className="text-sm">
        If <span className="font-semibold">{email.trim()}</span> has access, a 6-digit code is on its way. It lasts 10
        minutes.
      </p>
      <label htmlFor="code" className="mt-5 block text-sm font-semibold">
        Code
      </label>
      <input
        id="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        className={`${input} text-center text-2xl tracking-[0.4em]`}
      />
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy || code.length !== 6} className={button}>
        {busy ? 'Checking…' : 'Sign in'}
      </button>
      <button
        type="button"
        onClick={() => {
          setStep('email');
          setError(null);
        }}
        className="mt-3 block min-h-11 w-full text-sm font-semibold text-mazcina-wood underline-offset-4 hover:underline"
      >
        Use a different email or get a new code
      </button>
    </form>
  );
}
