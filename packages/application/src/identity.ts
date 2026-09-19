/// <reference types="bun-types/sqlite.d.ts" preserve="true" />
// Better Auth's adapter declarations refer to bun:sqlite even with PostgreSQL.
// Load only its official SQLite declaration, not Bun's conflicting runtime globals.
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { getMigrations } from 'better-auth/db/migration';
import { twoFactor } from 'better-auth/plugins/two-factor';
import type { Pool } from 'pg';

export interface IdentityMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}
export interface IdentityConfiguration {
  readonly baseURL: string;
  readonly secret: string;
  readonly secureCookies: boolean;
  readonly sendMail: (message: IdentityMail) => Promise<void>;
}

export function createIdentity(
  pool: Pool,
  configuration: IdentityConfiguration,
) {
  const origin = new URL(configuration.baseURL).origin;
  return betterAuth({
    appName: '3BONT FANTASY',
    // Profile changes update identity and application records atomically through /api/v1/profile.
    disabledPaths: ['/update-user', '/delete-user'],
    baseURL: origin,
    secret: configuration.secret,
    trustedOrigins: [origin],
    database: pool,
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const account = (
              await pool.query<{ suspended: boolean | null }>(
                'SELECT (closed_at IS NOT NULL OR suspended_until > clock_timestamp()) AS suspended FROM fantasy.accounts WHERE id=$1',
                [session.userId],
              )
            ).rows[0];
            if (!account)
              throw APIError.from('FORBIDDEN', {
                code: 'ACCOUNT_UNAVAILABLE',
                message: 'Account unavailable',
              });
            if (account.suspended)
              throw APIError.from('FORBIDDEN', {
                code: 'ACCOUNT_SUSPENDED',
                message: 'Account suspended',
              });
          },
        },
      },
      user: {
        create: {
          after: async (user) => {
            await pool.query(
              'INSERT INTO fantasy.accounts(id,display_name,suspended_until) VALUES($1,$2,NULL) ON CONFLICT(id) DO NOTHING',
              [user.id, user.name],
            );
          },
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await configuration.sendMail({
          to: user.email,
          subject: '3BONT FANTASY — إعادة تعيين كلمة المرور / Reset password',
          text: `لتغيير كلمة المرور افتح الرابط التالي. إذا لم تطلب ذلك، تجاهل الرسالة.\nTo reset your password, open the link below. If you did not request this, ignore this email.\n\n${url}`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) => {
        await configuration.sendMail({
          to: user.email,
          subject: '3BONT FANTASY — تأكيد البريد الإلكتروني / Verify email',
          text: `أهلاً بك في ٣ بونط فانتازي. أكّد بريدك الإلكتروني بالضغط على الرابط التالي.\nWelcome to 3BONT FANTASY. Verify your email using the link below.\n\n${url}`,
        });
      },
    },
    session: {
      expiresIn: 7 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      freshAge: 15 * 60,
      cookieCache: { enabled: false },
    },
    advanced: { useSecureCookies: configuration.secureCookies },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 3 },
        '/request-password-reset': { window: 60, max: 3 },
        '/send-verification-email': { window: 60, max: 3 },
        '/two-factor/verify-totp': { window: 60, max: 5 },
        '/two-factor/verify-backup-code': { window: 60, max: 5 },
        '/two-factor/enable': { window: 60, max: 5 },
        '/two-factor/disable': { window: 60, max: 5 },
        '/verify-password': { window: 60, max: 5 },
      },
    },
    plugins: [
      twoFactor({
        issuer: '3BONT FANTASY',
        skipVerificationOnEnable: false,
        accountLockout: {
          enabled: true,
          maxFailedAttempts: 5,
          durationSeconds: 900,
        },
      }),
    ],
  });
}

export type Identity = ReturnType<typeof createIdentity>;

export async function migrateIdentity(identity: Identity): Promise<void> {
  const migration = await getMigrations(identity.options);
  if (migration.schemaProblems.length > 0 || migration.unsafeChanges.length > 0)
    throw new Error('Identity migration needs operator review');
  await migration.runMigrations();
}
