import Link from 'next/link';

/** An address outside the app: no sign-in needed to see this, so it gives nothing away. */
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <section className="max-w-md rounded-md bg-mazcina-surface p-6 text-center shadow-sm">
        <h1 className="text-3xl font-extrabold">Not here</h1>
        <p className="mt-3">That page does not exist.</p>
        <p className="mt-5">
          <Link href="/" className="font-semibold text-mazcina-wood underline-offset-4 hover:underline">Go to Mazcina Kitchen</Link>
        </p>
      </section>
    </main>
  );
}
