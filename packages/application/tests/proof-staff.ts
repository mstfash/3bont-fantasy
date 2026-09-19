import { randomUUID } from 'node:crypto';
import type { createDatabase } from '@fantasy/persistence';
import type { StaffGrant } from '../src/authorization.ts';
const created = new Set<string>();
/** Persist the same grants supplied to application commands; this does not bypass authorization. */
export async function grantProofStaff(
  db: ReturnType<typeof createDatabase>,
  accountId: string,
  grants: readonly StaffGrant[],
) {
  await db
    .insertInto('accounts')
    .values({
      id: accountId,
      display_name: 'Synthetic staff fixture',
      suspended_until: null,
    })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute();
  for (const grant of grants) {
    const row = await db
      .insertInto('staff_grants')
      .values({
        id: randomUUID(),
        account_id: accountId,
        role: grant.role,
        competition_id: grant.competitionId,
        granted_by: 'integration-fixture',
      })
      .onConflict((oc) =>
        oc.columns(['account_id', 'role', 'competition_id']).doNothing(),
      )
      .returning('id')
      .executeTakeFirst();
    if (row) created.add(row.id);
  }
}
export async function clearProofStaff(db: ReturnType<typeof createDatabase>) {
  if (created.size)
    await db
      .deleteFrom('staff_grants')
      .where('id', 'in', [...created])
      .execute();
  created.clear();
}
