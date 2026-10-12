'use client';

import { useActionState, useEffect, useRef, type ReactNode } from 'react';
import type { ActionResult } from '@/lib/types';
import { primary } from './ui';

type FormAction = (prev: ActionResult | null, form: FormData) => Promise<ActionResult>;

/** A form bound to a server action: shows the error or a saved note, and disables the button while it runs. */
export function ActionForm({
  action,
  submitLabel,
  savedLabel = 'Saved',
  resetOnSuccess = false,
  className,
  children,
}: {
  action: FormAction;
  submitLabel: string;
  savedLabel?: string;
  resetOnSuccess?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primary}>
          {pending ? 'Saving…' : submitLabel}
        </button>
        {!pending && state?.ok === false && (
          <p role="alert" className="text-sm font-semibold text-red-700">
            {state.error}
          </p>
        )}
        {!pending && state?.ok && (
          <p role="status" className="text-sm font-semibold text-emerald-700">
            {savedLabel}
          </p>
        )}
      </div>
    </form>
  );
}
