import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  groupCommandSchema,
  headToHeadCommandSchema,
  entryResultSchema,
  type EntryResult,
} from '@fantasy/contracts';
import { seedDemoReplay } from '../src/demo-replay.ts';
import { executeGroupCommand } from '../src/group-commands.ts';
import { executeHeadToHeadCommand } from '../src/head-to-head-commands.ts';
import { headToHeadDetails } from '../src/head-to-head-query.ts';
import { CommandRejected } from '../src/errors.ts';
import { AccessDenied } from '../src/authorization.ts';
const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use disposable integration runner');
const pool = new Pool({ connectionString, max: 5 }),
  db = createDatabase(pool);
before(async () => {
  await migrateApplication(pool);
});
after(async () => {
  await db.destroy();
});
void test('H2H freezes complete cycles, follows coherent corrected scores and persists future forfeits after rejoining', async () => {
  await seedDemoReplay(db);
  const competition = (
    await db
      .selectFrom('competitions')
      .select('data')
      .where('slug', '=', 'cairo-replay')
      .executeTakeFirstOrThrow()
  ).data;
  const entries = (
    await db
      .selectFrom('entries')
      .select('data')
      .where('competition_id', '=', competition.id)
      .orderBy('id')
      .execute()
  )
    .map((r) => r.data)
    .filter(
      (entry, index, all) =>
        all.findIndex((other) => other.accountId === entry.accountId) === index,
    );
  const [owner, second, third, fourth] = entries;
  assert.ok(owner && second && third && fourth);
  const principal = (accountId: string) => ({
    accountId,
    sessionId: 'h2h-proof',
    emailVerified: true,
    mfaVerifiedAt: null,
    authenticatedAt: new Date(),
  });
  const token = randomBytes(32).toString('hex');
  const group = await executeGroupCommand(
    db,
    principal(owner.accountId),
    groupCommandSchema.parse({
      kind: 'create',
      commandId: randomUUID(),
      competitionId: competition.id,
      name: 'H2H proof',
      description: 'Integration example',
      visibility: 'public',
      approvalRequired: false,
      entryLimit: 1,
      startGameweekId: null,
      entryId: owner.id,
      invitationToken: token,
    }),
  );
  for (const entry of [second, third, fourth])
    await executeGroupCommand(
      db,
      principal(entry.accountId),
      groupCommandSchema.parse({
        kind: 'join',
        commandId: randomUUID(),
        competitionId: competition.id,
        groupId: group.groupId,
        entryId: entry.id,
        invitationToken: null,
      }),
    );
  const rounds = await db
    .selectFrom('gameweeks')
    .selectAll()
    .where('competition_id', '=', competition.id)
    .where('number', '>=', 4)
    .orderBy('number')
    .execute();
  assert.equal(rounds.length, 3);
  const command = (input: object) =>
    headToHeadCommandSchema.parse({
      competitionId: competition.id,
      groupId: group.groupId,
      commandId: randomUUID(),
      ...input,
    });
  const act = (accountId: string, input: object) =>
    executeHeadToHeadCommand(db, principal(accountId), command(input));
  const draft = await act(owner.accountId, {
    kind: 'create',
    name: 'Three-team cycle',
    gameweekIds: rounds.map((r) => r.id),
    tieBreak: 'shared',
    tablePoints: { win: 3, draw: 1, loss: 0 },
  });
  await assert.rejects(
    headToHeadDetails(db, draft.editionId, null),
    AccessDenied,
  );
  await act(owner.accountId, {
    kind: 'open-registration',
    editionId: draft.editionId,
    expectedRevision: 1,
  });
  for (const entry of [owner, second, third])
    await act(entry.accountId, {
      kind: 'register',
      editionId: draft.editionId,
      entryId: entry.id,
    });
  let view = await headToHeadDetails(db, draft.editionId, owner.accountId);
  await assert.rejects(
    act(owner.accountId, {
      kind: 'publish',
      editionId: draft.editionId,
      expectedRevision: view.edition.revision,
      expectedRoster: [owner.id, second.id],
    }),
    (error) =>
      error instanceof CommandRejected &&
      error.code === 'edition-roster-changed',
  );
  const publish = command({
    kind: 'publish',
    editionId: draft.editionId,
    expectedRevision: view.edition.revision,
    expectedRoster: [owner.id, second.id, third.id],
  });
  const published = await executeHeadToHeadCommand(
    db,
    principal(owner.accountId),
    publish,
  );
  assert.deepEqual(
    await executeHeadToHeadCommand(db, principal(owner.accountId), publish),
    published,
  );
  view = await headToHeadDetails(db, draft.editionId, null);
  assert.equal(view.matches.length, 6);
  for (const entry of [owner, second, third])
    assert.equal(
      view.matches.filter((m) => m.homeId === entry.id && m.awayId === null)
        .length,
      1,
    );
  const frozenSchedule = JSON.stringify(view.edition.schedule);
  await assert.rejects(
    act(fourth.accountId, {
      kind: 'register',
      editionId: draft.editionId,
      entryId: fourth.id,
    }),
    (error) =>
      error instanceof CommandRejected &&
      error.code === 'edition-registration-closed',
  );
  const firstRound = rounds[0];
  assert.ok(firstRound);
  const now = new Date();
  const finalized = {
    ...firstRound.data,
    status: 'finalized' as const,
    resultRevision: 1,
    deadline: new Date(now.getTime() - 60000).toISOString(),
    finalizedAt: now.toISOString(),
  };
  await db
    .updateTable('gameweeks')
    .set({ deadline: finalized.deadline, data: finalized })
    .where('id', '=', firstRound.id)
    .execute();
  const match = view.matches.find(
    (m) => m.gameweekId === firstRound.id && m.awayId !== null,
  );
  assert.ok(match?.awayId);
  const score = (points: number): EntryResult =>
    entryResultSchema.parse({
      effectiveIds: [],
      substitutions: [],
      captainId: null,
      captainExtra: 0,
      playersTotal: points,
      transferDeduction: 0,
      total: points,
      goals: 0,
      settled: true,
      players: [],
    });
  for (const entry of [owner, second, third]) {
    const points = entry.id === match.homeId ? 5000 : 2000;
    await db
      .insertInto('entry_results')
      .values({
        entry_id: entry.id,
        competition_id: competition.id,
        gameweek_id: firstRound.id,
        revision: 1,
        points,
        payload: score(points),
        published_at: now,
      })
      .execute();
  }
  view = await headToHeadDetails(db, draft.editionId, null);
  assert.equal(
    view.matches.find(
      (m) => m.gameweekId === firstRound.id && m.awayId !== null,
    )?.outcome,
    'home',
  );
  const revisedPoints = 10000;
  await db
    .insertInto('entry_results')
    .values({
      entry_id: match.awayId,
      competition_id: competition.id,
      gameweek_id: firstRound.id,
      revision: 2,
      points: revisedPoints,
      payload: score(revisedPoints),
      published_at: now,
    })
    .execute();
  view = await headToHeadDetails(db, draft.editionId, null);
  assert.equal(
    view.matches.find(
      (m) => m.gameweekId === firstRound.id && m.awayId !== null,
    )?.outcome,
    'home',
    'unpublished correction cannot leak',
  );
  for (const entry of [owner, second, third].filter(
    (e) => e.id !== match.awayId,
  )) {
    const points = entry.id === match.homeId ? 5000 : 2000;
    await db
      .insertInto('entry_results')
      .values({
        entry_id: entry.id,
        competition_id: competition.id,
        gameweek_id: firstRound.id,
        revision: 2,
        points,
        payload: score(points),
        published_at: now,
      })
      .execute();
  }
  await db
    .updateTable('gameweeks')
    .set({ data: { ...finalized, resultRevision: 2 } })
    .where('id', '=', firstRound.id)
    .execute();
  view = await headToHeadDetails(db, draft.editionId, null);
  assert.equal(
    view.matches.find(
      (m) => m.gameweekId === firstRound.id && m.awayId !== null,
    )?.outcome,
    'away',
  );
  await executeGroupCommand(
    db,
    principal(second.accountId),
    groupCommandSchema.parse({
      kind: 'leave',
      commandId: randomUUID(),
      competitionId: competition.id,
      groupId: group.groupId,
      entryId: second.id,
    }),
  );
  const forfeits = await db
    .selectFrom('h2h_forfeits')
    .selectAll()
    .where('edition_id', '=', draft.editionId)
    .where('entry_id', '=', second.id)
    .execute();
  assert.equal(forfeits.length, 2);
  assert.ok(
    forfeits.every((f) => f.gameweek_id !== firstRound.id),
    'locked contest survives withdrawal',
  );
  await executeGroupCommand(
    db,
    principal(second.accountId),
    groupCommandSchema.parse({
      kind: 'join',
      commandId: randomUUID(),
      competitionId: competition.id,
      groupId: group.groupId,
      entryId: second.id,
      invitationToken: null,
    }),
  );
  view = await headToHeadDetails(db, draft.editionId, null);
  assert.equal(view.roster.find((r) => r.id === second.id)?.withdrawn, true);
  assert.equal(JSON.stringify(view.edition.schedule), frozenSchedule);
  // Restore only this test's deliberate gameweek fixture changes for other isolated scenarios.
  await db
    .deleteFrom('entry_results')
    .where('gameweek_id', '=', firstRound.id)
    .execute();
  await db
    .updateTable('gameweeks')
    .set({ deadline: firstRound.deadline, data: firstRound.data })
    .where('id', '=', firstRound.id)
    .execute();
});
