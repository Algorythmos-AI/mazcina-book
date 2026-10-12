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
      className="rounded-lg border border-white/30 px-3 py-1.5 font-semibold"
    >
      Sign out
    </button>
  );
}
