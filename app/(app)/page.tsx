import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/session';

export default async function HomePage() {
  const user = await requireRole();
  redirect(user.role === 'staff' ? '/cards' : '/menu');
}
