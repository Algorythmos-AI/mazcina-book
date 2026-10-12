'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Re-checks the order every few seconds while the payment confirmation is on its way. */
export function Refresher({ attemptsLeft }: { attemptsLeft: number }) {
  const router = useRouter();
  useEffect(() => {
    if (attemptsLeft <= 0) return;
    const timer = setTimeout(() => router.refresh(), 3000);
    return () => clearTimeout(timer);
  });
  return null;
}
