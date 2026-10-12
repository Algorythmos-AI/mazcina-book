import 'server-only';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { auth } from '@/lib/auth';
import { findAllowedUser, type Role } from '@/lib/allow-list';

export interface CurrentUser {
  email: string;
  name: string | null;
  role: Role;
}

/**
 * The signed-in person, or null. The role comes from the allow-list on every
 * request, so removing someone from the list locks them out at once even if
 * their session cookie is still valid.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const allowed = await findAllowedUser(session.user.email);
  if (!allowed) return null;
  return { email: allowed.email, name: allowed.name, role: allowed.role };
});

/**
 * Gate for pages, server actions and queries. Call it inside every one of
 * them: server actions are reachable directly, so a layout check is not enough.
 */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  if (roles.length > 0 && !roles.includes(user.role)) notFound();
  return user;
}
