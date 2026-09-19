import type { createDatabase } from '@fantasy/persistence';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
/** Support receives operational projections, never a current squad, transfer list, bank, email or auth tokens. */
export async function readSupportEntries(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  competitionId: string,
  search: string,
) {
  requireCapability(
    principal,
    grants,
    'operations.read',
    competitionId,
    new Date(),
  );
  const query = search.trim().slice(0, 100);
  const rows = await db
    .selectFrom('entries')
    .innerJoin('accounts', 'accounts.id', 'entries.account_id')
    .select([
      'entries.id',
      'entries.account_id',
      'entries.revision',
      'accounts.display_name',
      'accounts.suspended_until',
      'accounts.closed_at',
    ])
    .select((eb) => [
      eb.ref('entries.data', '->>').key('name').as('name'),
      eb.ref('entries.data', '->>').key('status').as('status'),
      eb.ref('entries.data', '->>').key('activatedAt').as('activatedAt'),
      eb
        .ref('entries.data', '->>')
        .key('editingGameweekId')
        .as('editingGameweekId'),
    ])
    .where('entries.competition_id', '=', competitionId)
    .where((eb) =>
      eb.or([
        eb('accounts.id', '=', query),
        eb('accounts.display_name', 'ilike', `%${query}%`),
        eb(eb.ref('entries.data', '->>').key('name'), 'ilike', `%${query}%`),
      ]),
    )
    .orderBy('entries.id')
    .limit(30)
    .execute();
  const ids = rows.map((r) => r.id);
  const [snapshots, rounds, reviews] = await Promise.all([
    ids.length
      ? db
          .selectFrom('entry_snapshots')
          .select('entry_id')
          .select(({ fn }) => fn.countAll<string>().as('count'))
          .where('entry_id', 'in', ids)
          .groupBy('entry_id')
          .execute()
      : Promise.resolve([]),
    db
      .selectFrom('gameweeks')
      .select('data')
      .where('competition_id', '=', competitionId)
      .orderBy('number')
      .execute(),
    db
      .selectFrom('result_reviews')
      .innerJoin('gameweeks', 'gameweeks.id', 'result_reviews.gameweek_id')
      .select([
        'result_reviews.id',
        'result_reviews.gameweek_id',
        'result_reviews.status',
        'result_reviews.created_at',
      ])
      .where('gameweeks.competition_id', '=', competitionId)
      .where('result_reviews.status', '=', 'open')
      .orderBy('result_reviews.created_at', 'desc')
      .limit(30)
      .execute(),
  ]);
  return {
    entries: rows.map((r) => ({
      id: r.id,
      accountId: r.account_id,
      displayName: r.display_name,
      name: r.name,
      status: r.status,
      revision: r.revision,
      activatedAt: r.activatedAt,
      suspendedUntil: r.suspended_until?.toISOString() ?? null,
      closedAt: r.closed_at?.toISOString() ?? null,
      editingRound:
        rounds.find((g) => g.data.id === r.editingGameweekId)?.data.name ??
        null,
      lockedSnapshots: Number(
        snapshots.find((s) => s.entry_id === r.id)?.count ?? 0,
      ),
    })),
    rounds: rounds.map((r) => ({
      id: r.data.id,
      name: r.data.name,
      status: r.data.status,
      deadline: r.data.deadline,
    })),
    reviews: reviews.map((r) => ({
      id: r.id,
      gameweekId: r.gameweek_id,
      createdAt: r.created_at.toISOString(),
    })),
  };
}
