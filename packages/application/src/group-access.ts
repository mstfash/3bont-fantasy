import type { Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import type { LeagueGroup } from '@fantasy/contracts';
import { AccessDenied } from './authorization.ts';
/** viewerAccountId must come from the verified server session, never request data. */
export async function requireGroupReader(
  tx: Transaction<Database>,
  group: LeagueGroup,
  viewerAccountId: string | null,
): Promise<void> {
  if (group.visibility === 'public') return;
  if (!viewerAccountId) throw new AccessDenied();
  const account = await tx
    .selectFrom('accounts')
    .select(['suspended_until', 'closed_at'])
    .where('id', '=', viewerAccountId)
    .executeTakeFirst();
  if (
    !account ||
    account.closed_at !== null ||
    (account.suspended_until && account.suspended_until > new Date())
  )
    throw new AccessDenied();
  if (group.organizerId === viewerAccountId) return;
  const membership = await tx
    .selectFrom('group_memberships')
    .select('entry_id')
    .where('group_id', '=', group.id)
    .where('account_id', '=', viewerAccountId)
    .where('status', '=', 'active')
    .executeTakeFirst();
  if (!membership) throw new AccessDenied();
}
