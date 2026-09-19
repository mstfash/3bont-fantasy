import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import { groupCommandSchema } from '@fantasy/contracts';
import { seedDemoReplay } from '../src/demo-replay.ts';
import { executeGroupCommand } from '../src/group-commands.ts';
import { leagueGroupDetails, listLeagueGroups } from '../src/group-query.ts';
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
  db = createDatabase(pool);
before(async () => {
  await migrateApplication(pool);
});
after(async () => {
  await db.destroy();
});
void test('private group approval, revocable invites, ownership, entry caps and scoped standings hold under retries', async () => {
  await seedDemoReplay(db);
  const competition = (
    await db
      .selectFrom('competitions')
      .select('data')
      .where('slug', '=', 'cairo-replay')
      .executeTakeFirstOrThrow()
  ).data;
  const entries = (
    await db
      .selectFrom('entries')
      .select('data')
      .where('competition_id', '=', competition.id)
      .orderBy('id')
      .execute()
  ).map((e) => e.data);
  const [owner, member, outsider] = entries;
  assert.ok(owner && member && outsider);
  const principal = (accountId: string) => ({
    accountId,
    sessionId: 'group-proof',
    emailVerified: true,
    mfaVerifiedAt: null,
    authenticatedAt: new Date(),
  });
  const cmd = (input: object) =>
    groupCommandSchema.parse({
      competitionId: competition.id,
      commandId: randomUUID(),
      ...input,
    });
  const act = (accountId: string, input: object) =>
    executeGroupCommand(db, principal(accountId), cmd(input));
  const token = randomBytes(32).toString('hex');
  const create = cmd({
    kind: 'create',
    name: 'Private replay group',
    description: 'Synthetic integration proof',
    visibility: 'private',
    approvalRequired: true,
    entryLimit: 1,
    startGameweekId: null,
    entryId: owner.id,
    invitationToken: token,
  });
  const group = await executeGroupCommand(
    db,
    principal(owner.accountId),
    create,
  );
  assert.deepEqual(
    await executeGroupCommand(db, principal(owner.accountId), create),
    group,
  );
  await assert.rejects(
    leagueGroupDetails(db, group.groupId, null),
    AccessDenied,
  );
  assert.equal(
    (await listLeagueGroups(db, competition.id, outsider.accountId)).length,
    0,
  );
  await assert.rejects(
    act(member.accountId, {
      kind: 'join',
      groupId: group.groupId,
      entryId: member.id,
      invitationToken: randomBytes(32).toString('hex'),
    }),
    AccessDenied,
  );
  await assert.rejects(
    act(member.accountId, {
      kind: 'join',
      groupId: group.groupId,
      entryId: outsider.id,
      invitationToken: token,
    }),
    (e) =>
      e instanceof CommandRejected && e.code === 'active-owned-entry-required',
  );
  assert.equal(
    (
      await act(member.accountId, {
        kind: 'join',
        groupId: group.groupId,
        entryId: member.id,
        invitationToken: token,
      })
    ).membership,
    'pending',
  );
  await assert.rejects(
    leagueGroupDetails(db, group.groupId, member.accountId),
    AccessDenied,
  );
  await assert.rejects(
    act(outsider.accountId, {
      kind: 'review-member',
      groupId: group.groupId,
      entryId: member.id,
      expectedStatus: 'pending',
      decision: 'approve',
      reason: 'Attempt unauthorized approval',
    }),
    AccessDenied,
  );
  await act(owner.accountId, {
    kind: 'review-member',
    groupId: group.groupId,
    entryId: member.id,
    expectedStatus: 'pending',
    decision: 'approve',
    reason: 'Reviewed membership request',
  });
  const details = await leagueGroupDetails(db, group.groupId, member.accountId);
  assert.equal(details.standings.length, 2);
  assert.ok(
    details.standings.every((e) => e.scoredGameweeks === 3 && e.points > 0),
    'pre-join finalized points are included',
  );
  assert.equal(
    details.members.length,
    0,
    'organizer controls never leak to a member',
  );
  assert.equal('accountId' in (details.standings[0] ?? {}), false);
  const duplicate = {
    ...member,
    id: randomUUID(),
    name: 'Second squad',
    activatedAt: new Date().toISOString(),
    firstGameweekId: member.editingGameweekId,
  };
  await db
    .insertInto('entries')
    .values({
      id: duplicate.id,
      competition_id: competition.id,
      account_id: member.accountId,
      revision: duplicate.revision,
      data: duplicate,
    })
    .execute();
  await assert.rejects(
    act(member.accountId, {
      kind: 'join',
      groupId: group.groupId,
      entryId: duplicate.id,
      invitationToken: token,
    }),
    (e) => e instanceof CommandRejected && e.code === 'group-entry-limit',
  );
  await act(owner.accountId, {
    kind: 'rotate-invitation',
    groupId: group.groupId,
    expectedRevision: 1,
    invitationToken: randomBytes(32).toString('hex'),
  });
  await act(member.accountId, {
    kind: 'leave',
    groupId: group.groupId,
    entryId: member.id,
  });
  await assert.rejects(
    leagueGroupDetails(db, group.groupId, member.accountId),
    AccessDenied,
  );
  await assert.rejects(
    act(member.accountId, {
      kind: 'join',
      groupId: group.groupId,
      entryId: member.id,
      invitationToken: token,
    }),
    AccessDenied,
  );
  const future = await db
    .selectFrom('gameweeks')
    .select('id')
    .where('competition_id', '=', competition.id)
    .where('number', '=', 4)
    .executeTakeFirstOrThrow();
  const futureGroup = await act(owner.accountId, {
    ...create,
    commandId: randomUUID(),
    name: 'Future interval',
    visibility: 'public',
    startGameweekId: future.id,
  });
  const futureDetails = await leagueGroupDetails(db, futureGroup.groupId, null);
  assert.equal(futureDetails.standings[0]?.points, 0);
  assert.equal(futureDetails.standings[0].scoredGameweeks, 0);
});
