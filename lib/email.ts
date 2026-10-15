import { Resend } from 'resend';

const domain = process.env.RESEND_EMAIL_DOMAIN ?? 'mazcinarestobar.com.au';
const SENDERS = {
  kitchen: `Mazcina Kitchen <kitchen@${domain}>`,
  giftCards: `Mazcina Resto - Bar <giftcards@${domain}>`,
} as const;

export interface Email {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Which address it comes from. Sign-in codes are `kitchen`; anything a customer receives is `giftCards`. */
  from?: keyof typeof SENDERS;
  /** Images shown inside the HTML, referenced there as `cid:<contentId>`. */
  inline?: { filename: string; content: Buffer; contentId: string }[];
  /** Resend sends at most one email per key (within 24 hours), so a retry after a crash is not a duplicate. */
  idempotencyKey?: string;
}

/**
 * Production sends for real. Preview sends only to EMAIL_OVERRIDE_TO (so a
 * preview build can never email a customer). Local development prints to the
 * console instead of sending.
 */
export async function sendEmail(email: Email): Promise<void> {
  const env = process.env.VERCEL_ENV ?? 'development';
  if (env === 'development') {
    const images = email.inline?.length ? `\n[with ${email.inline.map((i) => i.filename).join(', ')}]` : '';
    console.info(`[email:dev] to=${email.to} subject="${email.subject}"\n${email.text}${images}`);
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
    from: SENDERS[email.from ?? 'kitchen'],
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
    replyTo: process.env.EMAIL_REPLY_TO || undefined,
    attachments: email.inline?.map((i) => ({ filename: i.filename, content: i.content, contentId: i.contentId })),
  }, email.idempotencyKey ? { idempotencyKey: email.idempotencyKey } : undefined);
  if (error) throw new Error(`Resend: ${error.name}: ${error.message}`);
}
