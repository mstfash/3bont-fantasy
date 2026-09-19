import {
  executeCatalogueCommand,
  catalogueFingerprint,
} from '../src/catalogue.ts';
import { catalogueCommandSchema, footballerSchema } from '@fantasy/contracts';
import { grantProofStaff, clearProofStaff } from './proof-staff.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  competitionSchema,
  entrySchema,
  gameweekSchema,
} from '@fantasy/contracts';
import {
  CHIPS,
  CLASSIC_GAMEWEEK_OPTIONS,
  CLASSIC_SCORING_RULES,
  CLASSIC_SQUAD_RULES,
  CLASSIC_TRANSFER_RULES,
  POSITIONS,
  activateChip,
  buildEntry,
  fantasyTicks,
} from '@fantasy/domain';
import { advanceDueGameweeks } from '../src/deadlines.ts';
import { executeEntryCommand, CommandRejected } from '../src/entry-commands.ts';
import { seedDemo } from '../src/demo.ts';
import { AccessDenied } from '../src/authorization.ts';
import { setTimeout } from 'node:timers/promises';
import { entryCommandSchema } from '@fantasy/contracts';
import { competitionCommandSchema } from '@fantasy/contracts';
import { executeCompetitionCommand } from '../src/competition-commands.ts';
import { previewCompetitionUpdate } from '../src/competition-impact.ts';

const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use the disposable integration runner');
const pool = new Pool({ connectionString, max: 8 });
const db = createDatabase(pool);
before(async () => {
  await migrateApplication(pool);
});

void test('competition edits preserve locked rules and require recent scoped MFA', async () => {
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
  const current = competitionSchema.parse({
    ...template,
    id: randomUUID(),
    slug: 'configuration-test',
  });
  await db
    .insertInto('competitions')
    .values({
      id: current.id,
      season_id: current.seasonId,
      slug: current.slug,
      revision: current.revision,
      data: current,
    })
    .execute();
  const sourceRounds = await db
    .selectFrom('gameweeks')
    .select('data')
    .where('competition_id', '=', template.id)
    .execute();
  for (const source of sourceRounds) {
    const round = gameweekSchema.parse({
      ...source.data,
      id: randomUUID(),
      competitionId: current.id,
      status: 'upcoming',
    });
    await db
      .insertInto('gameweeks')
      .values({
        id: round.id,
        competition_id: current.id,
        number: round.number,
        deadline: round.deadline,
        data: round,
      })
      .execute();
  }
  const owner = {
    accountId: 'configuration-owner',
    sessionId: 'admin-session',
    emailVerified: true,
    // This session already exists; do not compare simultaneous host/VM clocks.
    mfaVerifiedAt: new Date(Date.now() - 1000),
    authenticatedAt: new Date(Date.now() - 1000),
  };
  const grants = [{ role: 'owner' as const, competitionId: null }];
  await grantProofStaff(db, owner.accountId, grants);
  const base = {
    kind: 'update',
    commandId: randomUUID(),
    competitionId: current.id,
    expectedRevision: current.revision,
    name: current.name,
    description: current.description,
    entryLimit: current.entryLimit,
    registrationOpens: current.registrationOpens,
    registrationCloses: current.registrationCloses,
    rules: current.rules,
    reason: 'Integration configuration review',
  };
  let command = competitionCommandSchema.parse({
    ...base,
    rules: {
      ...current.rules,
      scoring: { ...current.rules.scoring, assist: 4000 },
    },
  });
  await assert.rejects(
    executeCompetitionCommand(
      db,
      { ...owner, mfaVerifiedAt: null },
      grants,
      command,
    ),
    AccessDenied,
  );
  await assert.rejects(
    executeCompetitionCommand(
      db,
      owner,
      [{ role: 'competition-manager', competitionId: randomUUID() }],
      command,
    ),
    AccessDenied,
  );
  const rounds = (
    await db
      .selectFrom('gameweeks')
      .select('data')
      .where('competition_id', '=', current.id)
      .orderBy('number')
      .execute()
  ).map((r) => gameweekSchema.parse(r.data));
  const locked = rounds[0];
  assert.ok(locked);
  await db
    .updateTable('gameweeks')
    .set({ data: { ...locked, status: 'locked' } })
    .where('id', '=', locked.id)
    .execute();
  assert.equal(command.kind, 'update');
  const impact = await previewCompetitionUpdate(db, owner, grants, command);
  command = { ...command, expectedImpactFingerprint: impact.fingerprint };
  const updated = await executeCompetitionCommand(db, owner, grants, command);
  assert.equal(updated.rules.version, current.rules.version + 1);
  const historical = gameweekSchema.parse(
    (
      await db
        .selectFrom('gameweeks')
        .select('data')
        .where('id', '=', locked.id)
        .executeTakeFirstOrThrow()
    ).data,
  );
  assert.equal(historical.rules.scoring.assist, current.rules.scoring.assist);
  const future = rounds[1];
  assert.ok(future);
  assert.equal(
    gameweekSchema.parse(
      (
        await db
          .selectFrom('gameweeks')
          .select('data')
          .where('id', '=', future.id)
          .executeTakeFirstOrThrow()
      ).data,
    ).rules.scoring.assist,
    4000,
  );
  assert.equal(
    (await executeCompetitionCommand(db, owner, grants, command)).revision,
    updated.revision,
  );
  await assert.rejects(
    executeCompetitionCommand(
      db,
      owner,
      grants,
      competitionCommandSchema.parse({
        ...base,
        commandId: randomUUID(),
        expectedRevision: updated.revision,
        rules: {
          ...updated.rules,
          squad: { ...updated.rules.squad, startingBudget: 900 },
        },
      }),
    ),
    (e: unknown) =>
      e instanceof CommandRejected && e.code === 'structural-rules-frozen',
  );
});
after(async () => {
  await clearProofStaff(db);
  await db.destroy();
});

void test('concurrent deadline jobs snapshot once, consume chips once and advance exactly once', async () => {
  const seasonId = randomUUID();
  const competitionId = randomUUID();
  const firstId = randomUUID();
  const nextId = randomUUID();
  const entryId = randomUUID();
  await db
    .insertInto('seasons')
    .values({
      id: seasonId,
      data: {
        id: seasonId,
        name: { ar: 'اختبار', en: 'Test' },
        startsAt: '2026-01-01T00:00:00Z',
        endsAt: '2027-01-01T00:00:00Z',
        synthetic: true,
      },
    })
    .execute();
  const rules = {
    version: 1,
    squad: CLASSIC_SQUAD_RULES,
    transfer: CLASSIC_TRANSFER_RULES,
    scoring: CLASSIC_SCORING_RULES,
    gameweek: CLASSIC_GAMEWEEK_OPTIONS,
    enabledChips: CHIPS,
    chipInventory: {
      wildcard: 1,
      'free-hit': 1,
      'bench-boost': 1,
      'triple-captain': 1,
    },
    chipWindows: [],
    ranking: 'shared',
    deadlineOffsetMinutes: 90,
    correctionWindowHours: 24,
  };
  const competition = competitionSchema.parse({
    id: competitionId,
    seasonId,
    slug: 'integration-league',
    name: { ar: 'تجربة', en: 'Test league' },
    description: { ar: 'تجربة', en: 'Test league' },
    status: 'published',
    rules,
    entryLimit: 3,
    registrationOpens: '2026-01-01T00:00:00Z',
    registrationCloses: '2027-01-01T00:00:00Z',
    firstLockedAt: null,
    revision: 1,
  });
  await db
    .insertInto('competitions')
    .values({
      id: competition.id,
      season_id: seasonId,
      slug: competition.slug,
      revision: 1,
      data: competition,
    })
    .execute();
  for (const [id, number, deadline] of [
    [firstId, 1, new Date(Date.now() - 60_000).toISOString()],
    [nextId, 2, new Date(Date.now() + 86_400_000).toISOString()],
  ] as const) {
    const data = gameweekSchema.parse({
      id,
      competitionId,
      number,
      name: { ar: 'جولة', en: 'Round' },
      deadline,
      status: 'upcoming',
      rules,
      resultRevision: 0,
      lastMaterialChangeAt: null,
      finalizedAt: null,
      issues: [],
    });
    await db
      .insertInto('gameweeks')
      .values({ id, competition_id: competitionId, number, deadline, data })
      .execute();
  }
  await db
    .insertInto('accounts')
    .values({
      id: 'participant',
      display_name: 'Participant',
      suspended_until: null,
    })
    .execute();
  const players = POSITIONS.flatMap((position) =>
    Array.from({ length: CLASSIC_SQUAD_RULES.quotas[position] }, () => ({
      footballerId: randomUUID(),
      clubId: randomUUID(),
      position,
      price: fantasyTicks(50),
    })),
  );
  const starterIds = POSITIONS.flatMap((position) =>
    players
      .filter((p) => p.position === position)
      .slice(0, { GK: 1, DEF: 3, MID: 4, FWD: 3 }[position])
      .map((p) => p.footballerId),
  );
  const captainId = starterIds[0];
  const viceCaptainId = starterIds[1];
  assert.ok(captainId);
  assert.ok(viceCaptainId);
  const state = activateChip(
    buildEntry(
      {
        players,
        starterIds,
        reserveIds: players
          .map((p) => p.footballerId)
          .filter((id) => !starterIds.includes(id)),
        captaincy: { captainId, viceCaptainId },
      },
      CLASSIC_SQUAD_RULES,
      rules.chipInventory,
    ),
    'bench-boost',
    CHIPS,
  );
  const entry = entrySchema.parse({
    id: entryId,
    competitionId,
    accountId: 'participant',
    name: 'Test squad',
    status: 'active',
    activatedAt: new Date(Date.now() - 120_000).toISOString(),
    firstGameweekId: firstId,
    editingGameweekId: firstId,
    state,
    revision: 1,
  });
  await db
    .insertInto('entries')
    .values({
      id: entry.id,
      competition_id: competitionId,
      account_id: 'participant',
      revision: 1,
      data: entry,
    })
    .execute();
  const outcomes = await Promise.all([
    advanceDueGameweeks(db, competitionId),
    advanceDueGameweeks(db, competitionId),
    advanceDueGameweeks(db, competitionId),
  ]);
  assert.equal(
    outcomes.reduce((sum, result) => sum + result.locked, 0),
    1,
  );
  const snapshots = await db
    .selectFrom('entry_snapshots')
    .selectAll()
    .where('entry_id', '=', entry.id)
    .execute();
  assert.equal(snapshots.length, 1);
  const updated = entrySchema.parse(
    (
      await db
        .selectFrom('entries')
        .select('data')
        .where('id', '=', entry.id)
        .executeTakeFirstOrThrow()
    ).data,
  );
  assert.equal(updated.revision, 2);
  assert.equal(updated.editingGameweekId, nextId);
  assert.equal(updated.state.freeTransfers, 1);
  assert.equal(updated.state.inventory['bench-boost'], 0);
  assert.equal((await advanceDueGameweeks(db, competitionId)).locked, 0);
});

void test('entry commands enforce ownership, retry identity, revisions, caps and the clock after lock waits', async (t) => {
  await seedDemo(db);
  const competition = competitionSchema.parse(
    (
      await db
        .selectFrom('competitions')
        .select('data')
        .where('slug', '=', 'cairo-demo')
        .executeTakeFirstOrThrow()
    ).data,
  );
  const gameweek = gameweekSchema.parse(
    (
      await db
        .selectFrom('gameweeks')
        .select('data')
        .where('competition_id', '=', competition.id)
        .orderBy('number')
        .executeTakeFirstOrThrow()
    ).data,
  );
  const market = await db
    .selectFrom('competition_players')
    .innerJoin(
      'footballers',
      'footballers.id',
      'competition_players.footballer_id',
    )
    .select(['competition_players.data as pool', 'footballers.club_id'])
    .where('competition_players.competition_id', '=', competition.id)
    .execute();
  const selected: typeof market = [];
  const counts = new Map<string, number>();
  for (const position of POSITIONS) {
    for (let i = 0; i < CLASSIC_SQUAD_RULES.quotas[position]; i++) {
      const candidate = market
        .filter(
          (p) =>
            p.pool.position === position &&
            !selected.includes(p) &&
            (counts.get(p.club_id) ?? 0) < 3,
        )
        .sort(
          (a, b) => (counts.get(a.club_id) ?? 0) - (counts.get(b.club_id) ?? 0),
        )[0];
      assert.ok(candidate);
      selected.push(candidate);
      counts.set(candidate.club_id, (counts.get(candidate.club_id) ?? 0) + 1);
    }
  }
  const starters = POSITIONS.flatMap((position) =>
    selected
      .filter((p) => p.pool.position === position)
      .slice(0, { GK: 1, DEF: 3, MID: 4, FWD: 3 }[position])
      .map((p) => p.pool.footballerId),
  );
  const captainId = starters[0];
  const viceCaptainId = starters[1];
  assert.ok(captainId);
  assert.ok(viceCaptainId);
  const lineup = {
    starterIds: starters,
    reserveIds: selected
      .map((p) => p.pool.footballerId)
      .filter((id) => !starters.includes(id)),
    captaincy: { captainId, viceCaptainId },
  };
  const principal = {
    accountId: 'command-owner',
    sessionId: 'test-session',
    emailVerified: true,
    mfaVerifiedAt: null,
    authenticatedAt: new Date(),
  };
  await db
    .insertInto('accounts')
    .values({
      id: principal.accountId,
      display_name: 'Command owner',
      suspended_until: null,
    })
    .execute();
  const command = entryCommandSchema.parse({
    kind: 'create',
    commandId: randomUUID(),
    competitionId: competition.id,
    gameweekId: gameweek.id,
    name: 'Concurrency test',
    lineup,
    players: selected.map((p) => ({
      footballerId: p.pool.footballerId,
      priceRevision: p.pool.priceRevision,
    })),
  });
  const [entry, replay] = await Promise.all([
    executeEntryCommand(db, principal, command),
    executeEntryCommand(db, principal, command),
  ]);
  await t.test(
    'concurrent retries return one entry and one activation',
    async () => {
      assert.equal(entry.id, replay.id);
      assert.equal(
        (
          await db
            .selectFrom('entries')
            .select('id')
            .where('account_id', '=', principal.accountId)
            .execute()
        ).length,
        1,
      );
      await assert.rejects(
        executeEntryCommand(
          db,
          principal,
          entryCommandSchema.parse({ ...command, name: 'Changed command' }),
        ),
        (e: unknown) =>
          e instanceof CommandRejected && e.code === 'idempotency-conflict',
      );
    },
  );
  const edit = entryCommandSchema.parse({
    kind: 'lineup',
    commandId: randomUUID(),
    competitionId: competition.id,
    gameweekId: gameweek.id,
    entryId: entry.id,
    expectedRevision: entry.revision,
    lineup: {
      ...lineup,
      captaincy: { captainId: viceCaptainId, viceCaptainId: captainId },
    },
  });
  assert.ok(edit.kind === 'lineup');
  await t.test('other accounts cannot edit an owned entry', async () => {
    await db
      .insertInto('accounts')
      .values({
        id: 'other-account',
        display_name: 'Other account',
        suspended_until: null,
      })
      .execute();
    await assert.rejects(
      executeEntryCommand(
        db,
        { ...principal, accountId: 'other-account' },
        edit,
      ),
      AccessDenied,
    );
  });
  await t.test(
    'competing edits cannot silently overwrite each other',
    async () => {
      const results = await Promise.allSettled([
        executeEntryCommand(db, principal, edit),
        executeEntryCommand(db, principal, {
          ...edit,
          commandId: randomUUID(),
        }),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      const failure = results.find((r) => r.status === 'rejected');
      assert.ok(
        failure?.status === 'rejected' &&
          failure.reason instanceof CommandRejected &&
          failure.reason.code === 'entry-changed',
      );
    },
  );
  await t.test(
    'concurrent registrations cannot exceed the per-account entry cap',
    async () => {
      const outcomes = await Promise.allSettled(
        Array.from({ length: 3 }, () =>
          executeEntryCommand(db, principal, {
            ...command,
            commandId: randomUUID(),
          }),
        ),
      );
      assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 2);
      assert.equal(
        (
          await db
            .selectFrom('entries')
            .select('id')
            .where('account_id', '=', principal.accountId)
            .execute()
        ).length,
        3,
      );
    },
  );
  await t.test('a stale price quote changes nothing', async () => {
    const outgoing = selected[0];
    assert.ok(outgoing);
    const incoming = market.find(
      (p) =>
        p.pool.position === outgoing.pool.position && !selected.includes(p),
    );
    assert.ok(incoming);
    await assert.rejects(
      executeEntryCommand(
        db,
        principal,
        entryCommandSchema.parse({
          kind: 'transfer',
          commandId: randomUUID(),
          competitionId: competition.id,
          gameweekId: gameweek.id,
          entryId: entry.id,
          expectedRevision: 2,
          lineup,
          transfers: [
            { out: outgoing.pool.footballerId, in: incoming.pool.footballerId },
          ],
          quotes: [
            { footballerId: outgoing.pool.footballerId, priceRevision: 1 },
            { footballerId: incoming.pool.footballerId, priceRevision: 999 },
          ],
        }),
      ),
      (e: unknown) =>
        e instanceof CommandRejected && e.code === 'price-changed',
    );
    assert.equal(
      (
        await db
          .selectFrom('entries')
          .select('revision')
          .where('id', '=', entry.id)
          .executeTakeFirstOrThrow()
      ).revision,
      2,
    );
  });
  await t.test(
    'a real club move preserves held squads and the next transfer must restore the club limit',
    async () => {
      const participant = {
        ...principal,
        accountId: randomUUID(),
        sessionId: randomUUID(),
      };
      const acceptedAt = (
        await pool.query<{ now: Date }>(
          "SELECT clock_timestamp() - interval '1 second' AS now",
        )
      ).rows[0]?.now;
      assert.ok(acceptedAt);
      const steward = {
        ...participant,
        accountId: randomUUID(),
        sessionId: randomUUID(),
        mfaVerifiedAt: acceptedAt,
        authenticatedAt: acceptedAt,
      };
      const grants = [{ role: 'data-steward' as const, competitionId: null }];
      await grantProofStaff(db, participant.accountId, []);
      await grantProofStaff(db, steward.accountId, grants);
      const created = await executeEntryCommand(db, participant, {
        ...command,
        commandId: randomUUID(),
      });
      const heldIds = new Set(
        created.state.roster.holdings.map((h) => h.footballerId),
      );
      const footballers = (
        await db
          .selectFrom('footballers')
          .select('data')
          .where('id', 'in', [...heldIds])
          .execute()
      ).map((r) => footballerSchema.parse(r.data));
      const targetClub = footballers[0]?.clubId;
      assert.ok(targetClub);
      const already = footballers.filter((f) => f.clubId === targetClub);
      const moved = footballers
        .filter((f) => f.clubId !== targetClub)
        .slice(0, 4 - already.length);
      assert.equal(already.length + moved.length, 4);
      const changeClub = async (footballer: (typeof footballers)[number]) => {
        const current = (
          await db
            .selectFrom('footballers')
            .select('data')
            .where('id', '=', footballer.id)
            .executeTakeFirstOrThrow()
        ).data;
        await executeCatalogueCommand(
          db,
          steward,
          grants,
          catalogueCommandSchema.parse({
            kind: 'footballer',
            commandId: randomUUID(),
            footballer,
            expectedFingerprint: catalogueFingerprint(current),
            reason: 'Synthetic verified real-world club transfer',
          }),
        );
      };
      try {
        for (const f of moved) await changeClub({ ...f, clubId: targetClub });
        assert.deepEqual(
          (
            await db
              .selectFrom('entries')
              .select('data')
              .where('id', '=', created.id)
              .executeTakeFirstOrThrow()
          ).data,
          created,
          'Catalogue changes cannot force a sale, rewrite bank or add a transfer hit',
        );
        const edited = await executeEntryCommand(
          db,
          participant,
          entryCommandSchema.parse({
            kind: 'lineup',
            commandId: randomUUID(),
            competitionId: competition.id,
            gameweekId: gameweek.id,
            entryId: created.id,
            expectedRevision: created.revision,
            lineup,
          }),
        );
        assert.deepEqual(
          edited.state.roster.holdings,
          created.state.roster.holdings,
        );
        assert.equal(
          edited.state.transfersThisRound,
          created.state.transfersThisRound,
        );
        const currentMarket = await db
          .selectFrom('competition_players')
          .innerJoin(
            'footballers',
            'footballers.id',
            'competition_players.footballer_id',
          )
          .select(['competition_players.data as pool', 'footballers.club_id'])
          .where('competition_players.competition_id', '=', competition.id)
          .execute();
        const heldByClub = new Map<string, number>();
        for (const f of currentMarket.filter((f) =>
          heldIds.has(f.pool.footballerId),
        ))
          heldByClub.set(f.club_id, (heldByClub.get(f.club_id) ?? 0) + 1);
        const pair = (fromTarget: boolean) => {
          for (const outgoing of currentMarket.filter(
            (f) =>
              heldIds.has(f.pool.footballerId) &&
              (f.club_id === targetClub) === fromTarget,
          )) {
            const incoming = currentMarket.find(
              (f) =>
                !heldIds.has(f.pool.footballerId) &&
                f.pool.position === outgoing.pool.position &&
                f.club_id !== targetClub &&
                (heldByClub.get(f.club_id) ?? 0) < 3 &&
                f.pool.price <= outgoing.pool.price,
            );
            if (incoming) return { outgoing, incoming };
          }
          throw new Error(
            'Synthetic catalogue needs an affordable positional replacement',
          );
        };
        const transfer = ({ outgoing, incoming }: ReturnType<typeof pair>) => {
          const from = outgoing.pool.footballerId,
            to = incoming.pool.footballerId;
          const replace = (id: string) => (id === from ? to : id);
          const roster = edited.state.roster;
          return entryCommandSchema.parse({
            kind: 'transfer',
            commandId: randomUUID(),
            competitionId: competition.id,
            gameweekId: gameweek.id,
            entryId: created.id,
            expectedRevision: edited.revision,
            transfers: [{ out: from, in: to }],
            quotes: [outgoing, incoming].map((f) => ({
              footballerId: f.pool.footballerId,
              priceRevision: f.pool.priceRevision,
            })),
            lineup: {
              starterIds: roster.starterIds.map(replace),
              reserveIds: roster.reserveIds.map(replace),
              captaincy: roster.captaincy
                ? {
                    captainId: replace(roster.captaincy.captainId),
                    viceCaptainId: replace(roster.captaincy.viceCaptainId),
                  }
                : null,
            },
          });
        };
        await assert.rejects(
          executeEntryCommand(db, participant, transfer(pair(false))),
          /club-cap/u,
        );
        assert.deepEqual(
          (
            await db
              .selectFrom('entries')
              .select('data')
              .where('id', '=', created.id)
              .executeTakeFirstOrThrow()
          ).data,
          edited,
          'Rejected unrelated transfer is atomic',
        );
        const corrected = await executeEntryCommand(
          db,
          participant,
          transfer(pair(true)),
        );
        assert.equal(
          corrected.state.roster.holdings.filter(
            (h) =>
              currentMarket.find((f) => f.pool.footballerId === h.footballerId)
                ?.club_id === targetClub,
          ).length,
          3,
        );
        assert.equal(
          corrected.state.transfersThisRound,
          edited.state.transfersThisRound + 1,
        );
      } finally {
        for (const f of moved) await changeClub(f);
        await db.deleteFrom('entries').where('id', '=', created.id).execute();
        await db
          .deleteFrom('commands')
          .where('actor_id', 'in', [participant.accountId, steward.accountId])
          .execute();
      }
    },
  );
  await t.test(
    'waiting across the deadline is rejected; an accepted retry still succeeds',
    async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'SELECT id FROM fantasy.competitions WHERE id=$1 FOR UPDATE',
          [competition.id],
        );
        const deadline = new Date(Date.now() + 150).toISOString();
        await client.query(
          'UPDATE fantasy.gameweeks SET deadline=$1,data=$2 WHERE id=$3',
          [deadline, { ...gameweek, deadline }, gameweek.id],
        );
        const waiting = executeEntryCommand(db, principal, {
          ...edit,
          commandId: randomUUID(),
          expectedRevision: 2,
        });
        // Attach the rejection handler immediately, before releasing the blocked transaction.
        const rejected = assert.rejects(
          waiting,
          (e: unknown) =>
            e instanceof CommandRejected && e.code === 'deadline-passed',
        );
        await setTimeout(250);
        await client.query('COMMIT');
        await rejected;
        assert.equal(
          (await executeEntryCommand(db, principal, command)).id,
          entry.id,
        );
        assert.equal(
          (
            await db
              .selectFrom('entries')
              .select('revision')
              .where('id', '=', entry.id)
              .executeTakeFirstOrThrow()
          ).revision,
          2,
        );
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    },
  );
});
