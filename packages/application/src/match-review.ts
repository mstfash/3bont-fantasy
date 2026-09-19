import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  fixtureSchema,
  matchReviewCommandSchema,
  matchReviewPreviewSchema,
  type MatchReviewCommand,
  type MatchReviewPreview,
} from '@fantasy/contracts';
import {
  capabilityScopes,
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { loadCurrentStaffWriteContext } from './staff-write-access.ts';
import { freezeFixtureAssignments } from './fixture-assignment-lock.ts';
import { applyMatchDataWithinTransaction } from './match-data.ts';
import { calculateResultImpact } from './result-impact.ts';
import { CommandRejected } from './errors.ts';
const digest = (value: object) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
class PreviewRollback extends Error {
  readonly preview: MatchReviewPreview;
  constructor(preview: MatchReviewPreview) {
    super(
      'Rollback match review including facts, evidence, audits and receipts',
    );
    this.preview = preview;
  }
}
/** The staff HTTP write path. Preview runs the same SQL mutation and rolls it back; apply binds all shared-fixture consequences. */
export async function executeMatchReview(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  input: MatchReviewCommand,
) {
  const request = matchReviewCommandSchema.parse(input);
  requireCapability(principal, grants, 'facts.manage', null, new Date(), true);
  try {
    return await db.transaction().execute(async (tx) => {
      const authority = await loadCurrentStaffWriteContext(tx, principal);
      requireCapability(
        principal,
        authority.grants,
        'facts.manage',
        null,
        authority.now,
        true,
      );
      await freezeFixtureAssignments(tx);
      const command = request.command;
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${principal.accountId}:${command.commandId}`},0))`.execute(
        tx,
      );
      const receipt = await tx
        .selectFrom('commands')
        .selectAll()
        .where('actor_id', '=', principal.accountId)
        .where('command_id', '=', command.commandId)
        .executeTakeFirst();
      const commandFingerprint = digest(request);
      if (receipt) {
        if (
          request.kind !== 'apply' ||
          receipt.fingerprint !== commandFingerprint
        )
          throw new CommandRejected('idempotency-conflict');
        return {
          kind: 'applied' as const,
          fixture: fixtureSchema.parse(receipt.result),
        };
      }
      const fixtureId =
        command.kind === 'import'
          ? command.observation.fixture.id
          : command.fixtureId;
      const reference = await tx
        .selectFrom('fixtures')
        .select('season_id')
        .where('id', '=', fixtureId)
        .executeTakeFirst();
      if (!reference) throw new CommandRejected('fixture-unavailable');
      // Assignment writes share the advisory barrier. Stable parent order matches closure and multi-competition operations.
      const competitions = await tx
        .selectFrom('competitions')
        .select(['id', 'data'])
        .where('season_id', '=', reference.season_id)
        .orderBy('id')
        .forUpdate()
        .execute();
      // Include all fixtures in this season: affected prize windows may depend on other rounds.
      await tx
        .selectFrom('fixtures')
        .select('id')
        .where('season_id', '=', reference.season_id)
        .orderBy('id')
        .forShare()
        .execute();
      const rounds = await tx
        .selectFrom('fixture_assignments')
        .innerJoin(
          'gameweeks',
          'gameweeks.id',
          'fixture_assignments.gameweek_id',
        )
        .select('gameweeks.data')
        .where('fixture_assignments.fixture_id', '=', fixtureId)
        .orderBy('gameweeks.id')
        .execute();
      const fixture = await applyMatchDataWithinTransaction(
        tx,
        principal,
        command,
        commandFingerprint,
      );
      const scopes = capabilityScopes(authority.grants, 'competition.manage');
      const visible = (id: string) =>
        scopes.some((s) => s === null || s === id);
      const summaries: MatchReviewPreview['rounds'] = [];
      const dependencies = [];
      for (const { data: round } of rounds) {
        const competition = competitions.find(
          (c) => c.id === round.competitionId,
        );
        if (!competition)
          throw new Error('Fixture assignment lost its competition');
        const impact =
          round.status === 'upcoming'
            ? null
            : await calculateResultImpact(tx, round);
        dependencies.push({
          round,
          competitionRevision: competition.data.revision,
          fingerprint: impact?.fingerprint ?? null,
        });
        if (!visible(round.competitionId)) continue;
        summaries.push({
          competitionId: competition.id,
          competitionName: competition.data.name,
          gameweekId: round.id,
          name: round.name,
          status: round.status,
          rulesVersion: round.rules.version,
          locked: round.status !== 'upcoming',
          settled: impact?.settled ?? false,
          changedSquads:
            impact?.changes.filter((c) => c.before !== c.after).length ?? 0,
          changedRanks:
            impact?.rankings?.filter((r) => r.beforeRank !== r.afterRank)
              .length ?? 0,
          classicGroups:
            impact?.groupImpact.groups.filter((g) => g.classic !== null)
              .length ?? 0,
          headToHeadEditions:
            impact?.groupImpact.groups.reduce(
              (n, g) => n + g.headToHead.length,
              0,
            ) ?? 0,
          prizePools: impact?.prizes.publishedPools ?? 0,
          heldPrizeProjections:
            impact?.prizeImpacts.filter((p) => p.after === null).length ?? 0,
        });
      }
      const competitionIds = [
        ...new Set(rounds.map((r) => r.data.competitionId)),
      ];
      const preview = matchReviewPreviewSchema.parse({
        fingerprint: digest({
          version: 'shared-fixture-review-v1',
          command,
          fixture,
          dependencies,
        }),
        affectedCompetitions: competitionIds.length,
        restrictedCompetitions: competitionIds.filter((id) => !visible(id))
          .length,
        rounds: summaries,
      });
      if (request.kind === 'preview') throw new PreviewRollback(preview);
      if (request.expectedFingerprint !== preview.fingerprint)
        throw new CommandRejected('match-preview-changed');
      await tx
        .insertInto('audit_events')
        .values({
          id: randomUUID(),
          actor_id: principal.accountId,
          action: 'match-data.reviewed',
          scope_id: fixtureId,
          reason: command.reason,
          payload: {
            reviewedFingerprint: preview.fingerprint,
            affectedCompetitions: competitionIds.length,
            affectedRounds: rounds.length,
          },
        })
        .execute();
      return { kind: 'applied' as const, fixture };
    });
  } catch (error) {
    if (error instanceof PreviewRollback)
      return { kind: 'preview' as const, preview: error.preview };
    throw error;
  }
}
