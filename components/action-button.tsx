'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { ActionResult } from '@/lib/types';
import { secondary } from './ui';

/** A button that runs a server action, with an optional "are you sure" step and the error shown beside it. */
export function ActionButton({
  action,
  label,
  confirm,
  className = secondary,
}: {
  action: () => Promise<ActionResult>;
  label: string;
  confirm?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        className={className}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            setError(null);
            const result = await action();
            if (!result.ok) setError(result.error);
            else router.refresh();
          });
        }}
      >
        {pending ? 'Working…' : label}
      </button>
      {error && (
        <span role="alert" className="text-sm font-semibold text-red-700">
          {error}
        </span>
      )}
    </span>
  );
}
