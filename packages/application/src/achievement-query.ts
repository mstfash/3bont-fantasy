import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
export async function readAchievementAdministration(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  competitionId: string,
) {
  requireCapability(
    principal,
    grants,
    'competition.manage',
    competitionId,
    new Date(),
  );
  const [definitions, awarded, rounds] = await Promise.all([
    db
      .selectFrom('achievement_definitions')
      .select('data')
      .where('competition_id', '=', competitionId)
      .orderBy('id')
      .orderBy('version', 'desc')
      .execute(),
    db
      .selectFrom('achievement_grants')
      .select([
        'definition_id',
        'version',
        sql<string>`data->>'state'`.as('state'),
      ])
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('competition_id', '=', competitionId)
      .groupBy(['definition_id', 'version', sql`data->>'state'`])
      .execute(),
    db
      .selectFrom('gameweeks')
      .select('data')
      .where('competition_id', '=', competitionId)
      .orderBy('number')
      .execute(),
  ]);
  return {
    definitions: definitions.map((d) => d.data),
    awarded: awarded.map((a) => ({
      definitionId: a.definition_id,
      version: a.version,
      state: a.state,
      count: Number(a.count),
    })),
    rounds: rounds.map((r) => r.data),
  };
}
/** Public cosmetic awards never include upcoming squads, account email or authentication data. */
export async function readEntryAchievements(
  db: ReturnType<typeof createDatabase>,
  entryId: string,
) {
  const entry = await db
    .selectFrom('entries')
    .select(['competition_id', 'account_id'])
    .where('id', '=', entryId)
    .executeTakeFirst();
  if (!entry) return [];
  const rows = await db
    .selectFrom('achievement_grants')
    .innerJoin('achievement_definitions', (join) =>
      join
        .onRef(
          'achievement_definitions.id',
          '=',
          'achievement_grants.definition_id',
        )
        .onRef(
          'achievement_definitions.version',
          '=',
          'achievement_grants.version',
        ),
    )
    .select([
      'achievement_grants.data as grant',
      'achievement_definitions.data as definition',
    ])
    .where('achievement_grants.competition_id', '=', entry.competition_id)
    .where('achievement_grants.account_id', '=', entry.account_id)
    .where((eb) =>
      eb.or([
        eb('achievement_grants.entry_id', '=', entryId),
        eb('achievement_grants.entry_id', 'is', null),
      ]),
    )
    .where(sql<string>`achievement_grants.data->>'state'`, '=', 'active')
    .execute();
  return rows.map((r) => ({
    id: r.grant.id,
    name: r.definition.name,
    description: r.definition.description,
    icon: r.definition.icon,
    scope: r.definition.scope,
    version: r.definition.version,
    witnessRounds: r.grant.witnessRounds,
  }));
}
/** accountId is supplied by the verified server session for the private dashboard. */
export async function readAccountAchievements(
  db: ReturnType<typeof createDatabase>,
  accountId: string,
) {
  const rows = await db
    .selectFrom('achievement_grants')
    .innerJoin('achievement_definitions', (join) =>
      join
        .onRef(
          'achievement_definitions.id',
          '=',
          'achievement_grants.definition_id',
        )
        .onRef(
          'achievement_definitions.version',
          '=',
          'achievement_grants.version',
        ),
    )
    .leftJoin('entries', 'entries.id', 'achievement_grants.entry_id')
    .select([
      'achievement_grants.data as grant',
      'achievement_definitions.data as definition',
      'entries.data as entry',
    ])
    .where('achievement_grants.account_id', '=', accountId)
    .where(sql<string>`achievement_grants.data->>'state'`, '=', 'active')
    .execute();
  return rows.map((r) => ({
    id: r.grant.id,
    name: r.definition.name,
    description: r.definition.description,
    icon: r.definition.icon,
    scope: r.definition.scope,
    version: r.definition.version,
    witnessRounds: r.grant.witnessRounds,
    entryName: r.entry?.name ?? null,
  }));
}
/** The public competition route establishes visibility before loading its published catalogue. */
export async function readAchievementCatalogue(
  db: ReturnType<typeof createDatabase>,
  competitionId: string,
) {
  const rows = await db
    .selectFrom('achievement_definitions')
    .select('data')
    .where('competition_id', '=', competitionId)
    .where(sql<string>`data->>'state'`, '=', 'published')
    .orderBy('id')
    .orderBy('version')
    .execute();
  return rows.map((r) => r.data);
}
