import { createHash } from 'node:crypto';
import type { Transaction } from 'kysely';
import type { Database } from '@fantasy/persistence';
import {
  leagueGroupSchema,
  headToHeadEditionSchema,
  type Competition,
  type Gameweek,
  type EntryResult,
} from '@fantasy/contracts';
import { standingsWithinTransaction, compareStandings } from './leaderboard.ts';
import {
  loadHeadToHeadInputs,
  calculateHeadToHeadStandings,
} from './head-to-head-standings.ts';
import { requireGroupReader } from './group-access.ts';
import { AccessDenied } from './authorization.ts';

/** Internal impact includes private dependencies; only visibleGroupImpact may leave the staff read boundary. */
export async function calculateGroupResultImpact(
  tx: Transaction<Database>,
  competition: Competition,
  round: Gameweek,
  replacement: ReadonlyMap<string, EntryResult> | null,
) {
  const groupRows = await tx
    .selectFrom('league_groups')
    .select('data')
    .where('competition_id', '=', competition.id)
    .orderBy('id')
    .execute();
  const fingerprint = createHash('sha256').update('group-result-impact-v1');
  const groups = [];
  for (const row of groupRows) {
    const group = leagueGroupSchema.parse(row.data);
    const [memberships, start, editionRows] = await Promise.all([
      tx
        .selectFrom('group_memberships')
        .select(['entry_id', 'status', 'joined_at'])
        .where('group_id', '=', group.id)
        .orderBy('entry_id')
        .execute(),
      group.startGameweekId
        ? tx
            .selectFrom('gameweeks')
            .select('number')
            .where('id', '=', group.startGameweekId)
            .executeTakeFirstOrThrow()
        : null,
      tx
        .selectFrom('h2h_editions')
        .select('data')
        .where('group_id', '=', group.id)
        .orderBy('id')
        .execute(),
    ]);
    const fromRound = start?.number ?? 1;
    const classicApplies = round.number >= fromRound;
    const editions = editionRows
      .map((e) => headToHeadEditionSchema.parse(e.data))
      .filter(
        (e) => e.status === 'published' && e.gameweekIds.includes(round.id),
      );
    if (!classicApplies && editions.length === 0) continue;
    fingerprint.update(JSON.stringify({ group, memberships, fromRound }));
    const scope = {
      entryIds: memberships
        .filter((m) => m.status === 'active')
        .map((m) => m.entry_id),
      fromRound,
    };
    const [before, after] = classicApplies
      ? await Promise.all([
          standingsWithinTransaction(tx, competition, scope),
          replacement === null
            ? null
            : standingsWithinTransaction(tx, competition, {
                ...scope,
                replacement: {
                  gameweekId: round.id,
                  number: round.number,
                  results: replacement,
                },
              }),
        ])
      : [null, null];
    fingerprint.update(JSON.stringify({ before, after }));
    const classic =
      before === null ? null : { rankings: compareStandings(before, after) };
    const headToHead = [];
    for (const edition of editions) {
      const inputs = await loadHeadToHeadInputs(tx, edition);
      const published = calculateHeadToHeadStandings(edition, inputs);
      const projected =
        replacement === null
          ? null
          : calculateHeadToHeadStandings(edition, {
              ...inputs,
              rounds: inputs.rounds.map((r) =>
                r.id === round.id
                  ? {
                      ...r,
                      status: 'provisional',
                      resultRevision: Math.max(1, r.resultRevision),
                    }
                  : r,
              ),
              scores: [
                ...inputs.scores.filter((r) => r.gameweekId !== round.id),
                ...inputs.registrations.flatMap((r) => {
                  const score = replacement.get(r.id);
                  return score
                    ? [
                        {
                          entryId: r.id,
                          gameweekId: round.id,
                          total: score.total,
                        },
                      ]
                    : [];
                }),
              ],
            });
      fingerprint.update(JSON.stringify({ edition, inputs, projected }));
      headToHead.push({
        id: edition.id,
        name: edition.name,
        before: {
          table: published.table,
          matches: published.matches.filter((m) => m.gameweekId === round.id),
        },
        after:
          projected === null
            ? null
            : {
                table: projected.table,
                matches: projected.matches.filter(
                  (m) => m.gameweekId === round.id,
                ),
              },
      });
    }
    groups.push({ group, classic, headToHead });
  }
  return { fingerprint: fingerprint.digest('hex'), groups };
}

/** Preserve the participant group-reader policy; a competition role does not disclose private membership. */
export async function visibleGroupImpact(
  tx: Transaction<Database>,
  impact: Awaited<ReturnType<typeof calculateGroupResultImpact>>,
  accountId: string,
) {
  const groups = [];
  let restrictedGroups = 0;
  for (const item of impact.groups) {
    try {
      await requireGroupReader(tx, item.group, accountId);
    } catch (error) {
      if (!(error instanceof AccessDenied)) throw error;
      restrictedGroups++;
      continue;
    }
    groups.push({
      id: item.group.id,
      name: item.group.name,
      classic: item.classic,
      headToHead: item.headToHead,
    });
  }
  return { groups, restrictedGroups };
}
