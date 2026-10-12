import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { emailOTP } from 'better-auth/plugins';
import { after } from 'next/server';
import { db, schema } from '@/db';
import { findAllowedUser } from '@/lib/allow-list';
import { sendEmail } from '@/lib/email';

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
