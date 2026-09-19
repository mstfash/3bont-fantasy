import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import {
  staffCommandSchema,
  staffCommandResultSchema,
  staffRoleSchema,
  type StaffCommand,
  type StaffCommandResult,
} from '@fantasy/contracts';
import type { createDatabase } from '@fantasy/persistence';
import {
  AccessDenied,
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { CommandRejected } from './errors.ts';
type DB = ReturnType<typeof createDatabase>;

/** Role changes serialize platform-wide, including last-owner protection and current actor authority. */
export async function executeStaffCommand(
  db: DB,
  principal: Principal,
  grants: readonly StaffGrant[],
  input: StaffCommand,
): Promise<StaffCommandResult> {
  const command = staffCommandSchema.parse(input);
  requireCapability(principal, grants, 'staff.manage', null, new Date(), true);
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex');
  return db.transaction().execute(async (tx) => {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${'staff-management'},0))`.execute(
      tx,
    );
    const actor = await tx
      .selectFrom('accounts')
      .selectAll()
      .where('id', '=', principal.accountId)
      .forUpdate()
      .executeTakeFirst();
    const currentGrants = await tx
      .selectFrom('staff_grants')
      .selectAll()
      .where('account_id', '=', principal.accountId)
      .execute();
    const now = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (
      !now ||
      !actor ||
      actor.closed_at !== null ||
      (actor.suspended_until && actor.suspended_until > now)
    )
      throw new AccessDenied();
    requireCapability(
      principal,
      currentGrants.map((g) => ({
        role: staffRoleSchema.parse(g.role),
        competitionId: g.competition_id,
      })),
      'staff.manage',
      null,
      now,
      true,
    );
    const cached = await tx
      .selectFrom('commands')
      .selectAll()
      .where('actor_id', '=', principal.accountId)
      .where('command_id', '=', command.commandId)
      .executeTakeFirst();
    if (cached) {
      if (cached.fingerprint !== fingerprint)
        throw new CommandRejected('idempotency-conflict');
      return staffCommandResultSchema.parse(cached.result);
    }
    let result: StaffCommandResult;
    if (command.kind === 'grant') {
      const target = await tx
        .selectFrom('accounts')
        .selectAll()
        .where('id', '=', command.accountId)
        .forUpdate()
        .executeTakeFirst();
      if (
        !target ||
        target.closed_at !== null ||
        (target.suspended_until && target.suspended_until > now)
      )
        throw new CommandRejected('staff-account-unavailable');
      const identity = (
        await sql<{
          verified: boolean;
          mfa: boolean;
        }>`SELECT "emailVerified" AS verified,"twoFactorEnabled" AS mfa FROM "user" WHERE id=${command.accountId} FOR SHARE`.execute(
          tx,
        )
      ).rows[0];
      if (!identity?.verified)
        throw new CommandRejected('staff-verified-account-required');
      if (command.role === 'owner' && !identity.mfa)
        throw new CommandRejected('staff-owner-mfa-required');
      if (
        command.competitionId &&
        !(await tx
          .selectFrom('competitions')
          .select('id')
          .where('id', '=', command.competitionId)
          .executeTakeFirst())
      )
        throw new CommandRejected('competition-unavailable');
      const existing = await tx
        .selectFrom('staff_grants')
        .select('id')
        .where('account_id', '=', command.accountId)
        .where('role', '=', command.role)
        .where(
          'competition_id',
          command.competitionId === null ? 'is' : '=',
          command.competitionId,
        )
        .executeTakeFirst();
      if (existing) throw new CommandRejected('staff-grant-exists');
      const record = {
        id: randomUUID(),
        accountId: command.accountId,
        role: command.role,
        competitionId: command.competitionId,
      };
      await tx
        .insertInto('staff_grants')
        .values({
          id: record.id,
          account_id: record.accountId,
          role: record.role,
          competition_id: record.competitionId,
          granted_by: principal.accountId,
        })
        .execute();
      result = { grant: record, revoked: false };
    } else {
      const grant = await tx
        .selectFrom('staff_grants')
        .selectAll()
        .where('id', '=', command.grantId)
        .executeTakeFirst();
      if (!grant) throw new CommandRejected('staff-grant-changed');
      if (grant.role === 'owner' && grant.competition_id === null) {
        const otherOwner = (
          await sql<{
            id: string;
          }>`SELECT g.id FROM fantasy.staff_grants g JOIN fantasy.accounts a ON a.id=g.account_id JOIN "user" u ON u.id=g.account_id WHERE g.role='owner' AND g.competition_id IS NULL AND g.account_id<>${grant.account_id} AND a.closed_at IS NULL AND (a.suspended_until IS NULL OR a.suspended_until<=${now}) AND u."emailVerified" IS TRUE AND u."twoFactorEnabled" IS TRUE ORDER BY g.id LIMIT 1 FOR SHARE OF a,u`.execute(
            tx,
          )
        ).rows[0];
        if (!otherOwner) throw new CommandRejected('last-owner-protected');
      }
      await tx.deleteFrom('staff_grants').where('id', '=', grant.id).execute();
      result = {
        grant: {
          id: grant.id,
          accountId: grant.account_id,
          role: staffRoleSchema.parse(grant.role),
          competitionId: grant.competition_id,
        },
        revoked: true,
      };
    }
    // Both additions and removals invalidate privilege proofs; the next staff use must reverify.
    await tx
      .deleteFrom('staff_session_proofs')
      .where('account_id', '=', result.grant.accountId)
      .execute();
    await tx
      .insertInto('commands')
      .values({
        actor_id: principal.accountId,
        command_id: command.commandId,
        fingerprint,
        accepted_at: now,
        result,
      })
      .execute();
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: principal.accountId,
        action: `staff.${command.kind}`,
        scope_id: result.grant.accountId,
        reason: command.reason,
        payload: result,
      })
      .execute();
    return result;
  });
}
export async function readStaffDirectory(
  db: DB,
  principal: Principal,
  grants: readonly StaffGrant[],
  query: string,
) {
  requireCapability(principal, grants, 'staff.manage', null, new Date());
  const search = query.trim().slice(0, 200);
  const [staff, candidates, competitions] = await Promise.all([
    db
      .selectFrom('staff_grants')
      .innerJoin('accounts', 'accounts.id', 'staff_grants.account_id')
      .select([
        'staff_grants.id',
        'staff_grants.role',
        'staff_grants.competition_id',
        'staff_grants.account_id',
        'accounts.display_name',
      ])
      .orderBy('accounts.display_name')
      .orderBy('staff_grants.role')
      .execute(),
    search
      ? db
          .selectFrom('accounts')
          .select(['id', 'display_name'])
          .where((eb) =>
            eb.or([
              eb('id', '=', search),
              sql<boolean>`strpos(lower(display_name),lower(${search}))>0`,
            ]),
          )
          .orderBy('display_name')
          .orderBy('id')
          .limit(21)
          .execute()
      : Promise.resolve([]),
    db
      .selectFrom('competitions')
      .select(['id', 'data'])
      .orderBy('slug')
      .execute(),
  ]);
  return {
    staff: staff.map((s) => ({
      id: s.id,
      accountId: s.account_id,
      displayName: s.display_name,
      role: staffRoleSchema.parse(s.role),
      competitionId: s.competition_id,
    })),
    candidates: candidates
      .slice(0, 20)
      .map((a) => ({ id: a.id, displayName: a.display_name })),
    moreCandidates: candidates.length > 20,
    competitions: competitions.map((c) => ({ id: c.id, name: c.data.name })),
  };
}
