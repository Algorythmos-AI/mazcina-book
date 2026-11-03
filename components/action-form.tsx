'use client';

import { unstable_rethrow } from 'next/navigation';
import { startTransition, useActionState, useEffect, useRef, type ReactNode } from 'react';
import type { ActionResult } from '@/lib/types';
import { useToast } from './toast';
import { primary } from './ui';

type FormAction = (prev: ActionResult | null, form: FormData) => Promise<ActionResult>;

export const OFFLINE_MESSAGE = 'No connection. Nothing was lost: check your signal and try again.';

/** A request that never reached the server (no signal, server asleep): safe to try again. */
export function isConnectionError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof Error && /fetch|network|load failed/i.test(error.message));
}

/** Runs a server action from a click; a lost connection comes back as an error to show, not a crash. */
export async function safely<T>(run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch (error) {
    unstable_rethrow(error);
    if (isConnectionError(error)) return { ok: false, error: OFFLINE_MESSAGE };
    throw error;
  }
}

/**
 * A form bound to a server action: shows the error or a saved note, and
 * disables the button while it runs. Submitted by hand rather than through
 * `action=`, because React clears every field after a form action, even a
 * failed one, and a chef should not have to retype a price after a typo.
 */
export function ActionForm({
  action,
  submitLabel,
  savedLabel = 'Saved',
  resetOnSuccess = false,
  confirm,
  className,
  children,
}: {
  action: FormAction;
  submitLabel: string;
  savedLabel?: string;
  resetOnSuccess?: boolean;
  /** Asked before anything is sent, for actions that cannot be taken back. */
  confirm?: string;
  className?: string;
  children: ReactNode;
}) {
  // A redirect after saving is passed on by `safely`: it is not a failure.
  const [state, formAction, pending] = useActionState((prev: ActionResult | null, form: FormData) => safely(() => action(prev, form)), null);
  const ref = useRef<HTMLFormElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (!state?.ok) return;
    if (resetOnSuccess) ref.current?.reset();
    toast(savedLabel);
  }, [state, resetOnSuccess, savedLabel, toast]);

  return (
    <form
      ref={ref}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        if (confirm && !window.confirm(confirm)) return;
        const form = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(form));
      }}
      className={className}
    >
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
