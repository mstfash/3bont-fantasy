import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { after, test } from 'node:test';
import { Pool } from 'pg';
import {
  createDatabase,
  createManagedPool,
  migrateApplication,
} from '@fantasy/persistence';
import {
  competitionSchema,
  entryCommandSchema,
  entrySchema,
  footballerSchema,
  gameweekSchema,
  poolPlayerSchema,
  type Entry,
  type EntryCommand,
} from '@fantasy/contracts';
import { assessPlayerPool, lockAndAdvance, POSITIONS } from '@fantasy/domain';
import type { Principal } from '../src/authorization.ts';
import { seedDemo } from '../src/demo.ts';
import { CommandRejected, executeEntryCommand } from '../src/entry-commands.ts';
import { advanceDueGameweeks } from '../src/deadlines.ts';

const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use the disposable integration runner');
const label = `deadline-contention-${randomUUID()}`;
const pool = new Pool({ connectionString, max: 8, application_name: label });
const db = createDatabase(pool);
const control = new Pool({ connectionString, max: 2 });
const workerPool = createManagedPool({
  connectionString,
  max: 1,
  application_name: `${label}-worker`,
});
const workerDb = createDatabase(workerPool);
const workerConnectionErrors: Error[] = [];
workerPool.on('error', (error: Error) => workerConnectionErrors.push(error));
const fixtureGames: string[] = [],
  fixtureRounds: string[] = [],
  fixtureAccounts: string[] = [];
after(async () => {
  try {
    await control.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name=$1',
      [`${label}-worker`],
    );
    await control.query(
      'DROP TRIGGER IF EXISTS contention_pause ON fantasy.entry_snapshots; DROP FUNCTION IF EXISTS fantasy.contention_pause()',
    );
    await db.transaction().execute(async (tx) => {
      if (fixtureGames.length) {
        for (const table of [
          'entry_results',
          'entry_snapshots',
          'entries',
          'competition_players',
        ] as const)
          await tx
            .deleteFrom(table)
            .where('competition_id', 'in', fixtureGames)
            .execute();
        await tx
          .deleteFrom('gameweek_player_pools')
          .where('gameweek_id', 'in', fixtureRounds)
          .execute();
        await tx
          .deleteFrom('gameweeks')
          .where('competition_id', 'in', fixtureGames)
          .execute();
        await tx
          .deleteFrom('competitions')
          .where('id', 'in', fixtureGames)
          .execute();
      }
      if (fixtureAccounts.length) {
        await tx
          .deleteFrom('commands')
          .where('actor_id', 'in', fixtureAccounts)
          .execute();
        await tx
          .deleteFrom('audit_events')
          .where('actor_id', 'in', fixtureAccounts)
          .execute();
        await tx
          .deleteFrom('accounts')
          .where('id', 'in', fixtureAccounts)
          .execute();
      }
    });
  } finally {
    await Promise.all([db.destroy(), workerDb.destroy(), control.end()]);
  }
});

async function eventually(check: () => Promise<boolean>, description: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await check()) return;
    await setTimeout(25);
  }
  throw new Error(`Not observed: ${description}`);
}

interface ParticipantFixture {
  readonly principal: Principal;
  readonly creation: EntryCommand;
  readonly entry: Entry;
}

async function prepareFixture() {
  await migrateApplication(pool);
  await seedDemo(db);
  const source = competitionSchema.parse(
    (
      await db
        .selectFrom('competitions')
        .select('data')
        .where('slug', '=', 'cairo-demo')
        .executeTakeFirstOrThrow()
    ).data,
  );
  const rounds = (
    await db
      .selectFrom('gameweeks')
      .select('data')
      .where('competition_id', '=', source.id)
      .orderBy('number')
      .limit(2)
      .execute()
  ).map((row) => gameweekSchema.parse(row.data));
  const first = rounds[0],
    next = rounds[1];
  assert.ok(first && next);
  const catalogue = (
    await db
      .selectFrom('competition_players')
      .innerJoin(
        'footballers',
        'footballers.id',
        'competition_players.footballer_id',
      )
      .select([
        'competition_players.data as pool',
        'footballers.data as footballer',
      ])
      .where('competition_players.competition_id', '=', source.id)
      .execute()
  ).map((row) => ({
    pool: poolPlayerSchema.parse(row.pool),
    player: footballerSchema.parse(row.footballer),
  }));
  const market = catalogue.map(({ pool, player }) => ({
    footballerId: player.id,
    clubId: player.clubId,
    position: pool.position,
    price: pool.price,
  }));
  const selection = assessPlayerPool(market, source.rules.squad);
  assert.ok(selection.ready);
  const selected = market.filter((player) =>
    selection.footballerIds.includes(player.footballerId),
  );
  const formation = source.rules.squad.formations[0];
  assert.ok(formation);
  const starters = POSITIONS.flatMap((position) =>
    selected
      .filter((p) => p.position === position)
      .slice(0, formation[position])
      .map((p) => p.footballerId),
  );
  const captainId = starters[0],
    viceCaptainId = starters[1];
  assert.ok(captainId && viceCaptainId);
  const lineup = {
    starterIds: starters,
    reserveIds: selected
      .filter((p) => !starters.includes(p.footballerId))
      .map((p) => p.footballerId),
    captaincy: { captainId, viceCaptainId },
  };
  const players = catalogue
    .filter(({ player }) => selection.footballerIds.includes(player.id))
    .map(({ pool, player }) => ({
      footballerId: player.id,
      priceRevision: pool.priceRevision,
    }));
  const principals: Principal[] = Array.from({ length: 100 }, () => ({
    accountId: `proof:${randomUUID()}`,
    sessionId: `proof:${randomUUID()}`,
    emailVerified: true,
    authenticatedAt: new Date(),
    mfaVerifiedAt: null,
  }));
  await db
    .insertInto('accounts')
    .values(
      principals.map((principal, index) => ({
        id: principal.accountId,
        display_name: `Contention fixture ${String(index)}`,
        suspended_until: null,
      })),
    )
    .execute();
  fixtureAccounts.push(...principals.map((principal) => principal.accountId));
  const games = [];
  for (let number = 0; number < 2; number++) {
    const competition = competitionSchema.parse({
      ...source,
      id: randomUUID(),
      slug: `contention-${randomUUID()}`,
    });
    const gameweek = gameweekSchema.parse({
      ...first,
      id: randomUUID(),
      competitionId: competition.id,
    });
    const following = gameweekSchema.parse({
      ...next,
      id: randomUUID(),
      competitionId: competition.id,
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
    fixtureGames.push(competition.id);
    await db
      .insertInto('gameweeks')
      .values(
        [gameweek, following].map((round) => ({
          id: round.id,
          competition_id: competition.id,
          number: round.number,
          deadline: round.deadline,
          data: round,
        })),
      )
      .execute();
    fixtureRounds.push(gameweek.id, following.id);
    await db
      .insertInto('competition_players')
      .values(
        catalogue.map(({ pool }) => ({
          competition_id: competition.id,
          footballer_id: pool.footballerId,
          data: { ...pool, competitionId: competition.id },
        })),
      )
      .execute();
    const participants: ParticipantFixture[] = await Promise.all(
      principals.map(async (principal, index) => {
        const creation = entryCommandSchema.parse({
          kind: 'create',
          commandId: randomUUID(),
          competitionId: competition.id,
          gameweekId: gameweek.id,
          name: `Contended squad ${String(index)}`,
          lineup,
          players,
        });
        let entry = await executeEntryCommand(db, principal, creation);
        if (index % 2 === 0)
          entry = await executeEntryCommand(db, principal, {
            kind: 'chip',
            commandId: randomUUID(),
            competitionId: competition.id,
            gameweekId: gameweek.id,
            entryId: entry.id,
            expectedRevision: entry.revision,
            chip: 'bench-boost',
          });
        return { principal, creation, entry };
      }),
    );
    games.push({ competition, gameweek, following, participants });
  }
  return games;
}

void test('200 squads across shared-season games reject queued late changes and recover an interrupted lock exactly once', async () => {
  const games = await prepareFixture();
  const gameIds = games.map((game) => game.competition.id);
  const roundIds = games.map((game) => game.gameweek.id);
  const entries = games.flatMap((game) => game.participants);
  assert.equal(entries.length, 200);
  const receiptCount = await db
    .selectFrom('commands')
    .select('command_id')
    .where(
      'actor_id',
      'in',
      entries.map((p) => p.principal.accountId),
    )
    .execute();
  assert.equal(receiptCount.length, 300);

  // The connection holds the same parent locks as a competing rule/deadline
  // operation. Every request starts before release, but acceptance is later.
  const blocker = await control.connect();
  let pending: Promise<PromiseSettledResult<Entry>[]> | undefined;
  try {
    await blocker.query('BEGIN');
    await blocker.query(
      'SELECT id FROM fantasy.competitions WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
      [gameIds],
    );
    await blocker.query(
      `WITH cutoff AS MATERIALIZED (SELECT clock_timestamp()+interval '5 seconds' AS deadline)
       UPDATE fantasy.gameweeks SET deadline=cutoff.deadline,
       data=jsonb_set(data,'{deadline}',to_jsonb(cutoff.deadline)) FROM cutoff WHERE id=ANY($1::uuid[])`,
      [roundIds],
    );
    pending = Promise.allSettled(
      games.flatMap((game) =>
        game.participants.map(({ principal, entry }) =>
          executeEntryCommand(db, principal, {
            kind: 'lineup',
            commandId: randomUUID(),
            competitionId: game.competition.id,
            gameweekId: game.gameweek.id,
            entryId: entry.id,
            expectedRevision: entry.revision,
            lineup: {
              starterIds: [...entry.state.roster.starterIds].reverse(),
              reserveIds: entry.state.roster.reserveIds,
              captaincy: entry.state.roster.captaincy,
            },
          }),
        ),
      ),
    );
    await eventually(
      async () =>
        Number(
          (
            await control.query<{ count: string }>(
              "SELECT count(*) FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",
              [label],
            )
          ).rows[0]?.count,
        ) >= 2,
      'requests waiting behind the competition locks',
    );
    assert.equal(
      (
        await blocker.query<{ before: boolean }>(
          'SELECT clock_timestamp()<min(deadline) AS before FROM fantasy.gameweeks WHERE id=ANY($1::uuid[])',
          [roundIds],
        )
      ).rows[0]?.before,
      true,
      'Requests reached the database before the deadline',
    );
    await blocker.query(
      `SELECT pg_sleep(GREATEST(0,EXTRACT(EPOCH FROM (max(deadline)-clock_timestamp())))+0.05)
      FROM fantasy.gameweeks WHERE id=ANY($1::uuid[])`,
      [roundIds],
    );
    await blocker.query('COMMIT');
    const results = await pending;
    assert.equal(results.length, 200);
    for (const result of results) {
      assert.equal(result.status, 'rejected');
      assert.ok(result.reason instanceof CommandRejected);
      assert.equal(result.reason.code, 'deadline-passed');
    }
  } finally {
    await blocker.query('ROLLBACK').catch(() => {});
    blocker.release();
    await pending;
  }
  assert.equal(
    (
      await db
        .selectFrom('commands')
        .select('command_id')
        .where(
          'actor_id',
          'in',
          entries.map((p) => p.principal.accountId),
        )
        .execute()
    ).length,
    300,
  );

  const first = games[0];
  assert.ok(first);
  // Interrupt after several inserts inside the actual worker transaction.
  // Terminate only this test's named backend; never a shared/live worker.
  await control.query(`CREATE FUNCTION fantasy.contention_pause() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.competition_id='${first.competition.id}'::uuid AND
        (SELECT count(*) FROM fantasy.entry_snapshots WHERE gameweek_id=NEW.gameweek_id)>=25 THEN
        PERFORM pg_sleep(30);
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER contention_pause BEFORE INSERT ON fantasy.entry_snapshots
      FOR EACH ROW EXECUTE FUNCTION fantasy.contention_pause()`);
  const interrupted = advanceDueGameweeks(workerDb, first.competition.id).then(
    () => ({ interrupted: false as const }),
    (error: unknown) => ({ interrupted: true as const, error }),
  );
  try {
    await eventually(
      async () =>
        Number(
          (
            await control.query<{ count: string }>(
              "SELECT count(*) FROM pg_stat_activity WHERE application_name=$1 AND wait_event='PgSleep'",
              [`${label}-worker`],
            )
          ).rows[0]?.count,
        ) === 1,
      'worker paused after partial snapshot insertion',
    );
    const terminated = await control.query<{ terminated: boolean }>(
      "SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity WHERE application_name=$1 AND wait_event='PgSleep'",
      [`${label}-worker`],
    );
    assert.equal(terminated.rows.length, 1);
    assert.equal(terminated.rows[0]?.terminated, true);
    const outcome = await interrupted;
    assert.ok(outcome.interrupted && outcome.error instanceof Error);
    assert.match(
      outcome.error.message,
      /terminating connection|Connection terminated/iu,
    );
    for (const error of workerConnectionErrors)
      assert.match(
        error.message,
        /terminating connection|Connection terminated/iu,
      );
  } finally {
    await control.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name=$1',
      [`${label}-worker`],
    );
    await interrupted;
    await control.query(
      'DROP TRIGGER contention_pause ON fantasy.entry_snapshots; DROP FUNCTION fantasy.contention_pause()',
    );
  }
  assert.equal(
    (
      await db
        .selectFrom('entry_snapshots')
        .selectAll()
        .where('gameweek_id', '=', first.gameweek.id)
        .execute()
    ).length,
    0,
  );
  assert.equal(
    (
      await db
        .selectFrom('gameweek_player_pools')
        .selectAll()
        .where('gameweek_id', '=', first.gameweek.id)
        .execute()
    ).length,
    0,
  );
  assert.equal(
    gameweekSchema.parse(
      (
        await db
          .selectFrom('gameweeks')
          .select('data')
          .where('id', '=', first.gameweek.id)
          .executeTakeFirstOrThrow()
      ).data,
    ).status,
    'upcoming',
  );

  const recovered = await Promise.all(
    games.flatMap((game) =>
      Array.from({ length: 3 }, () =>
        advanceDueGameweeks(db, game.competition.id),
      ),
    ),
  );
  assert.equal(
    recovered.reduce((count, run) => count + run.locked, 0),
    2,
  );
  assert.equal(
    recovered.reduce((count, run) => count + run.entries, 0),
    200,
  );
  for (const game of games) {
    const snapshots = await db
      .selectFrom('entry_snapshots')
      .selectAll()
      .where('gameweek_id', '=', game.gameweek.id)
      .execute();
    assert.equal(snapshots.length, 100);
    assert.equal(
      (
        await db
          .selectFrom('gameweek_player_pools')
          .selectAll()
          .where('gameweek_id', '=', game.gameweek.id)
          .execute()
      ).length,
      1,
    );
    const saved = new Map(
      (
        await db
          .selectFrom('entries')
          .select('data')
          .where('competition_id', '=', game.competition.id)
          .execute()
      ).map((row) => {
        const entry = entrySchema.parse(row.data);
        return [entry.id, entry];
      }),
    );
    for (const participant of game.participants) {
      const expected = lockAndAdvance(
        participant.entry.state,
        game.gameweek.rules.transfer,
        game.following.rules.transfer,
      );
      assert.deepEqual(
        snapshots.find((s) => s.entry_id === participant.entry.id)?.payload,
        expected.locked,
      );
      const current = saved.get(participant.entry.id);
      assert.ok(current);
      assert.equal(current.revision, participant.entry.revision + 1);
      assert.equal(current.editingGameweekId, game.following.id);
      assert.deepEqual(current.state, expected.editing);
      assert.equal(
        (
          await executeEntryCommand(
            db,
            participant.principal,
            participant.creation,
          )
        ).revision,
        1,
        'Retrying an accepted creation after cutoff returns its original receipt',
      );
    }
    assert.equal(
      (await advanceDueGameweeks(db, game.competition.id)).locked,
      0,
    );
  }
  assert.equal(
    (
      await db
        .selectFrom('commands')
        .select('command_id')
        .where(
          'actor_id',
          'in',
          entries.map((p) => p.principal.accountId),
        )
        .execute()
    ).length,
    300,
  );
  const root = new URL('../../../', import.meta.url);
  const sources = await Promise.all(
    [
      'packages/application/tests/postgres-deadline-contention.test.ts',
      'packages/application/src/deadlines.ts',
      'packages/application/src/entry-commands.ts',
      'packages/persistence/src/pool.ts',
    ].map(async (path) => ({
      path,
      sha256: createHash('sha256')
        .update(await readFile(new URL(path, root)))
        .digest('hex'),
    })),
  );
  await mkdir(new URL('artifacts/verification/', root), { recursive: true });
  await writeFile(
    new URL('artifacts/verification/deadline-contention-proof.json', root),
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        status: 'passed',
        accounts: 100,
        competitionsSharingSeason: 2,
        entries: 200,
        initialAcceptedCommands: 300,
        queuedLateRequestsRejected: 200,
        snapshotsRolledBackBeforeRecovery: 25,
        snapshotsAfterRecovery: 200,
        competingRecoveryRuns: 6,
        originalReceiptsPreserved: true,
        exactInventoryAndBalancePreserved: true,
        sources,
        boundary:
          'Disposable PostgreSQL correctness rehearsal with direct application commands. Not the full HTTP/browser workload, production-sized history, a throughput benchmark or named-host capacity evidence.',
      },
      null,
      2,
    ) + '\n',
  );
});
