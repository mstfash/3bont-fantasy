import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, after, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  competitionSchema,
  entrySchema,
  gameweekSchema,
  lockedEntrySchema,
  prizePoolSchema,
  headToHeadCommandSchema,
  type Gameweek,
} from '@fantasy/contracts';
import { createIdentity, migrateIdentity } from '../src/identity.ts';
import { seedDemoReplay } from '../src/demo-replay.ts';
import { executeEntryLifecycle } from '../src/entry-lifecycle.ts';
import { executeEntryCommand } from '../src/entry-commands.ts';
import { executeGroupCommand } from '../src/group-commands.ts';
import { executeHeadToHeadCommand } from '../src/head-to-head-commands.ts';
import { advanceDueGameweeks } from '../src/deadlines.ts';
import { publishGameweekResults } from '../src/results.ts';
import { calculatePrizePreview } from '../src/prize-preview.ts';
import { competitionStandings } from '../src/leaderboard.ts';
import { CommandRejected } from '../src/errors.ts';
import { AccessDenied } from '../src/authorization.ts';
const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use disposable integration runner');
const pool = new Pool({ connectionString, max: 6 }),
  db = createDatabase(pool);
before(async () => {
  await migrateApplication(pool);
  await migrateIdentity(
    createIdentity(pool, {
      baseURL: 'http://127.0.0.1:3100',
      secret: randomUUID() + randomUUID(),
      secureCookies: false,
      sendMail: async () => {},
    }),
  );
});
after(async () => {
  await db.destroy();
});
void test('retirement preserves elapsed-deadline snapshots, forfeits only future H2H rounds and cannot reset entry allowance', async () => {
  await seedDemoReplay(db);
  const source = (
    await db
      .selectFrom('competitions')
      .select('data')
      .where('slug', '=', 'cairo-replay')
      .executeTakeFirstOrThrow()
  ).data;
  const competition = competitionSchema.parse({
    ...source,
    id: randomUUID(),
    slug: `retirement-${randomUUID()}`,
    status: 'published',
    entryLimit: 1,
    firstLockedAt: null,
  });
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
  const players = await db
    .selectFrom('competition_players')
    .selectAll()
    .where('competition_id', '=', source.id)
    .execute();
  await db
    .insertInto('competition_players')
    .values(
      players.map((p) => ({
        ...p,
        competition_id: competition.id,
        data: { ...p.data, competitionId: competition.id },
      })),
    )
    .execute();
  const first = gameweekSchema.parse({
      id: randomUUID(),
      competitionId: competition.id,
      number: 1,
      name: { ar: 'جولة أولى', en: 'Round one' },
      deadline: new Date(Date.now() + 3600_000).toISOString(),
      status: 'upcoming',
      rules: competition.rules,
      resultRevision: 0,
      lastMaterialChangeAt: null,
      finalizedAt: null,
      issues: [],
    }),
    second = gameweekSchema.parse({
      ...first,
      id: randomUUID(),
      number: 2,
      name: { ar: 'جولة ثانية', en: 'Round two' },
      deadline: new Date(Date.now() + 7200_000).toISOString(),
    });
  for (const r of [first, second])
    await db
      .insertInto('gameweeks')
      .values({
        id: r.id,
        competition_id: competition.id,
        number: r.number,
        deadline: r.deadline,
        data: r,
      })
      .execute();
  const originals = await db
    .selectFrom('entries')
    .select('data')
    .where('competition_id', '=', source.id)
    .orderBy('id')
    .limit(2)
    .execute();
  const entries = originals.map((r, i) =>
    entrySchema.parse({
      ...r.data,
      id: randomUUID(),
      competitionId: competition.id,
      revision: 1,
      activatedAt: new Date(Date.now() - 7200_000).toISOString(),
      firstGameweekId: first.id,
      editingGameweekId: first.id,
      state: {
        ...r.data.state,
        chip: null,
        freeTransfers: 1,
        transfersThisRound: i === 0 ? 2 : 0,
      },
    }),
  );
  const [a, b] = entries;
  assert.ok(a && b && a.accountId !== b.accountId);
  for (const e of entries) {
    await db
      .insertInto('entries')
      .values({
        id: e.id,
        competition_id: e.competitionId,
        account_id: e.accountId,
        revision: e.revision,
        data: e,
      })
      .execute();
    await pool.query(
      'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now()) ON CONFLICT(id) DO UPDATE SET "emailVerified"=true',
      [e.accountId, e.name, `${e.accountId}@retirement-proof.test`],
    );
  }
  const principal = (accountId: string) => ({
    accountId,
    sessionId: 'retirement-proof',
    emailVerified: true,
    mfaVerifiedAt: null,
    authenticatedAt: new Date(),
  });
  const group = await executeGroupCommand(db, principal(a.accountId), {
    kind: 'create',
    commandId: randomUUID(),
    competitionId: competition.id,
    entryId: a.id,
    name: 'Retirement group',
    description: 'Isolated lifecycle proof',
    visibility: 'public',
    approvalRequired: false,
    entryLimit: 1,
    startGameweekId: null,
    invitationToken: 'c'.repeat(64),
  });
  await executeGroupCommand(db, principal(b.accountId), {
    kind: 'join',
    commandId: randomUUID(),
    competitionId: competition.id,
    groupId: group.groupId,
    entryId: b.id,
    invitationToken: null,
  });
  const act = (actor: string, input: object) =>
    executeHeadToHeadCommand(
      db,
      principal(actor),
      headToHeadCommandSchema.parse({
        commandId: randomUUID(),
        competitionId: competition.id,
        groupId: group.groupId,
        ...input,
      }),
    );
  const edition = await act(a.accountId, {
    kind: 'create',
    name: 'Retirement cup',
    gameweekIds: [first.id, second.id],
    tieBreak: 'shared',
    tablePoints: { win: 3, draw: 1, loss: 0 },
  });
  await act(a.accountId, {
    kind: 'open-registration',
    editionId: edition.editionId,
    expectedRevision: 1,
  });
  for (const e of entries)
    await act(e.accountId, {
      kind: 'register',
      editionId: edition.editionId,
      entryId: e.id,
    });
  const ready = (
    await db
      .selectFrom('h2h_editions')
      .select('revision')
      .where('id', '=', edition.editionId)
      .executeTakeFirstOrThrow()
  ).revision;
  await act(a.accountId, {
    kind: 'publish',
    editionId: edition.editionId,
    expectedRevision: ready,
    expectedRoster: entries.map((e) => e.id),
  });
  async function moveDeadline(round: Gameweek, deadline: string) {
    await db
      .updateTable('gameweeks')
      .set({ deadline, data: { ...round, deadline } })
      .where('id', '=', round.id)
      .execute();
  }
  await moveDeadline(first, new Date(Date.now() - 1000).toISOString());
  const retirement = {
    kind: 'retire' as const,
    commandId: randomUUID(),
    competitionId: competition.id,
    entryId: a.id,
    expectedRevision: 1,
  };
  await assert.rejects(
    executeEntryLifecycle(db, principal(b.accountId), retirement),
    AccessDenied,
  );
  const [retired, retry] = await Promise.all([
    executeEntryLifecycle(db, principal(a.accountId), retirement),
    executeEntryLifecycle(db, principal(a.accountId), retirement),
  ]);
  assert.deepEqual(retired, retry);
  assert.ok(retired.retiredAt);
  const forfeits = await db
    .selectFrom('h2h_forfeits')
    .select('gameweek_id')
    .where('entry_id', '=', a.id)
    .execute();
  assert.deepEqual(
    forfeits.map((f) => f.gameweek_id),
    [second.id],
  );
  assert.equal((await advanceDueGameweeks(db, competition.id)).entries, 2);
  const snapshot = await db
    .selectFrom('entry_snapshots')
    .select('payload')
    .where('entry_id', '=', a.id)
    .where('gameweek_id', '=', first.id)
    .executeTakeFirstOrThrow();
  assert.equal(
    lockedEntrySchema.parse(snapshot.payload).transferDeduction,
    4000,
  );
  await publishGameweekResults(db, first.id);
  const create = {
    kind: 'create' as const,
    commandId: randomUUID(),
    competitionId: competition.id,
    gameweekId: second.id,
    name: 'Replacement XI',
    lineup: {
      starterIds: a.state.roster.starterIds,
      reserveIds: a.state.roster.reserveIds,
      captaincy: a.state.roster.captaincy,
    },
    players: a.state.roster.holdings.map((h) => ({
      footballerId: h.footballerId,
      priceRevision:
        players.find((p) => p.footballer_id === h.footballerId)?.data
          .priceRevision ?? 0,
    })),
  };
  await assert.rejects(
    executeEntryCommand(db, principal(a.accountId), create),
    (e: unknown) => e instanceof CommandRejected && e.code === 'entry-limit',
  );
  const draftAccount = randomUUID();
  await db
    .insertInto('accounts')
    .values({
      id: draftAccount,
      display_name: 'Draft retention proof',
      suspended_until: null,
    })
    .execute();
  const draft = entrySchema.parse({
    ...b,
    id: randomUUID(),
    accountId: draftAccount,
    status: 'draft',
    activatedAt: null,
    firstGameweekId: second.id,
    editingGameweekId: second.id,
  });
  await db
    .insertInto('entries')
    .values({
      id: draft.id,
      competition_id: competition.id,
      account_id: draftAccount,
      revision: 1,
      data: draft,
    })
    .execute();
  await assert.rejects(
    executeEntryCommand(db, principal(draftAccount), {
      ...create,
      commandId: randomUUID(),
    }),
    (e: unknown) => e instanceof CommandRejected && e.code === 'entry-limit',
  );
  await executeEntryLifecycle(db, principal(draftAccount), {
    kind: 'discard-draft',
    commandId: randomUUID(),
    competitionId: competition.id,
    entryId: draft.id,
    expectedRevision: 1,
  });
  assert.equal(
    await db
      .selectFrom('entries')
      .select('id')
      .where('id', '=', draft.id)
      .executeTakeFirst(),
    undefined,
  );
  await moveDeadline(
    second,
    new Date(Date.parse(retired.retiredAt) + 1).toISOString(),
  );
  assert.equal((await advanceDueGameweeks(db, competition.id)).entries, 1);
  await publishGameweekResults(db, second.id);
  assert.equal(
    (
      await db
        .selectFrom('entry_snapshots')
        .select('entry_id')
        .where('entry_id', '=', a.id)
        .execute()
    ).length,
    1,
  );
  assert.equal(
    (await competitionStandings(db, competition)).find(
      (e) => e.entryId === a.id,
    )?.retired,
    true,
  );
  const terms = prizePoolSchema.parse({
    id: randomUUID(),
    competitionId: competition.id,
    revision: 1,
    name: { ar: 'جائزة اختبار', en: 'Test award' },
    description: { ar: 'جائزة مصطنعة', en: 'Synthetic terms' },
    firstGameweekId: first.id,
    lastGameweekId: second.id,
    groupId: null,
    eligibilityCutoff: new Date(Date.now() - 3600_000).toISOString(),
    currency: 'EGP',
    places: [{ kind: 'cash', amountMinor: 100 }],
    oneAwardPerAccount: true,
    state: 'published',
    synthetic: true,
    gameweekIds: [first.id, second.id],
    publishedAt: new Date(Date.now() - 7200_000).toISOString(),
    evidenceReference: 'Synthetic controlled deadline fixture',
    ranking: 'shared',
  });
  const preview = await db
    .transaction()
    .execute((tx) => calculatePrizePreview(tx, terms));
  assert.equal(preview.issues.includes('incomplete-entry-results'), false);
  assert.ok(
    preview.candidates
      .find((c) => c.entryId === a.id)
      ?.reasons.includes('entry-retired-during-window'),
  );
  assert.equal(
    preview.candidates.find((c) => c.entryId === b.id)?.eligible,
    true,
  );
  const historical = await db.transaction().execute((tx) =>
    calculatePrizePreview(tx, {
      ...terms,
      lastGameweekId: first.id,
      gameweekIds: [first.id],
    }),
  );
  assert.equal(
    historical.candidates.find((c) => c.entryId === a.id)?.eligible,
    true,
  );
});
