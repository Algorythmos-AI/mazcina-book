import type { Metadata } from 'next';
import { ActionButton } from '@/components/action-button';
import { ActionForm } from '@/components/action-form';
import { badgeWarn, card, h1, h2, input, label, muted } from '@/components/ui';
import { loadTeam } from '@/lib/queries';
import { requireRole } from '@/lib/session';
import { addTeamMember, removeTeamMember } from '../actions';
import { RoleSelect } from './role-select';

export const metadata: Metadata = { title: 'Team' };

export default async function TeamPage() {
  const user = await requireRole('owner');
  const team = await loadTeam();
  const owners = team.filter((m) => m.role === 'owner').length;

  return (
    <div className="space-y-6">
      <h1 className={h1}>Team</h1>

      {owners < 2 && (
        <p className={badgeWarn}>Only one owner. Add a second owner so nobody can be locked out.</p>
      )}

      <section className={card}>
        <h2 className={h2}>Who can sign in</h2>
        <ul className="mt-2 divide-y divide-gray-100">
          {team.map((member) => {
            const self = member.email.toLowerCase() === user.email.toLowerCase();
            const display = member.name ?? member.email;
            return (
              <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {display}
                    {self && <span className={`ml-2 ${muted}`}>(you)</span>}
                  </p>
                  {member.name && <p className={`truncate ${muted}`}>{member.email}</p>}
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <RoleSelect id={member.id} role={member.role} name={display} disabled={self} />
                  {!self && (
                    <ActionButton
                      action={removeTeamMember.bind(null, member.id)}
                      label="Remove"
                      confirm={`Remove ${display}? They are signed out straight away.`}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p className={`mt-3 ${muted}`}>
          Owners can do everything, including this page. Chefs manage the menu, recipes, ingredients and prices. Staff will only redeem gift
          cards and never see costs.
        </p>
      </section>

      <section className={card}>
        <h2 className={h2}>Give someone access</h2>
        <ActionForm action={addTeamMember} submitLabel="Add person" savedLabel="Added" resetOnSuccess className="mt-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="team-email" className={label}>Email</label>
              <input id="team-email" name="email" type="email" inputMode="email" autoCapitalize="none" required maxLength={200} className={input} />
            </div>
            <div>
              <label htmlFor="team-name" className={label}>Name (optional)</label>
              <input id="team-name" name="name" maxLength={80} className={input} />
            </div>
            <div>
              <label htmlFor="team-role" className={label}>Role</label>
              <select id="team-role" name="role" defaultValue="chef" className={input}>
                <option value="owner">Owner</option>
                <option value="chef">Chef</option>
                <option value="staff">Staff</option>
              </select>
            </div>
          </div>
          <p className={`mt-2 ${muted}`}>They sign in with a 6-digit code sent to this email. No password to set up.</p>
        </ActionForm>
      </section>
    </div>
  );
}
