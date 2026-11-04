'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        // Coming back needs a new code from email, so a stray tap should not cost that.
        if (!window.confirm('Sign out? To come back you will need a new code from your email.')) return;
        setBusy(true);
        await authClient.signOut();
        router.replace('/sign-in');
        router.refresh();
      }}
      className="min-h-11 shrink-0 bg-mazcina-wood px-4 text-sm font-semibold text-white transition-colors hover:bg-mazcina-wood-dark disabled:opacity-70"
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
