import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { emailOTP } from 'better-auth/plugins';
import { and, eq, gt, sql } from 'drizzle-orm';
import { after } from 'next/server';
import { db, schema } from '@/db';
import { findAllowedUser, normaliseEmail } from '@/lib/allow-list';
import { sendEmail } from '@/lib/email';

/** Sign-in codes one address can be sent in an hour. */
const MAX_CODES_PER_HOUR = 5;

const DAY = 60 * 60 * 24;

function baseURL(): string | undefined {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  // Local development: taken from the request, whatever port the dev server is on.
  return undefined;
}

export const auth = betterAuth({
  baseURL: baseURL(),
  trustedOrigins: process.env.NODE_ENV === 'production' ? [] : ['http://localhost:*'],
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  rateLimit: { enabled: true, storage: 'database' },
  session: { expiresIn: 90 * DAY, updateAge: DAY },
  databaseHooks: {
    user: {
      create: {
        // Second gate behind the "no code is sent" rule: an account can only
        // ever be created for an allow-listed address.
        before: async (user) => {
          if (!(await findAllowedUser(user.email))) {
            throw new APIError('FORBIDDEN', { message: 'Not allowed' });
          }
        },
      },
    },
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 10 * 60,
      allowedAttempts: 5,
      storeOTP: 'hashed',
      rateLimit: { window: 60, max: 3 },
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== 'sign-in') return;
        // Sent after the response, so listed and unlisted addresses take the
        // same time and get the same answer: the list cannot be probed.
        after(async () => {
          try {
            if (!(await findAllowedUser(email))) return;
            // The built-in limit is per IP address; this one is per person, so
            // nobody can fill an owner's inbox (or the email quota) with codes.
            const to = normaliseEmail(email);
            const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
            const [{ sent }] = await db
              .select({ sent: sql<number>`count(*)::int` })
              .from(schema.auditLog)
              .where(and(eq(schema.auditLog.actorEmail, to), eq(schema.auditLog.action, 'code_sent'), gt(schema.auditLog.at, hourAgo)));
            if (sent >= MAX_CODES_PER_HOUR) {
              console.warn(`[auth] not sending a sign-in code to ${to}: ${sent} already sent in the last hour`);
              return;
            }
            await db.insert(schema.auditLog).values({ actorEmail: to, action: 'code_sent', entity: 'auth', entityId: '-' });
            await sendEmail({
              to: email,
              subject: `${otp} is your Mazcina Kitchen code`,
              text: `Your sign-in code is ${otp}\n\nIt expires in 10 minutes. If you did not ask for it, ignore this email.`,
            });
          } catch (error) {
            console.error('[auth] failed to send sign-in code', error);
          }
        });
      },
    }),
    nextCookies(),
  ],
});
