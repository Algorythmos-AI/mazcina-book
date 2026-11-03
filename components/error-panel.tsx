'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { card, h1, muted, primary, secondary } from './ui';

/**
 * What anyone sees when a page fails to load: plain words, a way to try
 * again, and a way home. Nothing typed elsewhere is lost by trying again.
 */
export function ErrorPanel({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[page] failed to load', error);
  }, [error]);
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  return (
    <section className={`${card} mx-auto max-w-xl`} role="alert">
      <h1 className={h1}>{offline ? 'No connection' : 'This page did not load'}</h1>
      <p className="mt-3">
        {offline
          ? 'Your phone is offline. Check the wifi or signal, then try again.'
          : 'Something went wrong on our side. Try again; if it keeps happening, message Sam with what you were doing.'}
      </p>
      {error.digest && <p className={`mt-2 ${muted}`}>Reference: {error.digest}</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className={primary}>Try again</button>
        <Link href="/" className={secondary}>Go to the start</Link>
      </div>
    </section>
  );
}
