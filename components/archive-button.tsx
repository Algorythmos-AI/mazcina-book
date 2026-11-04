'use client';

import { safely } from './action-form';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ActionResult } from '@/lib/types';
import { useToast } from './toast';
import { secondary } from './ui';

/** Moves something to the trash (or restores it). Nothing is ever deleted outright. */
export function ArchiveButton({
  action,
  archived,
  redirectTo,
}: {
  /** May return a warning to show after restoring (something it uses is still in the trash). */
  action: (archived: boolean) => Promise<ActionResult<{ warning?: string } | void>>;
  archived: boolean;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

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
            if (archived) toast((result.data && 'warning' in result.data && result.data.warning) || 'Restored');
            else {
              toast('Moved to the trash', {
                action: {
                  label: 'Undo',
                  run: async () => {
                    const undo = await safely(() => action(false));
                    if (!undo.ok) return `Could not undo: ${undo.error}`;
                    router.refresh();
                    return null;
                  },
                },
              });
            }
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
