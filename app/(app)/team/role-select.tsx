'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { input } from '@/components/ui';
import type { Role } from '@/lib/allow-list';
import { setTeamRole } from '../actions';

export function RoleSelect({ id, role, name, disabled }: { id: string; role: Role; name: string; disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col gap-1">
      <label htmlFor={`role-${id}`} className="sr-only">Role for {name}</label>
      <select
        id={`role-${id}`}
        value={role}
        disabled={disabled || pending}
        className={`${input} w-32`}
        onChange={(e) => {
          const next = e.target.value as Role;
          start(async () => {
            setError(null);
            const result = await setTeamRole(id, next);
            if (!result.ok) setError(result.error);
            router.refresh();
          });
        }}
      >
        <option value="owner">Owner</option>
        <option value="chef">Chef</option>
        <option value="staff">Staff</option>
      </select>
      {error && <span role="alert" className="text-sm font-semibold text-red-700">{error}</span>}
    </span>
  );
}
