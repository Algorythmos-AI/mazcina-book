import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { emailOTP } from 'better-auth/plugins';
import { and, eq, gt, sql } from 'drizzle-orm';
import { after } from 'next/server';
import { db, schema } from '@/db';
import { findAllowedUser, normaliseEmail } from '@/lib/allow-list';
import { sendEmail } from '@/lib/email';

/** Sign-in codes one address can ask for in an hour. */
const MAX_CODES_PER_HOUR = 5;
export const TOO_MANY_CODES = 'Too many codes asked for in the last hour. Use the most recent email, or wait an hour and ask again.';

/**
 * Counts code requests per address, for every address alike, before a code
 * is made. Checked first because each new request replaces the stored code:
 * capping only the email would let anyone who knows an owner's address keep
 * cancelling the code in their inbox. Every address is counted the same way,
 * listed or not, so the limit cannot be used to find out who is on the team.
 */
async function claimCodeRequest(email: string): Promise<boolean> {
  const to = normaliseEmail(email);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [{ asked }] = await db
    .select({ asked: sql<number>`count(*)::int` })
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.actorEmail, to), eq(schema.auditLog.action, 'code_requested'), gt(schema.auditLog.at, hourAgo)));
  if (asked >= MAX_CODES_PER_HOUR) return false;
  await db.insert(schema.auditLog).values({ actorEmail: to, action: 'code_requested', entity: 'auth', entityId: '-' });
  return true;
}

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
  // A preview can be opened by its own address or its branch address; both must be able to sign in.
  trustedOrigins:
    process.env.NODE_ENV !== 'production'
      ? ['http://localhost:*']
      : process.env.VERCEL_ENV === 'preview'
        ? [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL].filter((h): h is string => !!h).map((h) => `https://${h}`)
        : [],
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  rateLimit: { enabled: true, storage: 'database' },
  session: { expiresIn: 90 * DAY, updateAge: DAY },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/email-otp/send-verification-otp') return;
      const email = typeof ctx.body?.email === 'string' ? ctx.body.email : '';
      if (email && !(await claimCodeRequest(email))) throw new APIError('TOO_MANY_REQUESTS', { message: TOO_MANY_CODES });
    }),
  },
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
            // The per-person limit was applied before the code was made (claimCodeRequest).
            const to = normaliseEmail(email);
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
