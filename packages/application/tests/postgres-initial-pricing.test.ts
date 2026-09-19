import { grantProofStaff, clearProofStaff } from './proof-staff.ts';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  competitionSchema,
  initialPriceSourceText,
  setupCommandSchema,
} from '@fantasy/contracts';
import { seedDemo } from '../src/demo.ts';
import { executeSetupCommand } from '../src/competition-setup.ts';
import { CommandRejected } from '../src/errors.ts';
const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use disposable integration runner');
const pool = new Pool({ connectionString, max: 4 }),
  db = createDatabase(pool);
before(async () => {
  await migrateApplication(pool);
});
after(async () => {
  await clearProofStaff(db);
  await db.destroy();
});
void test('starting-price publication binds recent source evidence, retains manual changes and never enables automatic pricing', async () => {
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
    slug: `initial-price-${randomUUID()}`,
    status: 'draft' as const,
    firstLockedAt: null,
    revision: 1,
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
  const footballers = (
    await db
      .selectFrom('footballers')
      .select('data')
      .where('season_id', '=', competition.seasonId)
      .orderBy('id')
      .limit(2)
      .execute()
  ).map((r) => r.data);
  assert.equal(footballers.length, 2);
  const actor = {
      accountId: randomUUID(),
      sessionId: randomUUID(),
      emailVerified: true,
      mfaVerifiedAt: new Date(),
      authenticatedAt: new Date(),
    },
    grants = [
      { role: 'competition-manager' as const, competitionId: competition.id },
    ];
  await grantProofStaff(db, actor.accountId, grants);
  const bounds = {
    minimum: competition.rules.pricing.minimum,
    maximum: competition.rules.pricing.maximum,
  };
  const command = setupCommandSchema.parse({
    kind: 'pool',
    commandId: randomUUID(),
    competitionId: competition.id,
    expectedRevision: 1,
    reason:
      'Reviewed initial valuation suggestions with explicit manual prices',
    players: footballers.map((p) => ({
      footballerId: p.id,
      position: p.defaultPosition,
      price: 65,
      selectable: true,
      manuallyPinned: true,
    })),
    initialPriceReview: {
      policy: {
        currency: 'EUR',
        staleDays: 90,
        bounds: { GK: bounds, DEF: bounds, MID: bounds, FWD: bounds },
      },
      positions: footballers.map((p) => ({
        footballerId: p.id,
        position: p.defaultPosition,
      })),
      asOf: new Date().toISOString(),
      sourceFingerprint: createHash('sha256')
        .update(initialPriceSourceText(footballers))
        .digest('hex'),
    },
  });
  assert.ok(command.kind === 'pool' && command.initialPriceReview);
  const review = command.initialPriceReview;
  const reject = (code: string) => (error: unknown) =>
    error instanceof CommandRejected && error.code === code;
  await assert.rejects(
    executeSetupCommand(db, actor, grants, {
      ...command,
      initialPriceReview: { ...review, sourceFingerprint: '0'.repeat(64) },
    }),
    reject('initial-price-source-changed'),
  );
  await assert.rejects(
    executeSetupCommand(db, actor, grants, {
      ...command,
      initialPriceReview: {
        ...review,
        asOf: new Date(Date.now() - 16 * 60_000).toISOString(),
      },
    }),
    reject('initial-price-review-expired'),
  );
  await assert.rejects(
    executeSetupCommand(db, actor, grants, {
      ...command,
      initialPriceReview: { ...review, positions: [] },
    }),
  );
  const result = await executeSetupCommand(db, actor, grants, command);
  assert.equal(result.rules.pricing.automaticUpdates, false);
  assert.equal(result.revision, 2);
  assert.deepEqual(
    await executeSetupCommand(db, actor, grants, command),
    result,
  );
  const audit = await db
    .selectFrom('audit_events')
    .select('payload')
    .where('scope_id', '=', competition.id)
    .executeTakeFirstOrThrow();
  assert.ok(
    z
      .object({
        initialPriceEvidence: z.object({
          calculationVersion: z.literal('valuation-midrank-v1'),
        }),
      })
      .parse(audit.payload).initialPriceEvidence,
  );
  const serialized = JSON.stringify(audit.payload);
  assert.ok(serialized.includes(review.sourceFingerprint));
  assert.ok(serialized.includes('valuation-midrank-v1'));
  assert.ok(serialized.includes('publishedPrice'));
  assert.ok(serialized.includes('manualAdjustment'));
  const prices = await db
    .selectFrom('competition_players')
    .select('data')
    .where('competition_id', '=', competition.id)
    .execute();
  assert.ok(prices.every((p) => p.data.price === 65 && p.data.manuallyPinned));
  await db
    .updateTable('competitions')
    .set({ data: { ...result, status: 'published' } })
    .where('id', '=', competition.id)
    .execute();
  await assert.rejects(
    executeSetupCommand(db, actor, grants, {
      ...command,
      commandId: randomUUID(),
      expectedRevision: 2,
    }),
    reject('initial-prices-draft-only'),
  );
});
