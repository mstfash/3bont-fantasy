import { grantProofStaff, clearProofStaff } from './proof-staff.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  competitionCommandSchema,
  competitionSchema,
  setupCommandSchema,
  gameweekSchema,
  fixtureSchema,
} from '@fantasy/contracts';
import { seedDemo } from '../src/demo.ts';
import { executeCompetitionCommand } from '../src/competition-commands.ts';
import { executeSetupCommand } from '../src/competition-setup.ts';
import { CommandRejected } from '../src/errors.ts';

const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use the disposable integration runner');
const pool = new Pool({ connectionString, max: 4 });
const db = createDatabase(pool);
before(async () => {
  await migrateApplication(pool);
  await grantProofStaff(db, owner.accountId, grants);
});
after(async () => {
  await clearProofStaff(db);
  await db.destroy();
});
const owner = {
  accountId: 'setup-owner',
  sessionId: 'setup-session',
  emailVerified: true,
  mfaVerifiedAt: new Date(),
  authenticatedAt: new Date(),
};
const grants = [{ role: 'owner' as const, competitionId: null }];
const rejected = (code: string) => (e: unknown) =>
  e instanceof CommandRejected && e.code === code;

void test('a draft needs an affordable selectable pool before publication; setup retries are idempotent', async () => {
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
  let draft = await executeCompetitionCommand(
    db,
    owner,
    grants,
    competitionCommandSchema.parse({
      kind: 'create',
      commandId: randomUUID(),
      seasonId: template.seasonId,
      slug: `setup-${randomUUID()}`,
      name: template.name,
      description: template.description,
      rules: template.rules,
      entryLimit: template.entryLimit,
      registrationOpens: template.registrationOpens,
      registrationCloses: template.registrationCloses,
      reason: 'Create integration draft',
    }),
  );
  const setup = (input: object) =>
    setupCommandSchema.parse({
      commandId: randomUUID(),
      competitionId: draft.id,
      expectedRevision: draft.revision,
      reason: 'Reviewed integration setup',
      ...input,
    });
  const publish = () =>
    executeCompetitionCommand(
      db,
      owner,
      grants,
      competitionCommandSchema.parse({
        kind: 'publish',
        commandId: randomUUID(),
        competitionId: draft.id,
        expectedRevision: draft.revision,
        reason: 'Reviewed publication readiness',
      }),
    );
  await assert.rejects(
    publish(),
    rejected('publication-needs-rounds-and-player-pool'),
  );
  const fixture = fixtureSchema.parse(
    (
      await db
        .selectFrom('fixtures')
        .select('data')
        .where('season_id', '=', draft.seasonId)
        .where('kickoff', '>', new Date(Date.now() + 2 * 3600000))
        .orderBy('kickoff')
        .executeTakeFirstOrThrow()
    ).data,
  );
  const roundId = randomUUID();
  const roundCommand = setup({
    kind: 'round',
    gameweekId: roundId,
    number: 1,
    name: { en: 'Opening round', ar: 'الجولة الأولى' },
    deadline: new Date(Date.parse(fixture.kickoff) - 90 * 60_000).toISOString(),
    fixtureIds: [fixture.id],
  });
  draft = await executeSetupCommand(db, owner, grants, roundCommand);
  assert.equal(
    (await executeSetupCommand(db, owner, grants, roundCommand)).revision,
    draft.revision,
  );
  const market = await db
    .selectFrom('competition_players')
    .select('data')
    .where('competition_id', '=', template.id)
    .execute();
  const players = market.map(({ data: p }) => ({
    footballerId: p.footballerId,
    position: p.position,
    price: 50,
    selectable: false,
    manuallyPinned: false,
  }));
  draft = await executeSetupCommand(
    db,
    owner,
    grants,
    setup({ kind: 'pool', players }),
  );
  await assert.rejects(publish(), rejected('player-pool-position-or-club-cap'));
  draft = await executeSetupCommand(
    db,
    owner,
    grants,
    setup({
      kind: 'pool',
      players: players.map((p) => ({ ...p, selectable: true, price: 150 })),
    }),
  );
  await assert.rejects(publish(), rejected('player-pool-over-budget'));
  draft = await executeSetupCommand(
    db,
    owner,
    grants,
    setup({
      kind: 'pool',
      players: players.map((p) => ({ ...p, selectable: true })),
    }),
  );
  draft = await publish();
  assert.equal(draft.status, 'published');
  const firstPlayer = players[0];
  assert.ok(firstPlayer);
  // A worker delay cannot make a past deadline editable.
  const round = gameweekSchema.parse(
    (
      await db
        .selectFrom('gameweeks')
        .select('data')
        .where('id', '=', roundId)
        .executeTakeFirstOrThrow()
    ).data,
  );
  const elapsed = new Date(Date.now() - 1000).toISOString();
  await db
    .updateTable('gameweeks')
    .set({ deadline: elapsed, data: { ...round, deadline: elapsed } })
    .where('id', '=', roundId)
    .execute();
  await assert.rejects(
    executeSetupCommand(
      db,
      owner,
      grants,
      setup({
        kind: 'pool',
        players: [
          {
            ...firstPlayer,
            position: firstPlayer.position === 'GK' ? 'DEF' : 'GK',
          },
        ],
      }),
    ),
    rejected('fantasy-position-frozen'),
  );
  await assert.rejects(
    executeSetupCommand(
      db,
      owner,
      grants,
      setup({
        kind: 'round',
        gameweekId: roundId,
        number: 1,
        name: round.name,
        deadline: round.deadline,
        fixtureIds: [],
      }),
    ),
    rejected('gameweek-locked'),
  );
  // Unplayed postponements can move to a future gameweek; normal fixtures cannot.
  const laterId = randomUUID();
  const later = {
    kind: 'round',
    gameweekId: laterId,
    number: 2,
    name: { en: 'Later round', ar: 'جولة لاحقة' },
    deadline: new Date(Date.now() + 86400_000 * 20).toISOString(),
    fixtureIds: [fixture.id],
  };
  await assert.rejects(
    executeSetupCommand(db, owner, grants, setup(later)),
    rejected('only-unplayed-postponements-can-move'),
  );
  await db
    .updateTable('fixtures')
    .set({ data: { ...fixture, status: 'postponed' } })
    .where('id', '=', fixture.id)
    .execute();
  draft = await executeSetupCommand(db, owner, grants, setup(later));
  assert.equal(
    (
      await db
        .selectFrom('fixture_assignments')
        .select('gameweek_id')
        .where('competition_id', '=', draft.id)
        .where('fixture_id', '=', fixture.id)
        .executeTakeFirstOrThrow()
    ).gameweek_id,
    laterId,
  );
  await db
    .updateTable('fixtures')
    .set({ data: fixture })
    .where('id', '=', fixture.id)
    .execute();
  await db
    .updateTable('gameweeks')
    .set({ data: { ...round, deadline: elapsed, status: 'locked' } })
    .where('id', '=', roundId)
    .execute();
});
