import { accountExportQueries } from '../src/account-export-queries.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  competitionSchema,
  gameweekSchema,
  entryCommandSchema,
  lockedEntrySchema,
  entryResultSchema,
  snapshotRepairCommandSchema,
  historicalRuleSettingsSchema,
} from '@fantasy/contracts';
import { seedDemoReplay } from '../src/demo-replay.ts';
import { executeEntryCommand } from '../src/entry-commands.ts';
import { advanceDueGameweeks } from '../src/deadlines.ts';
import { publishGameweekResults } from '../src/results.ts';
import {
  previewSnapshotRepair,
  executeSnapshotRepair,
} from '../src/snapshot-repair.ts';
import { readPublishedSnapshot } from '../src/entry-snapshots.ts';
import { publishedLineupWithinTransaction } from '../src/public-lineup.ts';
import {
  previewHistoricalRules,
  executeHistoricalRules,
} from '../src/historical-rules.ts';
import { createIdentity, migrateIdentity } from '../src/identity.ts';
import { AccessDenied } from '../src/authorization.ts';
import { grantProofStaff, clearProofStaff } from './proof-staff.ts';
const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use disposable integration runner');
const pool = new Pool({ connectionString, max: 8 }),
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
  await clearProofStaff(db);
  await db.destroy();
});
void test('snapshot repair uses accepted decisions, preserves versions and publishes atomically', async (t) => {
  await seedDemoReplay(db);
  const source = (
    await db
      .selectFrom('competitions')
      .select('data')
      .where('slug', '=', 'cairo-replay')
      .executeTakeFirstOrThrow()
  ).data;
  const sourceRound = (
    await db
      .selectFrom('gameweeks')
      .select('data')
      .where('competition_id', '=', source.id)
      .orderBy('number')
      .executeTakeFirstOrThrow()
  ).data;
  const sourceSnapshot = lockedEntrySchema.parse(
    (
      await db
        .selectFrom('entry_snapshots')
        .select('payload')
        .where('gameweek_id', '=', sourceRound.id)
        .executeTakeFirstOrThrow()
    ).payload,
  );
  const competition = competitionSchema.parse({
    ...source,
    id: randomUUID(),
    slug: `snapshot-${randomUUID()}`,
    status: 'published',
    firstLockedAt: null,
    rules: { ...sourceRound.rules, correctionWindowHours: 24 },
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
  let round = gameweekSchema.parse({
    ...sourceRound,
    rules: competition.rules,
    id: randomUUID(),
    competitionId: competition.id,
    deadline: new Date(Date.now() + 60000).toISOString(),
    status: 'upcoming',
    resultRevision: 0,
    lastMaterialChangeAt: null,
    finalizedAt: null,
    issues: [],
  });
  const next = gameweekSchema.parse({
    ...round,
    id: randomUUID(),
    number: 2,
    deadline: new Date(Date.now() + 3600000).toISOString(),
  });
  for (const r of [round, next])
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
  const players = (
    await db
      .selectFrom('competition_players')
      .select('data')
      .where('competition_id', '=', source.id)
      .execute()
  ).map((r) => ({ ...r.data, competitionId: competition.id }));
  await db
    .insertInto('competition_players')
    .values(
      players.map((p) => ({
        competition_id: competition.id,
        footballer_id: p.footballerId,
        data: p,
      })),
    )
    .execute();
  const assignments = await db
    .selectFrom('fixture_assignments')
    .select('fixture_id')
    .where('gameweek_id', '=', sourceRound.id)
    .execute();
  await db
    .insertInto('fixture_assignments')
    .values(
      assignments.map((a) => ({
        ...a,
        competition_id: competition.id,
        gameweek_id: round.id,
      })),
    )
    .execute();
  const principal = {
    accountId: randomUUID(),
    sessionId: randomUUID(),
    emailVerified: true,
    mfaVerifiedAt: new Date(),
    authenticatedAt: new Date(),
  };
  const participant = {
    ...principal,
    accountId: randomUUID(),
    sessionId: randomUUID(),
  };
  const manager = {
    ...principal,
    accountId: randomUUID(),
    sessionId: randomUUID(),
  };
  await grantProofStaff(db, principal.accountId, [
    { role: 'owner', competitionId: null },
  ]);
  await grantProofStaff(db, participant.accountId, []);
  await grantProofStaff(db, manager.accountId, [
    { role: 'competition-manager', competitionId: competition.id },
  ]);
  const lineup = {
    starterIds: sourceSnapshot.roster.starterIds,
    reserveIds: sourceSnapshot.roster.reserveIds,
    captaincy: sourceSnapshot.roster.captaincy,
  };
  let entry = await executeEntryCommand(
    db,
    participant,
    entryCommandSchema.parse({
      kind: 'create',
      commandId: randomUUID(),
      competitionId: competition.id,
      gameweekId: round.id,
      name: 'Accepted choices proof',
      lineup,
      players: sourceSnapshot.roster.holdings.map((h) => ({
        footballerId: h.footballerId,
        priceRevision: players.find((p) => p.footballerId === h.footballerId)
          ?.priceRevision,
      })),
    }),
  );
  await setTimeout(5);
  const sourceCommandId = randomUUID();
  entry = await executeEntryCommand(
    db,
    participant,
    entryCommandSchema.parse({
      kind: 'chip',
      commandId: sourceCommandId,
      competitionId: competition.id,
      gameweekId: round.id,
      entryId: entry.id,
      expectedRevision: entry.revision,
      chip: 'bench-boost',
    }),
  );
  round = { ...round, deadline: new Date(Date.now() + 50).toISOString() };
  await db
    .updateTable('gameweeks')
    .set({ deadline: round.deadline, data: round })
    .where('id', '=', round.id)
    .execute();
  await setTimeout(75);
  await advanceDueGameweeks(db, competition.id);
  const acceptedSnapshot = lockedEntrySchema.parse(
    (
      await db
        .selectFrom('entry_snapshots')
        .select('payload')
        .where('entry_id', '=', entry.id)
        .where('gameweek_id', '=', round.id)
        .executeTakeFirstOrThrow()
    ).payload,
  );
  assert.ok(acceptedSnapshot.roster.captaincy);
  const corrupted = {
    ...acceptedSnapshot,
    transferDeduction: 4000,
    roster: {
      ...acceptedSnapshot.roster,
      bank: acceptedSnapshot.roster.bank + 1,
      captaincy: {
        captainId: acceptedSnapshot.roster.captaincy.viceCaptainId,
        viceCaptainId: acceptedSnapshot.roster.captaincy.captainId,
      },
    },
  };
  await db
    .updateTable('entry_snapshots')
    .set({ payload: corrupted })
    .where('entry_id', '=', entry.id)
    .where('gameweek_id', '=', round.id)
    .execute();
  await publishGameweekResults(db, round.id);
  async function nowRound() {
    return (
      await db
        .selectFrom('gameweeks')
        .select('data')
        .where('id', '=', round.id)
        .executeTakeFirstOrThrow()
    ).data;
  }
  let published = await nowRound();
  await db
    .updateTable('gameweeks')
    .set({
      data: {
        ...published,
        lastMaterialChangeAt: new Date(Date.now() - 48 * 3600000).toISOString(),
      },
    })
    .where('id', '=', round.id)
    .execute();
  await publishGameweekResults(db, round.id);
  published = await nowRound();
  assert.equal(published.status, 'finalized');
  const futureEntry = (
    await db
      .selectFrom('entries')
      .select('data')
      .where('id', '=', entry.id)
      .executeTakeFirstOrThrow()
  ).data;
  const originalResult = await db
    .selectFrom('entry_results')
    .selectAll()
    .where('entry_id', '=', entry.id)
    .where('gameweek_id', '=', round.id)
    .where('revision', '=', published.resultRevision)
    .executeTakeFirstOrThrow();
  const sourceReceipt = await db
    .selectFrom('commands')
    .selectAll()
    .where('actor_id', '=', participant.accountId)
    .where('command_id', '=', sourceCommandId)
    .executeTakeFirstOrThrow();
  const selection = {
    entryId: entry.id,
    gameweekId: round.id,
    expectedResultRevision: published.resultRevision,
  };
  const preview = () => previewSnapshotRepair(db, principal, selection);
  const command = (fingerprint: string) =>
    snapshotRepairCommandSchema.parse({
      commandId: randomUUID(),
      selection,
      expectedFingerprint: fingerprint,
      reason:
        'Synthetic corrupted lock restored from authoritative accepted receipt',
    });
  const counts = async () => ({
    repairs: (
      await db
        .selectFrom('entry_snapshot_repairs')
        .selectAll()
        .where('gameweek_id', '=', round.id)
        .execute()
    ).length,
    results: (
      await db
        .selectFrom('entry_results')
        .selectAll()
        .where('gameweek_id', '=', round.id)
        .execute()
    ).length,
    audits: (
      await db
        .selectFrom('audit_events')
        .selectAll()
        .where('scope_id', '=', round.id)
        .execute()
    ).length,
    commands: (
      await db
        .selectFrom('commands')
        .selectAll()
        .where('actor_id', '=', principal.accountId)
        .execute()
    ).length,
  });
  try {
    await t.test(
      'owner authority and strict selection reject arbitrary lineups or hand-picked receipts',
      async () => {
        await assert.rejects(
          previewSnapshotRepair(db, manager, selection),
          AccessDenied,
        );
        assert.equal(
          snapshotRepairCommandSchema.safeParse({
            ...command('0'.repeat(64)),
            snapshot: corrupted,
          }).success,
          false,
        );
        assert.equal(
          snapshotRepairCommandSchema.safeParse({
            ...command('0'.repeat(64)),
            selection: { ...selection, sourceCommandId },
          }).success,
          false,
        );
        await assert.rejects(
          previewSnapshotRepair(db, principal, {
            ...selection,
            expectedResultRevision: published.resultRevision + 1,
          }),
          { code: 'results-changed' },
        );
      },
    );
    await t.test(
      'repeatable preview rolls back candidate versions and uses the latest genuine acceptance',
      async () => {
        const before = await counts(),
          first = await preview(),
          second = await preview();
        assert.deepEqual(await counts(), before);
        assert.equal(first.fingerprint, second.fingerprint);
        assert.equal(first.source.commandId, sourceCommandId);
        assert.deepEqual(first.after, acceptedSnapshot);
        assert.deepEqual(first.before, corrupted);
        assert.equal(first.canApply, true);
        assert.notEqual(
          first.impact.changes[0]?.before,
          first.impact.changes[0]?.after,
        );
        assert.deepEqual(await nowRound(), published);
      },
    );
    await t.test(
      'missing, late and ambiguous receipt evidence cannot authorize a repair',
      async () => {
        const receipts = await db
          .selectFrom('commands')
          .selectAll()
          .where('actor_id', '=', participant.accountId)
          .execute();
        await db
          .updateTable('commands')
          .set({ accepted_at: new Date(Date.now() + 3600000) })
          .where('actor_id', '=', participant.accountId)
          .execute();
        try {
          await assert.rejects(preview(), {
            code: 'snapshot-source-unavailable',
          });
        } finally {
          for (const r of receipts)
            await db
              .updateTable('commands')
              .set({ accepted_at: r.accepted_at })
              .where('actor_id', '=', r.actor_id)
              .where('command_id', '=', r.command_id)
              .execute();
        }
        const duplicateId = randomUUID();
        await db
          .insertInto('commands')
          .values({ ...sourceReceipt, command_id: duplicateId })
          .execute();
        try {
          await assert.rejects(preview(), {
            code: 'snapshot-source-ambiguous',
          });
        } finally {
          await db
            .deleteFrom('commands')
            .where('actor_id', '=', participant.accountId)
            .where('command_id', '=', duplicateId)
            .execute();
        }
      },
    );
    await t.test(
      'changed original or accepted evidence invalidates a reviewed confirmation',
      async () => {
        const p = await preview();
        await db
          .updateTable('entry_snapshots')
          .set({ payload: { ...corrupted, transferDeduction: 8000 } })
          .where('entry_id', '=', entry.id)
          .where('gameweek_id', '=', round.id)
          .execute();
        try {
          await assert.rejects(
            executeSnapshotRepair(db, principal, command(p.fingerprint)),
            { code: 'preview-changed' },
          );
        } finally {
          await db
            .updateTable('entry_snapshots')
            .set({ payload: corrupted })
            .where('entry_id', '=', entry.id)
            .where('gameweek_id', '=', round.id)
            .execute();
        }
        await db
          .updateTable('commands')
          .set({ fingerprint: '1'.repeat(64) })
          .where('actor_id', '=', participant.accountId)
          .where('command_id', '=', sourceCommandId)
          .execute();
        try {
          await assert.rejects(
            executeSnapshotRepair(db, principal, command(p.fingerprint)),
            { code: 'preview-changed' },
          );
        } finally {
          await db
            .updateTable('commands')
            .set({ fingerprint: sourceReceipt.fingerprint })
            .where('actor_id', '=', participant.accountId)
            .where('command_id', '=', sourceCommandId)
            .execute();
        }
      },
    );
    await t.test(
      'unreadable original snapshots fail public display safely and can be reconstructed',
      async () => {
        await db
          .updateTable('entry_snapshots')
          .set({ payload: { broken: true } })
          .where('entry_id', '=', entry.id)
          .where('gameweek_id', '=', round.id)
          .execute();
        try {
          assert.equal(
            await readPublishedSnapshot(
              db,
              entry.id,
              round.id,
              published.resultRevision,
            ),
            null,
          );
          const p = await preview();
          assert.equal(p.before, null);
          assert.deepEqual(p.after, acceptedSnapshot);
          assert.equal(p.canApply, true);
        } finally {
          await db
            .updateTable('entry_snapshots')
            .set({ payload: corrupted })
            .where('entry_id', '=', entry.id)
            .where('gameweek_id', '=', round.id)
            .execute();
        }
      },
    );
    await t.test(
      'publication failure rolls back repair, reopening, audit, receipt and every score',
      async () => {
        const p = await preview(),
          before = await counts();
        await pool.query(
          `CREATE FUNCTION fantasy.fail_snapshot_repair() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.gameweek_id='${round.id}'::uuid THEN RAISE EXCEPTION 'synthetic publication interruption'; END IF; RETURN NEW; END $$; CREATE TRIGGER snapshot_repair_failure BEFORE INSERT ON fantasy.entry_results FOR EACH ROW EXECUTE FUNCTION fantasy.fail_snapshot_repair()`,
        );
        try {
          await assert.rejects(
            executeSnapshotRepair(db, principal, command(p.fingerprint)),
            /synthetic publication interruption/u,
          );
        } finally {
          await pool.query(
            'DROP TRIGGER snapshot_repair_failure ON fantasy.entry_results; DROP FUNCTION fantasy.fail_snapshot_repair()',
          );
        }
        assert.deepEqual(await counts(), before);
        assert.deepEqual(await nowRound(), published);
      },
    );
    let appliedCommand = command('0'.repeat(64));
    await t.test(
      'concurrent confirmation creates one version and retains all later participant decisions',
      async () => {
        const p = await preview();
        appliedCommand = command(p.fingerprint);
        const results = await Promise.all([
          executeSnapshotRepair(db, principal, appliedCommand),
          executeSnapshotRepair(db, principal, appliedCommand),
        ]);
        assert.deepEqual(results[0], results[1]);
        assert.equal(results[0].resultRevision, published.resultRevision + 1);
        assert.equal(results[0].status, 'provisional');
        assert.deepEqual(
          (
            await db
              .selectFrom('entry_snapshots')
              .select('payload')
              .where('entry_id', '=', entry.id)
              .where('gameweek_id', '=', round.id)
              .executeTakeFirstOrThrow()
          ).payload,
          corrupted,
        );
        assert.deepEqual(
          (
            await db
              .selectFrom('entries')
              .select('data')
              .where('id', '=', entry.id)
              .executeTakeFirstOrThrow()
          ).data,
          futureEntry,
        );
        const result = entryResultSchema.parse(
          (
            await db
              .selectFrom('entry_results')
              .select('payload')
              .where('entry_id', '=', entry.id)
              .where('gameweek_id', '=', round.id)
              .where('revision', '=', published.resultRevision + 1)
              .executeTakeFirstOrThrow()
          ).payload,
        );
        assert.equal(result.total, p.impact.changes[0]?.after);
        assert.equal(result.transferDeduction, 0);
        assert.deepEqual(
          await readPublishedSnapshot(
            db,
            entry.id,
            round.id,
            published.resultRevision,
          ),
          corrupted,
        );
        assert.deepEqual(
          await readPublishedSnapshot(
            db,
            entry.id,
            round.id,
            published.resultRevision + 1,
          ),
          acceptedSnapshot,
        );
        const current = await nowRound();
        const lineup = await db
          .transaction()
          .execute((tx) =>
            publishedLineupWithinTransaction(tx, current, entry.id),
          );
        assert.equal(lineup?.chip, 'bench-boost');
        assert.deepEqual(lineup.pitchIds, acceptedSnapshot.roster.starterIds);
        assert.deepEqual(
          await db
            .selectFrom('entry_results')
            .selectAll()
            .where('entry_id', '=', entry.id)
            .where('gameweek_id', '=', round.id)
            .where('revision', '=', published.resultRevision)
            .executeTakeFirstOrThrow(),
          originalResult,
        );
        assert.equal((await counts()).repairs, 1);
      },
    );
    await t.test(
      'private exports include repaired versions without internal evidence and paginate every result revision',
      async () => {
        const scope = {
          competitionId: competition.id,
          historyFrom: null,
          historyUntil: null,
        };
        const own = accountExportQueries(
          participant.accountId,
          scope,
          new Date(Date.now() + 1000),
        );
        const repairQuery = own.find((q) => q.kind === 'snapshot-repair');
        assert.ok(repairQuery);
        const repaired = (await repairQuery.page('').execute(db)).rows;
        assert.equal(repaired.length, 1);
        assert.deepEqual(repaired[0]?.data, {
          entryId: entry.id,
          competitionId: competition.id,
          gameweekId: round.id,
          repairRevision: 2,
          resultRevision: published.resultRevision + 1,
          recordedAt: (
            await db
              .selectFrom('entry_snapshot_repairs')
              .select('data')
              .where('gameweek_id', '=', round.id)
              .executeTakeFirstOrThrow()
          ).data.recordedAt,
          squad: acceptedSnapshot,
          acceptedAt: sourceReceipt.accepted_at.toISOString(),
        });
        const otherQuery = accountExportQueries(
          manager.accountId,
          scope,
          new Date(Date.now() + 1000),
        ).find((q) => q.kind === 'snapshot-repair');
        assert.ok(otherQuery);
        assert.equal((await otherQuery.page('').execute(db)).rows.length, 0);
        const extra = Array.from({ length: 105 }, (_, i) => ({
          ...originalResult,
          revision: 100 + i,
        }));
        await db.insertInto('entry_results').values(extra).execute();
        try {
          const resultQuery = own.find((q) => q.kind === 'entry-result');
          assert.ok(resultQuery);
          const first = (await resultQuery.page('').execute(db)).rows;
          assert.equal(first.length, 100);
          const last = first.at(-1);
          assert.ok(last);
          const second = (await resultQuery.page(last.cursor).execute(db)).rows;
          assert.equal(second.length, 7);
          assert.equal(
            new Set([...first, ...second].map((r) => r.cursor)).size,
            107,
          );
        } finally {
          await db
            .deleteFrom('entry_results')
            .where('gameweek_id', '=', round.id)
            .where('revision', '>=', 100)
            .execute();
        }
      },
    );
    await t.test(
      'worker retries and later rules replay use the repaired snapshot without duplicating it',
      async () => {
        const current = await nowRound();
        await publishGameweekResults(db, round.id);
        assert.deepEqual(await nowRound(), current);
        await assert.rejects(
          previewSnapshotRepair(db, principal, {
            ...selection,
            expectedResultRevision: current.resultRevision,
          }),
          { code: 'snapshot-no-change' },
        );
        const settings = historicalRuleSettingsSchema.parse({
          scoring: historicalRuleSettingsSchema.shape.scoring
            .strip()
            .parse(current.rules.scoring),
          gameweek: { ...current.rules.gameweek, captainMultiplier: 3 },
        });
        const selectionRules = {
          gameweekId: round.id,
          expectedResultRevision: current.resultRevision,
          settings,
        };
        const p = await previewHistoricalRules(db, principal, selectionRules);
        const updated = await executeHistoricalRules(db, principal, {
          kind: 'replay-rules',
          commandId: randomUUID(),
          selection: selectionRules,
          expectedFingerprint: p.fingerprint,
          reason: 'Synthetic published rule correction after snapshot repair',
        });
        assert.deepEqual(
          await readPublishedSnapshot(
            db,
            entry.id,
            round.id,
            updated.resultRevision,
          ),
          acceptedSnapshot,
        );
        const result = entryResultSchema.parse(
          (
            await db
              .selectFrom('entry_results')
              .select('payload')
              .where('entry_id', '=', entry.id)
              .where('gameweek_id', '=', round.id)
              .where('revision', '=', updated.resultRevision)
              .executeTakeFirstOrThrow()
          ).payload,
        );
        assert.equal(result.total, p.impact.changes[0]?.after);
        assert.equal((await counts()).repairs, 1);
        await db
          .deleteFrom('staff_grants')
          .where('account_id', '=', principal.accountId)
          .execute();
        await assert.rejects(
          executeSnapshotRepair(db, principal, appliedCommand),
          AccessDenied,
        );
      },
    );
  } finally {
    await db
      .deleteFrom('entry_snapshot_repairs')
      .where('gameweek_id', '=', round.id)
      .execute();
    await db
      .deleteFrom('result_reviews')
      .where('gameweek_id', '=', round.id)
      .execute();
    await db
      .deleteFrom('entry_results')
      .where('competition_id', '=', competition.id)
      .execute();
    await db
      .deleteFrom('round_calculations')
      .where('gameweek_id', '=', round.id)
      .execute();
    await db
      .deleteFrom('entry_snapshots')
      .where('competition_id', '=', competition.id)
      .execute();
    await db
      .deleteFrom('entries')
      .where('competition_id', '=', competition.id)
      .execute();
    await db
      .deleteFrom('gameweek_player_pools')
      .where('gameweek_id', 'in', [round.id, next.id])
      .execute();
    await db
      .deleteFrom('fixture_assignments')
      .where('competition_id', '=', competition.id)
      .execute();
    await db
      .deleteFrom('gameweeks')
      .where('competition_id', '=', competition.id)
      .execute();
    await db
      .deleteFrom('competition_players')
      .where('competition_id', '=', competition.id)
      .execute();
    await db
      .deleteFrom('staff_grants')
      .where('competition_id', '=', competition.id)
      .execute();
    await db
      .deleteFrom('competitions')
      .where('id', '=', competition.id)
      .execute();
    await db
      .deleteFrom('commands')
      .where('actor_id', 'in', [principal.accountId, participant.accountId])
      .execute();
  }
});
