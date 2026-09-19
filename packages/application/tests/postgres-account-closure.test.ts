import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  entrySchema,
  groupCommandSchema,
  prizePoolSchema,
  prizeProposalSchema,
  prizeCorrectionCaseSchema,
} from '@fantasy/contracts';
import { createIdentity, migrateIdentity } from '../src/identity.ts';
import { seedDemoReplay } from '../src/demo-replay.ts';
import { executeGroupCommand } from '../src/group-commands.ts';
import { executeEntryLifecycle } from '../src/entry-lifecycle.ts';
import { executeProfileCommand } from '../src/profile.ts';
import { requestAccountExport } from '../src/account-exports.ts';
import { executeAccountClosure } from '../src/account-closure.ts';
import { readAccountClosurePreview } from '../src/account-closure-preview.ts';
import { calculatePrizePreview } from '../src/prize-preview.ts';
import { readPublicPrizePool } from '../src/prize-query.ts';
import { AccessDenied } from '../src/authorization.ts';
import { CommandRejected } from '../src/errors.ts';
const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use disposable integration runner');
const pool = new Pool({ connectionString, max: 5 }),
  db = createDatabase(pool),
  owner = `closure-${randomUUID()}`,
  entryIds: string[] = [],
  groupIds: string[] = [],
  poolIds: string[] = [];
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
  try {
    await db
      .deleteFrom('account_exports')
      .where('account_id', '=', owner)
      .execute();
    await db
      .deleteFrom('prize_correction_cases')
      .where('pool_id', 'in', poolIds)
      .execute();
    await db
      .deleteFrom('prize_proposals')
      .where('pool_id', 'in', poolIds)
      .execute();
    await db.deleteFrom('prize_pools').where('id', 'in', poolIds).execute();
    await db
      .deleteFrom('chat_reports')
      .where('author_id', '=', owner)
      .execute();
    await db
      .deleteFrom('chat_messages')
      .where('account_id', '=', owner)
      .execute();
    await db
      .deleteFrom('group_membership_history')
      .where('group_id', 'in', groupIds)
      .execute();
    await db
      .deleteFrom('group_memberships')
      .where('group_id', 'in', groupIds)
      .execute();
    await db.deleteFrom('league_groups').where('id', 'in', groupIds).execute();
    await db
      .deleteFrom('entry_results')
      .where('entry_id', 'in', entryIds)
      .execute();
    await db
      .deleteFrom('entry_snapshots')
      .where('entry_id', 'in', entryIds)
      .execute();
    await db
      .deleteFrom('entry_retirements')
      .where('entry_id', 'in', entryIds)
      .execute();
    await db.deleteFrom('entries').where('id', 'in', entryIds).execute();
    await db
      .deleteFrom('staff_grants')
      .where('account_id', '=', owner)
      .execute();
    await db.deleteFrom('commands').where('actor_id', '=', owner).execute();
    await db.deleteFrom('audit_events').where('actor_id', '=', owner).execute();
    await pool.query('DELETE FROM "session" WHERE "userId"=$1', [owner]);
    await pool.query('DELETE FROM "user" WHERE id=$1', [owner]);
    await db.deleteFrom('accounts').where('id', '=', owner).execute();
  } finally {
    await db.destroy();
  }
});
void test('closure reviews obligations, rejects stale and old authentication, purges access and public names while preserving history and historical prize eligibility', async () => {
  const competitionId = await seedDemoReplay(db);
  const template = (
    await db
      .selectFrom('entries')
      .select('data')
      .where('competition_id', '=', competitionId)
      .orderBy('id')
      .executeTakeFirstOrThrow()
  ).data;
  const principal = {
    accountId: owner,
    sessionId: 'closure-session',
    emailVerified: true,
    mfaVerifiedAt: null,
    authenticatedAt: new Date(),
  };
  await db
    .insertInto('accounts')
    .values({
      id: owner,
      display_name: 'Private former name',
      suspended_until: null,
    })
    .execute();
  await pool.query(
    'INSERT INTO "user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())',
    [owner, 'Private former name', `${owner}@example.test`],
  );
  await pool.query(
    'INSERT INTO "session"(id,token,"userId","expiresAt","createdAt","updatedAt") VALUES($1,$2,$3,now()+interval \'1 day\',now(),now())',
    ['closure-session', randomBytes(32).toString('hex'), owner],
  );
  const entry = entrySchema.parse({
    ...template,
    id: randomUUID(),
    accountId: owner,
    name: 'Private former squad',
  });
  entryIds.push(entry.id);
  await db
    .insertInto('entries')
    .values({
      id: entry.id,
      competition_id: competitionId,
      account_id: owner,
      revision: entry.revision,
      data: entry,
    })
    .execute();
  const snapshots = await db
    .selectFrom('entry_snapshots')
    .selectAll()
    .where('entry_id', '=', template.id)
    .execute();
  for (const s of snapshots)
    await db
      .insertInto('entry_snapshots')
      .values({ ...s, entry_id: entry.id })
      .execute();
  const results = await db
    .selectFrom('entry_results')
    .selectAll()
    .where('entry_id', '=', template.id)
    .execute();
  for (const r of results)
    await db
      .insertInto('entry_results')
      .values({ ...r, entry_id: entry.id })
      .execute();
  const group = await executeGroupCommand(
    db,
    principal,
    groupCommandSchema.parse({
      kind: 'create',
      commandId: randomUUID(),
      competitionId,
      name: 'Closure group',
      description: 'Synthetic closure fixture',
      visibility: 'public',
      approvalRequired: false,
      entryLimit: 1,
      startGameweekId: null,
      entryId: entry.id,
      invitationToken: randomBytes(32).toString('hex'),
    }),
  );
  groupIds.push(group.groupId);
  const messageId = randomUUID();
  await db
    .insertInto('chat_messages')
    .values({
      id: messageId,
      group_id: group.groupId,
      account_id: owner,
      body: 'Private ordinary message',
      removed_at: null,
    })
    .execute();
  await db
    .insertInto('chat_reports')
    .values({
      id: randomUUID(),
      group_id: group.groupId,
      message_id: messageId,
      reporter_id: template.accountId,
      author_id: owner,
      body: 'Restricted retained evidence',
      reason: 'Synthetic review',
      created_at: new Date(),
      expires_at: new Date(Date.now() + 180 * 86400000),
      state: 'open',
      resolved_by: null,
      resolution: null,
      resolved_at: null,
    })
    .execute();
  const initial = await readAccountClosurePreview(db, principal);
  assert.equal(initial.canClose, false);
  assert.equal(initial.groups.length, 1);
  const command = (fingerprint: string) => ({
    commandId: randomUUID(),
    expectedFingerprint: fingerprint,
    confirmation: 'CLOSE' as const,
  });
  await assert.rejects(
    executeAccountClosure(db, principal, command(initial.fingerprint)),
    (e) => e instanceof CommandRejected && e.code === 'closure-blocked',
  );
  const g = (
    await db
      .selectFrom('league_groups')
      .select('data')
      .where('id', '=', group.groupId)
      .executeTakeFirstOrThrow()
  ).data;
  await db
    .updateTable('league_groups')
    .set({
      organizer_id: template.accountId,
      data: { ...g, organizerId: template.accountId },
    })
    .where('id', '=', g.id)
    .execute();
  await executeEntryLifecycle(db, principal, {
    kind: 'retire',
    commandId: randomUUID(),
    competitionId,
    entryId: entry.id,
    expectedRevision: entry.revision,
  });
  await db
    .insertInto('staff_grants')
    .values({
      id: randomUUID(),
      account_id: owner,
      role: 'support-viewer',
      competition_id: null,
      granted_by: 'fixture',
    })
    .execute();
  assert.equal(
    (await readAccountClosurePreview(db, principal)).staffRoles.length,
    1,
  );
  await db.deleteFrom('staff_grants').where('account_id', '=', owner).execute();
  const rounds = await db
    .selectFrom('gameweeks')
    .select('data')
    .where('competition_id', '=', competitionId)
    .orderBy('number')
    .execute();
  const finalizedRounds = rounds.filter((r) => r.data.status === 'finalized');
  const first = finalizedRounds[0],
    last = finalizedRounds.at(-1);
  assert.ok(first && last);
  const prize = prizePoolSchema.parse({
    id: randomUUID(),
    competitionId,
    revision: 1,
    name: { ar: 'جائزة الاختبار', en: 'Closure prize' },
    description: { ar: 'اختبار', en: 'Synthetic proof' },
    firstGameweekId: first.data.id,
    lastGameweekId: last.data.id,
    groupId: null,
    eligibilityCutoff: new Date().toISOString(),
    currency: 'EGP',
    places: [{ kind: 'cash', amountMinor: 100 }],
    oneAwardPerAccount: true,
    state: 'published',
    synthetic: true,
    gameweekIds: finalizedRounds.map((r) => r.data.id),
    publishedAt: new Date().toISOString(),
    evidenceReference: 'Synthetic local proof',
    ranking: 'shared',
  });
  poolIds.push(prize.id);
  await db
    .insertInto('prize_pools')
    .values({
      id: prize.id,
      competition_id: competitionId,
      group_id: null,
      revision: 1,
      data: prize,
    })
    .execute();
  const calculated = await db
    .transaction()
    .execute((tx) => calculatePrizePreview(tx, prize));
  assert.equal(
    calculated.candidates.find((c) => c.accountId === owner)?.eligible,
    true,
  );
  const proposal = prizeProposalSchema.parse({
    id: randomUUID(),
    poolId: prize.id,
    competitionId,
    revision: 1,
    preview: {
      ...calculated,
      awards: [
        {
          entryId: entry.id,
          accountId: owner,
          entryName: entry.name,
          rank: 1,
          reward: { kind: 'cash', amountMinor: 100 },
        },
      ],
    },
    state: 'prepared',
    preparedBy: 'fixture',
    preparedAt: new Date().toISOString(),
    reviewedBy: null,
    reviewedAt: null,
    approvedBy: null,
    approvedAt: null,
    fulfilledBy: null,
    fulfilledAt: null,
    fulfillmentReference: null,
  });
  await db
    .insertInto('prize_proposals')
    .values({
      id: proposal.id,
      pool_id: prize.id,
      competition_id: competitionId,
      revision: 1,
      data: proposal,
    })
    .execute();
  assert.equal(
    (await readAccountClosurePreview(db, principal)).awards[0]?.state,
    'unfulfilled',
  );
  const fulfilled = {
    ...proposal,
    state: 'fulfilled' as const,
    fulfilledBy: 'fixture',
    fulfilledAt: new Date().toISOString(),
    fulfillmentReference: 'Synthetic no-payment receipt',
  };
  await db
    .updateTable('prize_proposals')
    .set({ data: fulfilled })
    .where('id', '=', proposal.id)
    .execute();
  const correction = prizeCorrectionCaseSchema.parse({
    id: randomUUID(),
    competitionId,
    poolId: prize.id,
    proposalId: proposal.id,
    revision: 1,
    state: 'open',
    openedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    observation: {
      fingerprint: calculated.fingerprint,
      preview: calculated,
      hold: null,
    },
    resolution: null,
  });
  await db
    .insertInto('prize_correction_cases')
    .values({
      id: correction.id,
      competition_id: competitionId,
      pool_id: prize.id,
      proposal_id: proposal.id,
      revision: 1,
      data: correction,
    })
    .execute();
  assert.equal(
    (await readAccountClosurePreview(db, principal)).awards[0]?.state,
    'correction-open',
  );
  await db
    .deleteFrom('prize_correction_cases')
    .where('id', '=', correction.id)
    .execute();
  await requestAccountExport(db, principal, {
    commandId: randomUUID(),
    scope: { competitionId: null, historyFrom: null, historyUntil: null },
  });
  const ready = await readAccountClosurePreview(db, principal);
  assert.equal(ready.canClose, true);
  assert.equal(ready.archiveCount, 1);
  await assert.rejects(
    executeAccountClosure(
      db,
      { ...principal, authenticatedAt: new Date(Date.now() - 16 * 60000) },
      command(ready.fingerprint),
    ),
    (e) =>
      e instanceof CommandRejected &&
      e.code === 'closure-fresh-sign-in-required',
  );
  await executeProfileCommand(db, principal, {
    commandId: randomUUID(),
    expectedDisplayName: 'Private former name',
    displayName: 'New private name',
  });
  await assert.rejects(
    executeAccountClosure(db, principal, command(ready.fingerprint)),
    (e) => e instanceof CommandRejected && e.code === 'closure-review-changed',
  );
  const reviewed = await readAccountClosurePreview(db, principal),
    close = command(reviewed.fingerprint);
  const outcomes = await Promise.allSettled([
    executeAccountClosure(db, principal, close),
    executeAccountClosure(db, principal, close),
  ]);
  assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, 1);
  assert.equal(
    (await pool.query('SELECT id FROM "user" WHERE id=$1', [owner])).rowCount,
    0,
  );
  assert.equal(
    (await pool.query('SELECT id FROM "session" WHERE "userId"=$1', [owner]))
      .rowCount,
    0,
  );
  assert.equal(
    (
      await db
        .selectFrom('account_exports')
        .select('id')
        .where('account_id', '=', owner)
        .execute()
    ).length,
    0,
  );
  const stored = await db
    .selectFrom('entries')
    .select('data')
    .where('id', '=', entry.id)
    .executeTakeFirstOrThrow();
  assert.match(stored.data.name, /Closed squad/u);
  assert.equal(stored.data.status, 'retired');
  assert.deepEqual(
    (
      await db
        .selectFrom('entry_snapshots')
        .selectAll()
        .where('entry_id', '=', entry.id)
        .execute()
    ).map((s) => s.payload),
    snapshots.map((s) => s.payload),
  );
  assert.equal(
    (
      await db
        .selectFrom('entry_results')
        .select('entry_id')
        .where('entry_id', '=', entry.id)
        .execute()
    ).length,
    results.length,
  );
  assert.equal(
    (
      await db
        .selectFrom('chat_messages')
        .select('body')
        .where('id', '=', messageId)
        .executeTakeFirstOrThrow()
    ).body,
    '',
  );
  assert.equal(
    (
      await db
        .selectFrom('chat_reports')
        .select('body')
        .where('message_id', '=', messageId)
        .executeTakeFirstOrThrow()
    ).body,
    'Restricted retained evidence',
  );
  const after = await db
    .transaction()
    .execute((tx) => calculatePrizePreview(tx, prize));
  assert.equal(
    after.candidates.find((c) => c.accountId === owner)?.eligible,
    true,
  );
  assert.equal(
    (await readPublicPrizePool(db, prize.id, null)).awards[0]?.entryName,
    stored.data.name,
  );
  assert.equal(
    (
      await db
        .selectFrom('prize_proposals')
        .select('data')
        .where('id', '=', proposal.id)
        .executeTakeFirstOrThrow()
    ).data.fulfillmentReference,
    fulfilled.fulfillmentReference,
  );
  await assert.rejects(readAccountClosurePreview(db, principal), AccessDenied);
  await assert.rejects(
    executeProfileCommand(db, principal, {
      commandId: randomUUID(),
      expectedDisplayName: 'New private name',
      displayName: 'Restore attempt',
    }),
    AccessDenied,
  );
});
