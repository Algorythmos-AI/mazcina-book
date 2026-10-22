/**
 * Every script that writes to a database calls this first. It names the
 * database it is about to change and waits for a "yes", so a DATABASE_URL
 * pointing somewhere unexpected (production, after a stray `vercel env pull`)
 * is caught before anything is written. Pass --yes to skip the question in a
 * script you have already checked; without a terminal and without --yes it
 * refuses.
 */
import { createInterface } from 'node:readline/promises';

export function describeTarget(url: string | undefined): string {
  if (!url) throw new Error('DATABASE_URL is not set');
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    throw new Error('DATABASE_URL is not a valid connection string');
  }
}

export async function confirmTarget(action: string): Promise<void> {
  const target = describeTarget(process.env.DATABASE_URL);
  const env = process.env.VERCEL_ENV ?? 'unset';
  console.log(`About to ${action}\n  database: ${target}\n  VERCEL_ENV: ${env}`);
  if (process.argv.includes('--yes')) return;
  if (!process.stdin.isTTY) throw new Error('Not confirmed. Run it in a terminal, or pass --yes once you have checked the database above.');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Type yes to continue: ');
  rl.close();
  if (answer.trim().toLowerCase() !== 'yes') throw new Error('Stopped. Nothing was changed.');
}
