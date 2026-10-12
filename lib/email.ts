import { Resend } from 'resend';

const domain = process.env.RESEND_EMAIL_DOMAIN ?? 'mazcinarestobar.com.au';
const FROM = `Mazcina Book <book@${domain}>`;

export interface Email {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Production sends for real. Preview sends only to EMAIL_OVERRIDE_TO (so a
 * preview build can never email a customer). Local development prints to the
 * console instead of sending.
 */
export async function sendEmail(email: Email): Promise<void> {
  const env = process.env.VERCEL_ENV ?? 'development';
  if (env === 'development') {
    console.info(`[email:dev] to=${email.to} subject="${email.subject}"\n${email.text}`);
    return;
  }
  let to = email.to;
  if (env !== 'production') {
    const override = process.env.EMAIL_OVERRIDE_TO;
    if (!override) {
      console.warn(`[email:${env}] EMAIL_OVERRIDE_TO not set; not sending "${email.subject}"`);
      return;
    }
    to = override;
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');
  const { error } = await new Resend(apiKey).emails.send({
    from: FROM,
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
    replyTo: process.env.EMAIL_REPLY_TO || undefined,
  });
  if (error) throw new Error(`Resend: ${error.name}: ${error.message}`);
}
