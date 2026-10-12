import { requireRole } from '@/lib/session';

export default async function HomePage() {
  const user = await requireRole();
  return (
    <section>
      <h1 className="font-serif text-4xl font-bold italic">Welcome</h1>
      <p className="mt-2 text-mazcina-green">
        Signed in as {user.email} ({user.role}). Ingredients, recipes and the menu are being built.
      </p>
    </section>
  );
}
