'use client';

import { ErrorPanel } from '@/components/error-panel';

/** Catches what the kitchen layout itself throws (signing in, loading the menu count). */
export default function RootError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex flex-1 items-center px-4 py-12">
      <ErrorPanel {...props} />
    </main>
  );
}
