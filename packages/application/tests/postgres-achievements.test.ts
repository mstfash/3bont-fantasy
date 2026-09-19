import { grantProofStaff, clearProofStaff } from './proof-staff.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import { achievementCommandSchema } from '@fantasy/contracts';
import { executeAchievementCommand } from '../src/achievement-commands.ts';
import { reconcileAchievements } from '../src/achievement-reconciliation.ts';
import { seedDemoReplay } from '../src/demo-replay.ts';
import { CommandRejected } from '../src/errors.ts';
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
  await grantProofStaff(db, actor.accountId, grants);
});
after(async () => {
  await clearProofStaff(db);
  await db.destroy();
});
const actor = {
    accountId: 'achievement-operator',
    sessionId: 'achievement-session',
    emailVerified: true,
    mfaVerifiedAt: new Date(),
    authenticatedAt: new Date(),
  },
  grants = [{ role: 'owner' as const, competitionId: null }];
void test('achievement versions, account attribution and correction reconciliation preserve earned history without changing squads', async () => {
  await seedDemoReplay(db);
  const competition = (
    await db
      .selectFrom('competitions')
      .select('data')
      .where('slug', '=', 'cairo-replay')
      .executeTakeFirstOrThrow()
  ).data;
  const rounds = await db
    .selectFrom('gameweeks')
    .select('data')
    .where('competition_id', '=', competition.id)
    .orderBy('number')
    .execute();
  const first = rounds[0]?.data,
    next = rounds.find((r) => r.data.status === 'upcoming')?.data;
  assert.ok(first && next);
  const entries = await db
    .selectFrom('entries')
    .select('data')
    .where('competition_id', '=', competition.id)
    .execute();
  const original = entries[0]?.data;
  assert.ok(original);
  const clone = {
    ...original,
    id: randomUUID(),
    activatedAt: new Date().toISOString(),
    firstGameweekId: next.id,
    editingGameweekId: next.id,
  };
  await db
    .insertInto('entries')
    .values({
      id: clone.id,
      competition_id: competition.id,
      account_id: clone.accountId,
      revision: clone.revision,
      data: clone,
    })
    .execute();
  const template = {
    competitionId: competition.id,
    name: { ar: 'بداية قوية', en: 'Strong start' },
    description: {
      ar: 'جولة نهائية بنقاط موجبة',
      en: 'A final positive-scoring round',
    },
    icon: 'star',
    scope: 'entry',
    condition: { kind: 'positive-round' },
    firstRound: 1,
    lastRound: 1,
    reason: 'Reviewed cosmetic achievement definition',
  };
  const created = await executeAchievementCommand(
    db,
    actor,
    grants,
    achievementCommandSchema.parse({
      ...template,
      kind: 'create',
      commandId: randomUUID(),
    }),
  );
  assert.ok(created.definitionId);
  const publish = {
    kind: 'publish' as const,
    commandId: randomUUID(),
    competitionId: competition.id,
    definitionId: created.definitionId,
    version: 1,
    expectedRevision: 1,
    allowHistorical: false,
    reason: 'Reviewed backfill against completed rehearsal',
  };
  await assert.rejects(
    executeAchievementCommand(db, actor, grants, publish),
    (e) =>
      e instanceof CommandRejected &&
      e.code === 'achievement-historical-confirmation-required',
  );
  const reviewed = { ...publish, allowHistorical: true };
  const published = await executeAchievementCommand(
    db,
    actor,
    grants,
    reviewed,
  );
  assert.ok(published.changed > 0);
  assert.deepEqual(
    await executeAchievementCommand(db, actor, grants, reviewed),
    published,
  );
  const initial = (
    await db
      .selectFrom('achievement_grants')
      .select('data')
      .where('definition_id', '=', created.definitionId)
      .execute()
  ).map((r) => r.data);
  assert.ok(initial.every((g) => g.entryId !== clone.id));
  assert.deepEqual(await reconcileAchievements(db, competition.id), {
    changed: 0,
    failed: [],
  });
  const before = (
    await db
      .selectFrom('entries')
      .select('data')
      .where('id', '=', original.id)
      .executeTakeFirstOrThrow()
  ).data;
  await db
    .updateTable('gameweeks')
    .set({ data: { ...first, status: 'review' } })
    .where('id', '=', first.id)
    .execute();
  const concurrent = await Promise.all([
    reconcileAchievements(db, competition.id),
    reconcileAchievements(db, competition.id),
  ]);
  assert.equal(
    concurrent.reduce((n, r) => n + r.changed, 0),
    initial.length,
  );
  const revoked = (
    await db
      .selectFrom('achievement_grants')
      .select('data')
      .where('definition_id', '=', created.definitionId)
      .execute()
  ).map((r) => r.data);
  assert.ok(revoked.every((g) => g.state === 'revoked' && g.revision === 2));
  await db
    .updateTable('gameweeks')
    .set({ data: first })
    .where('id', '=', first.id)
    .execute();
  assert.equal(
    (await reconcileAchievements(db, competition.id)).changed,
    initial.length,
  );
  const restored = (
    await db
      .selectFrom('achievement_grants')
      .select('data')
      .where('definition_id', '=', created.definitionId)
      .execute()
  ).map((r) => r.data);
  assert.deepEqual(
    new Set(restored.map((g) => g.id)),
    new Set(initial.map((g) => g.id)),
  );
  assert.ok(restored.every((g) => g.state === 'active' && g.revision === 3));
  assert.deepEqual(
    (
      await db
        .selectFrom('entries')
        .select('data')
        .where('id', '=', original.id)
        .executeTakeFirstOrThrow()
    ).data,
    before,
  );
  await assert.rejects(
    executeAchievementCommand(
      db,
      actor,
      grants,
      achievementCommandSchema.parse({
        ...template,
        kind: 'update',
        definitionId: created.definitionId,
        version: 1,
        expectedRevision: 2,
        commandId: randomUUID(),
      }),
    ),
    (e) =>
      e instanceof CommandRejected &&
      e.code === 'achievement-definition-frozen',
  );
  const revised = await executeAchievementCommand(
    db,
    actor,
    grants,
    achievementCommandSchema.parse({
      ...template,
      kind: 'revise',
      definitionId: created.definitionId,
      sourceVersion: 1,
      commandId: randomUUID(),
      firstRound: next.number,
      lastRound: 200,
    }),
  );
  assert.equal(revised.version, 2);
  await executeAchievementCommand(db, actor, grants, {
    ...publish,
    commandId: randomUUID(),
    version: 2,
    allowHistorical: false,
  });
  const old = (
    await db
      .selectFrom('achievement_definitions')
      .select('data')
      .where('id', '=', created.definitionId)
      .where('version', '=', 1)
      .executeTakeFirstOrThrow()
  ).data;
  assert.ok(old.activeUntilRound < next.number);
  const account = await executeAchievementCommand(
    db,
    actor,
    grants,
    achievementCommandSchema.parse({
      ...template,
      kind: 'create',
      commandId: randomUUID(),
      scope: 'account',
      condition: { kind: 'activated' },
      lastRound: 200,
    }),
  );
  assert.ok(account.definitionId);
  await executeAchievementCommand(db, actor, grants, {
    ...publish,
    commandId: randomUUID(),
    definitionId: account.definitionId,
    allowHistorical: true,
  });
  const accountGrants = await db
    .selectFrom('achievement_grants')
    .select('data')
    .where('definition_id', '=', account.definitionId)
    .execute();
  assert.equal(
    accountGrants.length,
    new Set(entries.map((e) => e.data.accountId)).size,
  );
  assert.ok(accountGrants.every((g) => g.data.entryId === null));
  const activated = await executeAchievementCommand(
    db,
    actor,
    grants,
    achievementCommandSchema.parse({
      ...template,
      kind: 'create',
      commandId: randomUUID(),
      condition: { kind: 'activated' },
      lastRound: 200,
    }),
  );
  assert.ok(activated.definitionId);
  await executeAchievementCommand(db, actor, grants, {
    ...publish,
    commandId: randomUUID(),
    definitionId: activated.definitionId,
    allowHistorical: true,
  });
  await assert.rejects(
    executeAchievementCommand(db, actor, grants, {
      kind: 'retire',
      commandId: randomUUID(),
      competitionId: competition.id,
      definitionId: activated.definitionId,
      version: 1,
      expectedRevision: 2,
      afterRound: next.number - 1,
      reason: 'Retirement must preserve earned future-entry badges',
    }),
    (e) =>
      e instanceof CommandRejected &&
      e.code === 'achievement-window-has-earned-grants',
  );
  await db
    .deleteFrom('achievement_grants')
    .where('entry_id', '=', clone.id)
    .execute();
  // The extra test entry must not contaminate later replay eligibility tests.
  await db.deleteFrom('entries').where('id', '=', clone.id).execute();
});
