'use client';

import { safely } from './action-form';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ActionResult } from '@/lib/types';
import { secondary } from './ui';

/** Moves something to the trash (or restores it). Nothing is ever deleted outright. */
export function ArchiveButton({
  action,
  archived,
  redirectTo,
}: {
  action: (archived: boolean) => Promise<ActionResult>;
  archived: boolean;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className={secondary}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await safely(() => action(!archived));
            if (!result.ok) return setError(result.error);
            if (redirectTo && !archived) router.push(redirectTo);
            else router.refresh();
          })
        }
      >
        {pending ? 'Working…' : archived ? 'Restore' : 'Move to trash'}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
