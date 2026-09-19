import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { z } from 'zod';
import type { createDatabase } from '@fantasy/persistence';

/** Operator CLI only: never expose as an HTTP endpoint or infer the owner from signup order. */
export async function bootstrapOwner(
  db: ReturnType<typeof createDatabase>,
  email: string,
): Promise<'created' | 'exists'> {
  const address = z.email().parse(email.trim().toLowerCase());
  return db.transaction().execute(async (tx) => {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended('staff-management',0))`.execute(
      tx,
    );
    const user = (
      await sql<{
        id: string;
        emailVerified: boolean;
        twoFactorEnabled: boolean;
      }>`SELECT id,"emailVerified","twoFactorEnabled" FROM "user" WHERE lower(email)=${address}`.execute(
        tx,
      )
    ).rows[0];
    if (!user?.emailVerified || !user.twoFactorEnabled)
      throw new Error(
        'First owner must have a verified email and confirmed authenticator enrollment',
      );
    const account = await tx
      .selectFrom('accounts')
      .selectAll()
      .where('id', '=', user.id)
      .forUpdate()
      .executeTakeFirst();
    const now = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (
      !account ||
      !now ||
      account.closed_at !== null ||
      (account.suspended_until && account.suspended_until > now)
    )
      throw new Error('First owner account is unavailable');
    const confirmed = (
      await sql<{
        id: string;
      }>`SELECT id FROM "user" WHERE id=${user.id} AND "emailVerified" IS TRUE AND "twoFactorEnabled" IS TRUE FOR SHARE`.execute(
        tx,
      )
    ).rows[0];
    if (!confirmed) throw new Error('First owner verification changed');
    const owners = await tx
      .selectFrom('staff_grants')
      .select('account_id')
      .where('role', '=', 'owner')
      .execute();
    if (owners.some((owner) => owner.account_id === user.id)) return 'exists';
    if (owners.length > 0)
      throw new Error(
        'An owner already exists; use the authenticated staff-management workflow',
      );
    await tx
      .insertInto('staff_grants')
      .values({
        id: randomUUID(),
        account_id: user.id,
        role: 'owner',
        competition_id: null,
        granted_by: 'operator-bootstrap',
      })
      .execute();
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: user.id,
        action: 'staff.owner.bootstrapped',
        scope_id: user.id,
        reason: 'Explicit operator CLI bootstrap',
        payload: {},
      })
      .execute();
    return 'created';
  });
}
