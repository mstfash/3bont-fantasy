import { grantProofStaff, clearProofStaff } from './proof-staff.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  competitionSchema,
  gameweekSchema,
  roundCalculationSchema,
} from '@fantasy/contracts';
import { seedDemo } from '../src/demo.ts';
import {
  executePriceBatchCommand,
  previewCompetitionPrices,
} from '../src/pricing.ts';
import { CommandRejected } from '../src/errors.ts';

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
void test('price batches consume each round once, preserve pins, bind previews and freeze before deadlines', async () => {
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
    slug: 'pricing-proof',
    status: 'running' as const,
    firstLockedAt: new Date(Date.now() - 10 * 86400_000).toISOString(),
  };
  await db
    .insertInto('competitions')
    .values({
      id: competition.id,
      season_id: competition.seasonId,
      slug: competition.slug,
      revision: 1,
      data: competition,
    })
    .execute();
  const originals = await db
    .selectFrom('competition_players')
    .select('data')
    .where('competition_id', '=', template.id)
    .orderBy('footballer_id')
    .execute();
  const players = originals.map((r, i) => ({
    ...r.data,
    competitionId: competition.id,
    manuallyPinned: i === 0,
  }));
  for (const p of players)
    await db
      .insertInto('competition_players')
      .values({
        competition_id: competition.id,
        footballer_id: p.footballerId,
        data: p,
      })
      .execute();
  const rounds = Array.from({ length: 4 }, (_, i) =>
    gameweekSchema.parse({
      id: randomUUID(),
      competitionId: competition.id,
      number: i + 1,
      name: { ar: 'جولة أسعار', en: 'Pricing round' },
      deadline: new Date(
        Date.now() + (i === 3 ? 3 : i - 4) * 86400_000,
      ).toISOString(),
      status: i === 3 ? 'upcoming' : 'finalized',
      rules: competition.rules,
      resultRevision: i === 3 ? 0 : 1,
      lastMaterialChangeAt: new Date(Date.now() - 86400_000).toISOString(),
      finalizedAt: i === 3 ? null : new Date().toISOString(),
      issues: [],
    }),
  );
  for (const round of rounds) {
    await db
      .insertInto('gameweeks')
      .values({
        id: round.id,
        competition_id: competition.id,
        number: round.number,
        deadline: round.deadline,
        data: round,
      })
      .execute();
    if (round.status === 'finalized') {
      const payload = roundCalculationSchema.parse({
        gameweekId: round.id,
        revision: 1,
        rules: round.rules,
        calculationVersion: 'round-v1',
        fingerprint: 'a'.repeat(64),
        calculatedAt: new Date().toISOString(),
        settled: true,
        issues: [],
        players: players.map((p) => ({
          footballerId: p.footballerId,
          position: p.position,
          minutes: 90,
          goals: 0,
          points: 7000,
          fixtures: [],
        })),
      });
      await db
        .insertInto('round_calculations')
        .values({
          gameweek_id: round.id,
          revision: 1,
          fingerprint: payload.fingerprint,
          payload,
        })
        .execute();
    }
  }
  const principal = {
    accountId: 'pricing-operator',
    sessionId: 'pricing-session',
    emailVerified: true,
    mfaVerifiedAt: new Date(),
    authenticatedAt: new Date(),
  };
  const grants = [{ role: 'owner' as const, competitionId: null }];
  await grantProofStaff(db, principal.accountId, grants);
  const preview = await previewCompetitionPrices(
    db,
    principal,
    grants,
    competition.id,
  );
  assert.equal(preview.blocked, null);
  assert.equal(preview.sourceGameweekIds.length, 3);
  assert.equal(
    preview.changes.filter((p) => p.newPrice !== p.oldPrice).length,
    players.length - 1,
  );
  const command = {
    commandId: randomUUID(),
    competitionId: competition.id,
    expectedFingerprint: preview.fingerprint,
    reason: 'Reviewed three finalized rounds and bounded price impact',
  };
  await assert.rejects(
    executePriceBatchCommand(db, principal, grants, {
      ...command,
      expectedFingerprint: '0'.repeat(64),
    }),
    (e: unknown) =>
      e instanceof CommandRejected && e.code === 'price-preview-changed',
  );
  const [one, retry] = await Promise.all([
    executePriceBatchCommand(db, principal, grants, command),
    executePriceBatchCommand(db, principal, grants, command),
  ]);
  assert.equal(one.fingerprint, retry.fingerprint);
  assert.equal(
    (
      await db
        .selectFrom('price_batches')
        .select('id')
        .where('competition_id', '=', competition.id)
        .execute()
    ).length,
    1,
  );
  assert.equal(
    (
      await db
        .selectFrom('price_batch_sources')
        .select('gameweek_id')
        .where('competition_id', '=', competition.id)
        .execute()
    ).length,
    3,
  );
  const newPlayers = await db
    .selectFrom('competition_players')
    .select('data')
    .where('competition_id', '=', competition.id)
    .execute();
  for (const p of players) {
    const current = newPlayers.find(
      (r) => r.data.footballerId === p.footballerId,
    )?.data;
    assert.ok(current);
    assert.equal(current.price, p.price + (p.manuallyPinned ? 0 : 1));
  }
  assert.equal(
    (await previewCompetitionPrices(db, principal, grants, competition.id))
      .blocked,
    'already-published-for-round',
  );
  const source = rounds[0];
  const target = rounds[3];
  assert.ok(source && target);
  await db
    .updateTable('gameweeks')
    .set({ data: { ...source, status: 'review' } })
    .where('id', '=', source.id)
    .execute();
  assert.equal(
    (await previewCompetitionPrices(db, principal, grants, competition.id))
      .blocked,
    'results-under-review',
  );
  await db
    .updateTable('gameweeks')
    .set({ data: source })
    .where('id', '=', source.id)
    .execute();
  // A different future editing window still obeys its freeze interval.
  const elapsed = new Date(Date.now() - 1000).toISOString();
  await db
    .updateTable('gameweeks')
    .set({
      deadline: elapsed,
      data: { ...target, status: 'locked', deadline: elapsed },
    })
    .where('id', '=', target.id)
    .execute();
  const next = {
    ...target,
    id: randomUUID(),
    number: 5,
    deadline: new Date(Date.now() + 6 * 3600_000).toISOString(),
  };
  await db
    .insertInto('gameweeks')
    .values({
      id: next.id,
      competition_id: competition.id,
      number: 5,
      deadline: next.deadline,
      data: next,
    })
    .execute();
  assert.equal(
    (await previewCompetitionPrices(db, principal, grants, competition.id))
      .blocked,
    'freeze-window',
  );
});
