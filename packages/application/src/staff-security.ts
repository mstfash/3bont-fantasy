import { staffRoleSchema } from '@fantasy/contracts';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { z } from 'zod';
import type { createDatabase } from '@fantasy/persistence';
import {
  AccessDenied,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import type { Identity } from './identity.ts';

export const staffChallengeSchema = z.strictObject({
  password: z.string().min(1).max(128),
  code: z.string().regex(/^\d{6}$/u),
});
type Database = ReturnType<typeof createDatabase>;

/** Identity session/user values come from Better Auth on every request, never a client principal. */
export async function loadStaffContext(
  db: Database,
  session: NonNullable<Awaited<ReturnType<Identity['api']['getSession']>>>,
) {
  const [account, rows, proof] = await Promise.all([
    db
      .selectFrom('accounts')
      .selectAll()
      .where('id', '=', session.user.id)
      .executeTakeFirst(),
    db
      .selectFrom('staff_grants')
      .selectAll()
      .where('account_id', '=', session.user.id)
      .execute(),
    db
      .selectFrom('staff_session_proofs')
      .selectAll()
      .where('session_id', '=', session.session.id)
      .where('account_id', '=', session.user.id)
      .executeTakeFirst(),
  ]);
  if (
    !account ||
    !session.user.emailVerified ||
    account.closed_at !== null ||
    (account.suspended_until && account.suspended_until > new Date())
  )
    throw new AccessDenied();
  const principal: Principal = {
    accountId: session.user.id,
    sessionId: session.session.id,
    emailVerified: session.user.emailVerified,
    mfaVerifiedAt:
      session.user.twoFactorEnabled && proof ? proof.mfa_verified_at : null,
    authenticatedAt: proof?.password_verified_at ?? session.session.createdAt,
  };
  const grants: StaffGrant[] = rows.map((row) => ({
    role: staffRoleSchema.parse(row.role),
    competitionId: row.competition_id,
  }));
  return { principal, grants };
}

export class StaffChallengeLimited extends Error {}

export async function verifyStaffChallenge(
  db: Database,
  identity: Identity,
  headers: Headers,
  input: z.infer<typeof staffChallengeSchema>,
): Promise<void> {
  const challenge = staffChallengeSchema.parse(input);
  const session = await identity.api.getSession({ headers });
  if (!session || !session.user.twoFactorEnabled) throw new AccessDenied();
  const { grants } = await loadStaffContext(db, session);
  if (grants.length === 0) throw new AccessDenied();
  // Reserve each attempt durably before invoking server APIs, whose HTTP rate limiter is bypassed.
  const reserved = await sql<{ account_id: string }>`
    INSERT INTO fantasy.staff_verification_limits(account_id,window_started_at,attempts)
    VALUES(${session.user.id},clock_timestamp(),1)
    ON CONFLICT(account_id) DO UPDATE SET
      window_started_at=CASE WHEN fantasy.staff_verification_limits.window_started_at <= clock_timestamp()-interval '1 minute' THEN clock_timestamp() ELSE fantasy.staff_verification_limits.window_started_at END,
      attempts=CASE WHEN fantasy.staff_verification_limits.window_started_at <= clock_timestamp()-interval '1 minute' THEN 1 ELSE fantasy.staff_verification_limits.attempts+1 END
    WHERE fantasy.staff_verification_limits.window_started_at <= clock_timestamp()-interval '1 minute' OR fantasy.staff_verification_limits.attempts<5
    RETURNING account_id`.execute(db);
  if (reserved.rows.length === 0) throw new StaffChallengeLimited();
  await identity.api.verifyPassword({
    headers,
    body: { password: challenge.password },
  });
  await identity.api.verifyTOTP({
    headers,
    body: { code: challenge.code, trustDevice: false },
  });
  await db.transaction().execute(async (tx) => {
    const now = sql<Date>`clock_timestamp()`;
    await tx
      .insertInto('staff_session_proofs')
      .values({
        session_id: session.session.id,
        account_id: session.user.id,
        mfa_verified_at: now,
        password_verified_at: now,
      })
      .onConflict((oc) =>
        oc
          .column('session_id')
          .doUpdateSet({ mfa_verified_at: now, password_verified_at: now }),
      )
      .execute();
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: session.user.id,
        action: 'staff.session.verified',
        scope_id: session.session.id,
        reason: null,
        payload: {},
      })
      .execute();
  });
}
