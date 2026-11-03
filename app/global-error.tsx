'use client';

/** Last resort when even the root layout fails: no app styles can be relied on, so it stays plain. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-AU">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 24, color: '#0d2c23' }}>
        <h1>Mazcina Kitchen did not load</h1>
        <p>Check the connection and try again. If it keeps happening, message Sam.</p>
        <button type="button" onClick={reset} style={{ minHeight: 44, padding: '8px 20px', background: '#955412', color: 'white', border: 0, borderRadius: 2, fontWeight: 700 }}>
          Try again
        </button>
      </body>
    </html>
  );
}
