import { createHash, randomUUID } from 'node:crypto';
import { sql, type Transaction, type Insertable } from 'kysely';
import { achievementWitness, pointUnits, rankEntries } from '@fantasy/domain';
import {
  achievementGrantSchema,
  type AchievementGrant,
  type AchievementDefinition,
  type Entry,
  type Gameweek,
} from '@fantasy/contracts';
import type { createDatabase, Database } from '@fantasy/persistence';
interface Score {
  entryId: string;
  gameweekId: string;
  revision: number;
  points: number;
  deductions: number;
  goals: number;
  settled: boolean;
}
function desiredGrants(
  definition: AchievementDefinition,
  entries: readonly Entry[],
  rounds: readonly Gameweek[],
  scores: Map<string, Map<string, Score>>,
  ranks: Map<string, Map<string, number>>,
) {
  const desired = new Map<
    string,
    { entry: Entry; witness: readonly number[]; fingerprint: string }
  >();
  for (const entry of [...entries].sort(
    (a, b) =>
      (a.activatedAt ?? '').localeCompare(b.activatedAt ?? '') ||
      a.id.localeCompare(b.id),
  )) {
    if (entry.activatedAt === null) continue;
    const first = rounds.find((r) => r.id === entry.firstGameweekId);
    if (!first) continue;
    const records = scores.get(entry.id);
    const witness = achievementWitness(
      definition.condition,
      definition.firstRound,
      Math.min(definition.lastRound, definition.activeUntilRound),
      first.number,
      rounds.map((r) => {
        const score = records?.get(r.id);
        return {
          number: r.number,
          finalized: r.status === 'finalized' && !!score?.settled,
          points: score ? pointUnits(score.points) : null,
          rank: ranks.get(r.id)?.get(entry.id) ?? null,
        };
      }),
    );
    if (witness === null) continue;
    const key =
      definition.scope === 'account'
        ? `account:${entry.accountId}`
        : `entry:${entry.id}`;
    if (desired.has(key)) continue;
    const evidence = witness.map((number) => {
      const r = rounds.find((g) => g.number === number);
      if (!r) throw new Error('Achievement witness unavailable');
      return { gameweekId: r.id, resultRevision: r.resultRevision };
    });
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          definitionId: definition.id,
          version: definition.version,
          entryId: entry.id,
          activatedAt: entry.activatedAt,
          evidence,
        }),
      )
      .digest('hex');
    desired.set(key, { entry, witness, fingerprint });
  }
  return desired;
}
/** The caller holds the parent competition lock; grants, revocations and evidence commit together. */
export async function reconcileAchievementsWithinTransaction(
  tx: Transaction<Database>,
  competitionId: string,
  actorId: string,
  reason: string,
): Promise<number> {
  const [definitionRows, entryRows, roundRows, scoreRows, existingRows] =
    await Promise.all([
      tx
        .selectFrom('achievement_definitions')
        .select('data')
        .where('competition_id', '=', competitionId)
        .where(sql<string>`data->>'state'`, '=', 'published')
        .execute(),
      tx
        .selectFrom('entries')
        .select('data')
        .where('competition_id', '=', competitionId)
        .where(sql<string>`data->>'status'`, '!=', 'draft')
        .execute(),
      tx
        .selectFrom('gameweeks')
        .select('data')
        .where('competition_id', '=', competitionId)
        .orderBy('number')
        .execute(),
      tx
        .selectFrom('entry_results')
        .innerJoin('gameweeks', 'gameweeks.id', 'entry_results.gameweek_id')
        .select([
          'entry_results.entry_id as entryId',
          'entry_results.gameweek_id as gameweekId',
          'entry_results.revision',
          'entry_results.points',
          sql<number>`(entry_results.payload->>'transferDeduction')::integer`.as(
            'deductions',
          ),
          sql<number>`(entry_results.payload->>'goals')::integer`.as('goals'),
          sql<boolean>`(entry_results.payload->>'settled')::boolean`.as(
            'settled',
          ),
        ])
        .where('entry_results.competition_id', '=', competitionId)
        .whereRef(
          'entry_results.revision',
          '=',
          sql<number>`(gameweeks.data->>'resultRevision')::integer`,
        )
        .execute(),
      tx
        .selectFrom('achievement_grants')
        .select('data')
        .where('competition_id', '=', competitionId)
        .execute(),
    ]);
  const entries = entryRows.map((e) => e.data),
    rounds = roundRows.map((r) => r.data),
    byEntry = new Map<string, Map<string, Score>>(),
    byRound = new Map<string, Score[]>();
  for (const score of scoreRows) {
    const entry = byEntry.get(score.entryId) ?? new Map<string, Score>();
    entry.set(score.gameweekId, score);
    byEntry.set(score.entryId, entry);
    const round = byRound.get(score.gameweekId) ?? [];
    round.push(score);
    byRound.set(score.gameweekId, round);
  }
  const owners = new Map(entries.map((e) => [e.id, e.accountId])),
    ranks = new Map<string, Map<string, number>>();
  for (const round of rounds.filter((r) => r.status === 'finalized')) {
    const scored = byRound.get(round.id) ?? [];
    const ranked = rankEntries(
      scored
        .filter((s) => s.settled)
        .map((s) => {
          const accountId = owners.get(s.entryId);
          if (!accountId)
            throw new Error('Scored achievement entry unavailable');
          return {
            entryId: s.entryId,
            accountId,
            points: pointUnits(s.points),
            transferDeductions: pointUnits(s.deductions),
            effectiveGoals: s.goals,
          };
        }),
      round.rules.ranking,
    );
    ranks.set(round.id, new Map(ranked.map((r) => [r.entryId, r.rank])));
  }
  const now = (
    await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
  ).rows[0]?.now;
  if (!now) throw new Error('Database clock unavailable');
  const changes: AchievementGrant[] = [],
    audits: Insertable<Database['audit_events']>[] = [];
  for (const { data: definition } of definitionRows) {
    const desired = desiredGrants(definition, entries, rounds, byEntry, ranks);
    const prior = existingRows
      .filter(
        (r) =>
          r.data.definitionId === definition.id &&
          r.data.version === definition.version,
      )
      .map((r) => r.data);
    const oldByScope = new Map(prior.map((g) => [g.scopeKey, g]));
    for (const [scopeKey, winner] of desired) {
      const old = oldByScope.get(scopeKey);
      if (old?.state === 'active' && old.fingerprint === winner.fingerprint)
        continue;
      const grant = achievementGrantSchema.parse({
        id: old?.id ?? randomUUID(),
        definitionId: definition.id,
        version: definition.version,
        competitionId,
        accountId: winner.entry.accountId,
        entryId: definition.scope === 'entry' ? winner.entry.id : null,
        scopeKey,
        witnessEntryId: winner.entry.id,
        witnessRounds: winner.witness,
        state: 'active',
        awardedAt: old?.awardedAt ?? now.toISOString(),
        changedAt: now.toISOString(),
        revision: (old?.revision ?? 0) + 1,
        fingerprint: winner.fingerprint,
      });
      changes.push(grant);
      audits.push({
        id: randomUUID(),
        actor_id: actorId,
        action: old ? 'achievement.reconciled' : 'achievement.granted',
        scope_id: competitionId,
        reason,
        payload: { before: old ?? null, after: grant },
      });
    }
    for (const old of prior.filter(
      (g) => g.state === 'active' && !desired.has(g.scopeKey),
    )) {
      const grant = achievementGrantSchema.parse({
        ...old,
        state: 'revoked',
        changedAt: now.toISOString(),
        revision: old.revision + 1,
      });
      changes.push(grant);
      audits.push({
        id: randomUUID(),
        actor_id: actorId,
        action: 'achievement.revoked',
        scope_id: competitionId,
        reason,
        payload: { before: old, after: grant },
      });
    }
  }
  for (let i = 0; i < changes.length; i += 100) {
    await tx
      .insertInto('achievement_grants')
      .values(
        changes.slice(i, i + 100).map((g) => ({
          id: g.id,
          definition_id: g.definitionId,
          version: g.version,
          competition_id: g.competitionId,
          account_id: g.accountId,
          entry_id: g.entryId,
          scope_key: g.scopeKey,
          data: g,
        })),
      )
      .onConflict((oc) =>
        oc.column('id').doUpdateSet({ data: sql`excluded.data` }),
      )
      .execute();
    await tx
      .insertInto('audit_events')
      .values(audits.slice(i, i + 100))
      .execute();
  }
  return changes.length;
}
export async function reconcileAchievements(
  db: ReturnType<typeof createDatabase>,
  competitionId?: string,
) {
  const rows = await db
    .selectFrom('achievement_definitions')
    .select('competition_id')
    .distinct()
    .where(sql<string>`data->>'state'`, '=', 'published')
    .$if(competitionId !== undefined, (q) =>
      q.where('competition_id', '=', competitionId ?? ''),
    )
    .execute();
  const result: { changed: number; failed: string[] } = {
    changed: 0,
    failed: [],
  };
  for (const row of rows)
    try {
      result.changed += await db.transaction().execute(async (tx) => {
        await tx
          .selectFrom('competitions')
          .select('id')
          .where('id', '=', row.competition_id)
          .forUpdate()
          .executeTakeFirstOrThrow();
        return reconcileAchievementsWithinTransaction(
          tx,
          row.competition_id,
          'system:achievements',
          'Reconcile achievements with published result evidence',
        );
      });
    } catch {
      result.failed.push(row.competition_id);
    }
  return result;
}
