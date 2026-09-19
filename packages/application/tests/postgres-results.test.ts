import { grantProofStaff, clearProofStaff } from './proof-staff.ts';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  competitionSchema,
  gameweekSchema,
  fixtureSchema,
  entryCommandSchema,
  entryResultSchema,
  matchDataCommandSchema,
  prizePoolSchema,
  prizeProposalSchema,
  lockedEntrySchema,
} from '@fantasy/contracts';
import { assessPlayerPool, POSITIONS } from '@fantasy/domain';
import { seedDemo } from '../src/demo.ts';
import { competitionStandings } from '../src/leaderboard.ts';
import { advanceDueGameweeks } from '../src/deadlines.ts';
import { executeEntryCommand } from '../src/entry-commands.ts';
import { executeSetupCommand } from '../src/competition-setup.ts';
import { previewGameweekResults } from '../src/result-preview.ts';
import { executeMatchDataCommand } from '../src/match-data.ts';
import {
  publishGameweekResults,
  executeResultCommand,
} from '../src/results.ts';

const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use disposable integration runner');
const pool = new Pool({ connectionString, max: 6 });
const db = createDatabase(pool);
before(async () => {
  await migrateApplication(pool);
});
after(async () => {
  await clearProofStaff(db);
  await db.destroy();
});
void test('scoring publishes coherent revisions, respects persistent overrides and reviews late corrections', async () => {
  await seedDemo(db);
  const template = competitionSchema.parse(
    (
      await db
        .selectFrom('competitions')
        .select('data')
        .where('slug', '=', 'cairo-demo')
        .executeTakeFirstOrThrow()
    ).data,
  );
  const competition = {
    ...template,
    id: randomUUID(),
    slug: 'result-proof',
    rules: { ...template.rules, correctionWindowHours: 0 },
  };
  await db
    .insertInto('competitions')
    .values({
      id: competition.id,
      season_id: competition.seasonId,
      slug: competition.slug,
      revision: competition.revision,
      data: competition,
    })
    .execute();
  const market = await db
    .selectFrom('competition_players')
    .innerJoin(
      'footballers',
      'footballers.id',
      'competition_players.footballer_id',
    )
    .select(['competition_players.data', 'footballers.club_id'])
    .where('competition_players.competition_id', '=', template.id)
    .execute();
  for (const p of market)
    await db
      .insertInto('competition_players')
      .values({
        competition_id: competition.id,
        footballer_id: p.data.footballerId,
        data: { ...p.data, competitionId: competition.id },
      })
      .execute();
  const round = gameweekSchema.parse({
    id: randomUUID(),
    competitionId: competition.id,
    number: 1,
    name: { ar: 'اختبار النقاط', en: 'Scoring proof' },
    deadline: new Date(Date.now() + 86400_000).toISOString(),
    status: 'upcoming',
    rules: competition.rules,
    resultRevision: 0,
    lastMaterialChangeAt: null,
    finalizedAt: null,
    issues: [],
  });
  await db
    .insertInto('gameweeks')
    .values({
      id: round.id,
      competition_id: competition.id,
      number: 1,
      deadline: round.deadline,
      data: round,
    })
    .execute();
  const originals = await db
    .selectFrom('fixtures')
    .select('data')
    .where('season_id', '=', competition.seasonId)
    .orderBy('kickoff')
    .limit(3)
    .execute();
  const fixtures = originals.map((f) =>
    fixtureSchema.parse({ ...f.data, id: randomUUID() }),
  );
  for (const f of fixtures) {
    await db
      .insertInto('fixtures')
      .values({ id: f.id, season_id: f.seasonId, kickoff: f.kickoff, data: f })
      .execute();
    await db
      .insertInto('fixture_assignments')
      .values({
        competition_id: competition.id,
        fixture_id: f.id,
        gameweek_id: round.id,
      })
      .execute();
  }
  const owner = {
    accountId: 'scoring-participant',
    sessionId: 'scoring-session',
    emailVerified: true,
    mfaVerifiedAt: new Date(),
    authenticatedAt: new Date(),
  };
  const grants = [{ role: 'owner' as const, competitionId: null }];
  await db
    .insertInto('accounts')
    .values({
      id: owner.accountId,
      display_name: 'Scoring participant',
      suspended_until: null,
    })
    .execute();
  await grantProofStaff(db, owner.accountId, grants);
  const selection = assessPlayerPool(
    market.map((p) => ({
      footballerId: p.data.footballerId,
      clubId: p.club_id,
      position: p.data.position,
      price: p.data.price,
    })),
    competition.rules.squad,
  );
  assert.ok(selection.ready);
  const selected = market.filter((p) =>
    selection.footballerIds.includes(p.data.footballerId),
  );
  const formation = competition.rules.squad.formations[0];
  assert.ok(formation);
  const starters = POSITIONS.flatMap((position) =>
    selected
      .filter((p) => p.data.position === position)
      .slice(0, formation[position])
      .map((p) => p.data.footballerId),
  );
  const captainId = starters[0];
  const viceCaptainId = starters[1];
  assert.ok(captainId && viceCaptainId);
  const entry = await executeEntryCommand(
    db,
    owner,
    entryCommandSchema.parse({
      kind: 'create',
      commandId: randomUUID(),
      competitionId: competition.id,
      gameweekId: round.id,
      name: 'Scoring XI',
      players: selected.map((p) => ({
        footballerId: p.data.footballerId,
        priceRevision: p.data.priceRevision,
      })),
      lineup: {
        starterIds: starters,
        reserveIds: selected
          .filter((p) => !starters.includes(p.data.footballerId))
          .map((p) => p.data.footballerId),
        captaincy: { captainId, viceCaptainId },
      },
    }),
  );
  const deadline = new Date(Date.now() - 1000).toISOString();
  await db
    .updateTable('gameweeks')
    .set({ deadline, data: { ...round, deadline } })
    .where('id', '=', round.id)
    .execute();
  await advanceDueGameweeks(db);
  const pending = await publishGameweekResults(db, round.id);
  assert.equal(pending.status, 'provisional');
  const emptyResult = entryResultSchema.parse(
    (
      await db
        .selectFrom('entry_results')
        .select('payload')
        .where('entry_id', '=', entry.id)
        .where('revision', '=', pending.revision)
        .executeTakeFirstOrThrow()
    ).payload,
  );
  assert.equal(emptyResult.total, 0);
  assert.equal(emptyResult.settled, false);
  assert.equal(emptyResult.substitutions.length, 0);
  const statistics = {
    minutes: 90,
    goals: 0,
    assists: 0,
    ownGoals: 0,
    penaltyMisses: 0,
    concededWhileOnPitch: 0,
    concededAfterDismissal: 0,
    savesIncludingPenalties: 0,
    penaltySaves: 0,
  };
  for (const fixture of fixtures) {
    const eligible = market.filter((p) =>
      [fixture.homeClubId, fixture.awayClubId].includes(p.club_id),
    );
    await executeMatchDataCommand(
      db,
      owner,
      grants,
      matchDataCommandSchema.parse({
        kind: 'import',
        commandId: randomUUID(),
        expectedRevision: fixture.revision,
        reason: 'Synthetic completed match evidence',
        source: 'integration-fixtures',
        observation: {
          fixture: {
            ...fixture,
            status: 'finished',
            factsComplete: true,
            homeGoals: 0,
            awayGoals: 0,
          },
          eligibilityComplete: true,
          eligibleFootballerIds: eligible.map((p) => p.data.footballerId),
          performances: eligible.map((p) => ({
            footballerId: p.data.footballerId,
            statistics,
            discipline: { kind: 'none' },
          })),
        },
      }),
    );
  }
  const finalized = await publishGameweekResults(db, round.id);
  assert.equal(finalized.status, 'finalized');
  const firstScore = entryResultSchema.parse(
    (
      await db
        .selectFrom('entry_results')
        .select('payload')
        .where('entry_id', '=', entry.id)
        .where('revision', '=', finalized.revision)
        .executeTakeFirstOrThrow()
    ).payload,
  );
  assert.ok(firstScore.total > 0);
  const captain = selected.find((p) => p.data.footballerId === captainId);
  assert.ok(captain);
  const fixture = fixtures.find((f) =>
    [f.homeClubId, f.awayClubId].includes(captain.club_id),
  );
  assert.ok(fixture);
  const fact = await db
    .selectFrom('fact_revisions')
    .select('revision')
    .where('fixture_id', '=', fixture.id)
    .where('footballer_id', '=', captainId)
    .orderBy('revision', 'desc')
    .executeTakeFirstOrThrow();
  const override = await executeMatchDataCommand(
    db,
    owner,
    grants,
    matchDataCommandSchema.parse({
      kind: 'override',
      commandId: randomUUID(),
      fixtureId: fixture.id,
      footballerId: captainId,
      expectedRevision: fact.revision,
      reason: 'Correct the captain assist with evidence',
      change: {
        kind: 'performance',
        statistics: { ...statistics, assists: 1 },
        discipline: { kind: 'none' },
      },
    }),
  );
  const reviews = await Promise.all([
    publishGameweekResults(db, round.id),
    publishGameweekResults(db, round.id),
  ]);
  assert.ok(
    reviews.every(
      (r) => r.status === 'review' && r.revision === finalized.revision,
    ),
  );
  assert.equal(
    (
      await db
        .selectFrom('result_reviews')
        .select('id')
        .where('gameweek_id', '=', round.id)
        .where('status', '=', 'open')
        .execute()
    ).length,
    1,
  );
  // A later entrant can move down even though its own result is untouched.
  const laterRound = {
    ...round,
    id: randomUUID(),
    number: 2,
    status: 'finalized' as const,
    resultRevision: 1,
  };
  await db
    .insertInto('gameweeks')
    .values({
      id: laterRound.id,
      competition_id: competition.id,
      number: 2,
      deadline: laterRound.deadline,
      data: laterRound,
    })
    .execute();
  const rival = {
    ...entry,
    id: randomUUID(),
    name: 'Untouched rival',
    firstGameweekId: laterRound.id,
    editingGameweekId: laterRound.id,
  };
  await db
    .insertInto('entries')
    .values({
      id: rival.id,
      competition_id: competition.id,
      account_id: owner.accountId,
      revision: rival.revision,
      data: rival,
    })
    .execute();
  const rivalScore = entryResultSchema.parse({
    ...firstScore,
    total: firstScore.total + 3000,
  });
  await db
    .insertInto('entry_results')
    .values({
      entry_id: rival.id,
      competition_id: competition.id,
      gameweek_id: laterRound.id,
      revision: 1,
      points: rivalScore.total,
      payload: rivalScore,
      published_at: new Date(),
    })
    .execute();
  const impact = await previewGameweekResults(db, owner, grants, round.id);
  const rivalImpact = impact.rankings?.find((row) => row.entryId === rival.id);
  assert.deepEqual(rivalImpact, {
    entryId: rival.id,
    name: rival.name,
    beforeRank: 1,
    afterRank: 2,
    beforePoints: rivalScore.total,
    afterPoints: rivalScore.total,
  });
  assert.equal(
    impact.rankings?.find((row) => row.entryId === entry.id)?.afterRank,
    1,
  );
  assert.equal(
    impact.changes.find((row) => row.entryId === entry.id)?.after,
    firstScore.total + 6000,
  );
  const reopen = {
    kind: 'reopen' as const,
    commandId: randomUUID(),
    gameweekId: round.id,
    expectedResultRevision: finalized.revision,
    expectedFingerprint: impact.fingerprint,
    reason: 'Reviewed score, rank and prize dependencies',
  };
  // The football facts are unchanged, but a newly published prize changes the reviewed consequences.
  const prize = prizePoolSchema.parse({
    id: randomUUID(),
    competitionId: competition.id,
    revision: 1,
    name: { ar: 'جائزة الاختبار', en: 'Correction proof prize' },
    description: { ar: 'جائزة اختبار', en: 'Synthetic correction dependency' },
    firstGameweekId: round.id,
    lastGameweekId: round.id,
    groupId: null,
    eligibilityCutoff: round.deadline,
    currency: 'EGP',
    places: [{ kind: 'cash', amountMinor: 10000 }],
    oneAwardPerAccount: true,
    state: 'published',
    synthetic: true,
    gameweekIds: [round.id],
    publishedAt: new Date().toISOString(),
    evidenceReference: 'Synthetic fixture only',
    ranking: 'shared',
  });
  await db
    .insertInto('prize_pools')
    .values({
      id: prize.id,
      competition_id: competition.id,
      group_id: null,
      revision: 1,
      data: prize,
    })
    .execute();
  await assert.rejects(executeResultCommand(db, owner, grants, reopen), {
    code: 'preview-changed',
  });
  const withPrize = await previewGameweekResults(db, owner, grants, round.id);
  assert.equal(withPrize.factsFingerprint, impact.factsFingerprint);
  assert.notEqual(withPrize.fingerprint, impact.fingerprint);
  assert.deepEqual(withPrize.prizes, {
    publishedPools: 1,
    pendingProposals: 0,
    fulfilledProposals: 0,
    openCorrections: 0,
  });
  const proposal = prizeProposalSchema.parse({
    id: randomUUID(),
    poolId: prize.id,
    competitionId: competition.id,
    revision: 1,
    preview: {
      poolId: prize.id,
      fingerprint: 'a'.repeat(64),
      revisions: [{ gameweekId: round.id, revision: finalized.revision }],
      candidates: [],
      awards: [],
      residueMinor: 0,
      unallocatedMinor: 10000,
      issues: [],
    },
    state: 'prepared',
    preparedBy: owner.accountId,
    preparedAt: new Date().toISOString(),
    reviewedBy: null,
    reviewedAt: null,
    approvedBy: null,
    approvedAt: null,
    fulfilledBy: null,
    fulfilledAt: null,
    fulfillmentReference: null,
  });
  await db
    .insertInto('prize_proposals')
    .values({
      id: proposal.id,
      pool_id: prize.id,
      competition_id: competition.id,
      revision: 1,
      data: proposal,
    })
    .execute();
  const withPending = await previewGameweekResults(db, owner, grants, round.id);
  assert.equal(withPending.prizes.pendingProposals, 1);
  await assert.rejects(
    executeResultCommand(db, owner, grants, {
      ...reopen,
      expectedFingerprint: withPrize.fingerprint,
    }),
    { code: 'preview-changed' },
  );
  await db
    .updateTable('prize_proposals')
    .set({
      revision: 2,
      data: {
        ...proposal,
        revision: 2,
        state: 'fulfilled',
        fulfilledBy: owner.accountId,
        fulfilledAt: new Date().toISOString(),
        fulfillmentReference: 'Synthetic delivery only',
      },
    })
    .where('id', '=', proposal.id)
    .execute();
  const withDelivered = await previewGameweekResults(
    db,
    owner,
    grants,
    round.id,
  );
  assert.equal(withDelivered.prizes.pendingProposals, 0);
  assert.equal(withDelivered.prizes.fulfilledProposals, 1);
  await assert.rejects(
    executeResultCommand(db, owner, grants, {
      ...reopen,
      expectedFingerprint: withPending.fingerprint,
    }),
    { code: 'preview-changed' },
  );
  const snapshot = await db
    .selectFrom('entry_snapshots')
    .select('payload')
    .where('entry_id', '=', entry.id)
    .where('gameweek_id', '=', round.id)
    .executeTakeFirstOrThrow();
  const lockedSnapshot = lockedEntrySchema.parse(snapshot.payload);
  await db
    .updateTable('entry_snapshots')
    .set({
      payload: {
        ...lockedSnapshot,
        roster: { ...lockedSnapshot.roster, starterIds: [] },
      },
    })
    .where('entry_id', '=', entry.id)
    .where('gameweek_id', '=', round.id)
    .execute();
  const blocked = await previewGameweekResults(db, owner, grants, round.id);
  assert.equal(blocked.rankings, null);
  assert.equal(blocked.changes[0]?.after, null);
  await db
    .updateTable('entry_snapshots')
    .set({ payload: snapshot.payload })
    .where('entry_id', '=', entry.id)
    .where('gameweek_id', '=', round.id)
    .execute();
  // Published score changes elsewhere also invalidate the overall ranking preview.
  await db.transaction().execute(async (tx) => {
    const revised = entryResultSchema.parse({
      ...rivalScore,
      total: firstScore.total + 6000,
    });
    await tx
      .insertInto('entry_results')
      .values({
        entry_id: rival.id,
        competition_id: competition.id,
        gameweek_id: laterRound.id,
        revision: 2,
        points: revised.total,
        payload: revised,
        published_at: new Date(),
      })
      .execute();
    await tx
      .updateTable('gameweeks')
      .set({ data: { ...laterRound, resultRevision: 2 } })
      .where('id', '=', laterRound.id)
      .execute();
  });
  await assert.rejects(
    executeResultCommand(db, owner, grants, {
      ...reopen,
      expectedFingerprint: withDelivered.fingerprint,
    }),
    { code: 'preview-changed' },
  );
  const tied = await previewGameweekResults(db, owner, grants, round.id);
  assert.ok(tied.rankings?.every((row) => row.afterRank === 1));
  const accepted = { ...reopen, expectedFingerprint: tied.fingerprint };
  const reopened = await Promise.all([
    executeResultCommand(db, owner, grants, accepted),
    executeResultCommand(db, owner, grants, accepted),
  ]);
  assert.deepEqual(reopened[0], reopened[1]);
  const audited = await db
    .selectFrom('audit_events')
    .select('payload')
    .where('scope_id', '=', round.id)
    .where('action', '=', 'results.reopened')
    .execute();
  assert.equal(audited.length, 1);
  assert.equal(
    z.object({ reviewedFingerprint: z.string() }).parse(audited[0]?.payload)
      .reviewedFingerprint,
    tied.fingerprint,
  );
  const corrected = await publishGameweekResults(db, round.id);
  assert.equal(corrected.status, 'finalized');
  const nextScore = entryResultSchema.parse(
    (
      await db
        .selectFrom('entry_results')
        .select('payload')
        .where('entry_id', '=', entry.id)
        .where('revision', '=', corrected.revision)
        .executeTakeFirstOrThrow()
    ).payload,
  );
  assert.equal(nextScore.total - firstScore.total, 6000);
  const actualRanks = await competitionStandings(db, competition);
  assert.deepEqual(
    actualRanks.map((row) => ({
      id: row.entryId,
      rank: row.rank,
      points: row.points,
    })),
    tied.rankings
      ?.map((row) => ({
        id: row.entryId,
        rank: row.afterRank,
        points: row.afterPoints,
      }))
      .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id)),
  );
  // Remove the independent projection fixtures before the existing calendar-extension rehearsal.
  await db
    .deleteFrom('prize_proposals')
    .where('id', '=', proposal.id)
    .execute();
  await db.deleteFrom('prize_pools').where('id', '=', prize.id).execute();
  await db
    .deleteFrom('entry_results')
    .where('entry_id', '=', rival.id)
    .execute();
  await db.deleteFrom('entries').where('id', '=', rival.id).execute();
  await db.deleteFrom('gameweeks').where('id', '=', laterRound.id).execute();
  // The provider still says zero assists. Its later revision cannot undo the explicit correction.
  const observation = (
    await db
      .selectFrom('fixture_observations')
      .select('payload')
      .where('fixture_id', '=', fixture.id)
      .orderBy('revision', 'desc')
      .executeTakeFirstOrThrow()
  ).payload;
  await executeMatchDataCommand(
    db,
    owner,
    grants,
    matchDataCommandSchema.parse({
      kind: 'import',
      commandId: randomUUID(),
      expectedRevision: override.revision,
      reason: 'Provider delivers an unchanged performance',
      source: 'integration-fixtures',
      observation: {
        ...observation,
        fixture: { ...observation.fixture, homeGoals: 1 },
      },
    }),
  );
  const repeat = await publishGameweekResults(db, round.id);
  assert.equal(repeat.status, 'unchanged');
  assert.equal(repeat.revision, corrected.revision);
  const activeFact = await db
    .selectFrom('fact_revisions')
    .select('revision')
    .where('fixture_id', '=', fixture.id)
    .where('footballer_id', '=', captainId)
    .orderBy('revision', 'desc')
    .executeTakeFirstOrThrow();
  await executeMatchDataCommand(
    db,
    owner,
    grants,
    matchDataCommandSchema.parse({
      kind: 'override',
      commandId: randomUUID(),
      fixtureId: fixture.id,
      footballerId: captainId,
      expectedRevision: activeFact.revision,
      reason: 'Explicitly release the temporary correction',
      change: { kind: 'release-override' },
    }),
  );
  assert.equal((await publishGameweekResults(db, round.id)).status, 'review');
  const currentCompetition = competitionSchema.parse(
    (
      await db
        .selectFrom('competitions')
        .select('data')
        .where('id', '=', competition.id)
        .executeTakeFirstOrThrow()
    ).data,
  );
  const extraRoundId = randomUUID();
  await executeSetupCommand(db, owner, grants, {
    kind: 'round',
    commandId: randomUUID(),
    competitionId: competition.id,
    expectedRevision: currentCompetition.revision,
    gameweekId: extraRoundId,
    number: 2,
    name: { ar: 'جولة إضافية', en: 'Extended calendar' },
    deadline: new Date(Date.now() + 7 * 86400_000).toISOString(),
    fixtureIds: [],
    reason: 'Extend the calendar after the original final deadline',
  });
  const extended = (
    await db
      .selectFrom('entries')
      .select('data')
      .where('id', '=', entry.id)
      .executeTakeFirstOrThrow()
  ).data;
  assert.equal(extended.editingGameweekId, extraRoundId);
  assert.equal(
    extended.state.freeTransfers,
    1,
    'Extending the calendar does not grant another transfer',
  );
});
