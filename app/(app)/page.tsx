import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/session';

export default async function HomePage() {
  const user = await requireRole();
  if (user.role !== 'staff') redirect('/menu');
  return (
    <section>
      <h1 className="text-3xl font-extrabold tracking-tight">Welcome</h1>
      <p className="mt-2 text-mazcina-green">Gift card redemption will appear here.</p>
    </section>
  );
}
