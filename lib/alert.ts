import { sendEmail } from './email';

/**
 * Tells a person that something needs them: a payment that did not match, an
 * email that could not be sent after every retry, a backup that failed. Always
 * logged with an [alert] prefix (searchable in Vercel logs); also emailed to
 * ALERT_EMAIL when it is set. Never throws: an alert must not turn a handled
 * problem into a crash.
 */
export async function alert(subject: string, detail: string): Promise<void> {
  console.error(`[alert] ${subject}\n${detail}`);
  const to = process.env.ALERT_EMAIL?.trim();
  if (!to) return;
  try {
    await sendEmail({ to, subject: `[Mazcina Kitchen] ${subject}`, text: `${detail}\n\nSent by the kitchen app (${process.env.VERCEL_ENV ?? 'development'}).` });
  } catch (error) {
    console.error('[alert] could not email the alert', error);
  }
}
