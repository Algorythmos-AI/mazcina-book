'use client';

import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await authClient.signOut();
        router.replace('/sign-in');
        router.refresh();
      }}
      className="min-h-11 shrink-0 bg-mazcina-wood px-4 text-sm font-semibold text-white transition-colors hover:bg-mazcina-wood-dark"
    >
      Sign out
    </button>
  );
}
