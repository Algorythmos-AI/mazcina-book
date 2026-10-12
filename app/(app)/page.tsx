import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/session';

export default async function HomePage() {
  const user = await requireRole();
  if (user.role !== 'staff') redirect('/recipes');
  return (
    <section>
      <h1 className="font-serif text-4xl font-bold italic">Welcome</h1>
      <p className="mt-2 text-mazcina-green">Gift card redemption will appear here.</p>
    </section>
  );
}
