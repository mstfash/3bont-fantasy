import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  competitionSchema,
  gameweekSchema,
  roundCalculationSchema,
  priceCalibrationCommandSchema,
} from '@fantasy/contracts';
import { seedDemo } from '../src/demo.ts';
import {
  createPriceCalibration,
  readPriceCalibration,
} from '../src/price-calibration.ts';
import { AccessDenied } from '../src/authorization.ts';
import { CommandRejected } from '../src/errors.ts';
import { grantProofStaff, clearProofStaff } from './proof-staff.ts';
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
});
after(async () => {
  await clearProofStaff(db);
  await db.destroy();
});
void test('saved calibration binds evidence, isolates prices, gates authority and survives changed-state retries', async () => {
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
    slug: 'price-calibration-proof',
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
  const originals = await db
    .selectFrom('competition_players')
    .select('data')
    .where('competition_id', '=', template.id)
    .orderBy('footballer_id')
    .execute();
  const players = originals.map((p, i) => ({
    ...p.data,
    competitionId: competition.id,
    manuallyPinned: i === 0,
  }));
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
  const days = (n: number) =>
    new Date(Date.now() + n * 86400_000).toISOString();
  const rounds = [0, 1, 2].map((i) =>
    gameweekSchema.parse({
      id: randomUUID(),
      competitionId: competition.id,
      number: i + 1,
      name: { ar: 'جولة معايرة', en: 'Calibration round' },
      deadline: days(-10 + i * 7),
      status: i === 2 ? 'upcoming' : 'finalized',
      rules: competition.rules,
      resultRevision: i === 2 ? 0 : 1,
      lastMaterialChangeAt: days(-9 + i * 7),
      finalizedAt: i === 2 ? null : days(-9 + i * 7),
      issues: [],
    }),
  );
  for (const r of rounds) {
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
    if (r.status === 'finalized') {
      const payload = roundCalculationSchema.parse({
        gameweekId: r.id,
        revision: 1,
        rules: r.rules,
        calculationVersion: 'round-v1',
        fingerprint: 'b'.repeat(64),
        calculatedAt: r.finalizedAt,
        settled: true,
        issues: [],
        players: players.map((p) => ({
          footballerId: p.footballerId,
          position: p.position,
          minutes: 90,
          goals: 1,
          points: 7000,
          fixtures: [],
        })),
      });
      await db
        .insertInto('round_calculations')
        .values({
          gameweek_id: r.id,
          revision: 1,
          fingerprint: payload.fingerprint,
          payload,
        })
        .execute();
    }
  }
  const principal = {
      accountId: 'calibration-operator',
      sessionId: 'calibration-session',
      emailVerified: true,
      mfaVerifiedAt: new Date(),
      authenticatedAt: new Date(),
    },
    grants = [{ role: 'owner' as const, competitionId: null }];
  await grantProofStaff(db, principal.accountId, grants);
  const command = priceCalibrationCommandSchema.parse({
    commandId: randomUUID(),
    competitionId: competition.id,
    reason: 'Compare two pricing horizons on finalized evidence',
    candidates: [
      {
        label: 'one round',
        rules: { ...competition.rules.pricing, observedGameweeks: 1 },
      },
      { label: 'three rounds', rules: competition.rules.pricing },
    ],
  });
  await assert.rejects(
    createPriceCalibration(
      db,
      { ...principal, mfaVerifiedAt: new Date(0) },
      grants,
      command,
    ),
    AccessDenied,
  );
  const [saved, retry] = await Promise.all([
    createPriceCalibration(db, principal, grants, command),
    createPriceCalibration(db, principal, grants, command),
  ]);
  assert.deepEqual(saved, retry);
  const report = await readPriceCalibration(
    db,
    principal,
    grants,
    competition.id,
    saved.reportId,
  );
  assert.equal(report.output.results[0]?.batches.length, 2);
  assert.equal(report.output.results[1]?.batches[0]?.changes.length, 0);
  assert.deepEqual(
    (
      await db
        .selectFrom('competition_players')
        .select('data')
        .where('competition_id', '=', competition.id)
        .orderBy('footballer_id')
        .execute()
    ).map((p) => p.data),
    players,
  );
  assert.equal(
    (
      await db
        .selectFrom('price_batches')
        .select('id')
        .where('competition_id', '=', competition.id)
        .execute()
    ).length,
    0,
  );
  assert.equal(
    (
      await db
        .selectFrom('price_calibration_sources')
        .selectAll()
        .where('report_id', '=', saved.reportId)
        .execute()
    ).length,
    2,
  );
  await assert.rejects(
    db
      .deleteFrom('round_calculations')
      .where('gameweek_id', '=', rounds[0]?.id ?? '')
      .execute(),
    /foreign key/u,
  );
  await assert.rejects(
    readPriceCalibration(
      db,
      principal,
      [{ role: 'competition-manager', competitionId: template.id }],
      competition.id,
      saved.reportId,
    ),
    AccessDenied,
  );
  await assert.rejects(
    readPriceCalibration(db, principal, grants, template.id, saved.reportId),
    CommandRejected,
  );
  await assert.rejects(
    createPriceCalibration(db, principal, grants, {
      ...command,
      reason: 'Different purpose with reused command',
    }),
    (error: unknown) =>
      error instanceof CommandRejected && error.code === 'idempotency-conflict',
  );
  const first = rounds[0];
  assert.ok(first);
  await db
    .updateTable('gameweeks')
    .set({ data: { ...first, status: 'review' } })
    .where('id', '=', first.id)
    .execute();
  assert.deepEqual(
    await createPriceCalibration(db, principal, grants, command),
    saved,
  );
  await assert.rejects(
    createPriceCalibration(db, principal, grants, {
      ...command,
      commandId: randomUUID(),
    }),
    (error: unknown) =>
      error instanceof CommandRejected &&
      error.code === 'calibration-results-under-review',
  );
  assert.deepEqual(
    await readPriceCalibration(
      db,
      principal,
      grants,
      competition.id,
      saved.reportId,
    ),
    report,
  );
  await clearProofStaff(db);
  await assert.rejects(
    createPriceCalibration(db, principal, grants, command),
    AccessDenied,
  );
});
