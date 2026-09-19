import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  groupCommandSchema,
  groupHandoverCommandSchema,
} from '@fantasy/contracts';
import { seedDemoReplay } from '../src/demo-replay.ts';
import { executeGroupCommand } from '../src/group-commands.ts';
import { executeGroupHandover } from '../src/group-handover.ts';
import { leagueGroupDetails } from '../src/group-query.ts';
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
  groups: string[] = [];
before(async () => {
  await migrateApplication(pool);
});
after(async () => {
  try {
    await db
      .deleteFrom('group_membership_history')
      .where('group_id', 'in', groups)
      .execute();
    await db
      .deleteFrom('group_memberships')
      .where('group_id', 'in', groups)
      .execute();
    await db.deleteFrom('league_groups').where('id', 'in', groups).execute();
  } finally {
    await db.destroy();
  }
});
void test('ownership offers require current membership and consent, expire, preserve history and serialize with organizer limits', async () => {
  const competitionId = await seedDemoReplay(db);
  const [owner, member, outsider] = (
    await db
      .selectFrom('entries')
      .select('data')
      .where('competition_id', '=', competitionId)
      .orderBy('id')
      .execute()
  ).map((e) => e.data);
  assert.ok(owner && member && outsider);
  const principal = (accountId: string) => ({
    accountId,
    sessionId: 'handover-proof',
    emailVerified: true,
    mfaVerifiedAt: null,
    authenticatedAt: new Date(),
  });
  const group = await executeGroupCommand(
    db,
    principal(owner.accountId),
    groupCommandSchema.parse({
      kind: 'create',
      commandId: randomUUID(),
      competitionId,
      name: 'Handover proof',
      description: 'Synthetic ownership proof',
      visibility: 'public',
      approvalRequired: false,
      entryLimit: 1,
      startGameweekId: null,
      entryId: owner.id,
      invitationToken: randomBytes(32).toString('hex'),
    }),
  );
  groups.push(group.groupId);
  await executeGroupCommand(
    db,
    principal(member.accountId),
    groupCommandSchema.parse({
      kind: 'join',
      commandId: randomUUID(),
      competitionId,
      groupId: group.groupId,
      entryId: member.id,
      invitationToken: null,
    }),
  );
  const command = (input: object) =>
    groupHandoverCommandSchema.parse({
      commandId: randomUUID(),
      competitionId,
      groupId: group.groupId,
      expectedRevision: 1,
      ...input,
    });
  const act = (id: string, input: object) =>
    executeGroupHandover(db, principal(id), command(input));
  const rejected = (code: string) => (error: unknown) =>
    error instanceof CommandRejected && error.code === code;
  await assert.rejects(
    act(member.accountId, { kind: 'offer', recipientEntryId: owner.id }),
    AccessDenied,
  );
  await assert.rejects(
    act(owner.accountId, { kind: 'offer', recipientEntryId: outsider.id }),
    rejected('handover-recipient-unavailable'),
  );
  const first = await act(owner.accountId, {
    kind: 'offer',
    recipientEntryId: member.id,
  });
  assert.ok(first.offerId);
  assert.equal(
    (await leagueGroupDetails(db, group.groupId, outsider.accountId)).handover,
    null,
  );
  assert.equal(
    (await leagueGroupDetails(db, group.groupId, member.accountId)).handover
      ?.id,
    first.offerId,
  );
  await assert.rejects(
    act(outsider.accountId, { kind: 'accept', offerId: first.offerId }),
    AccessDenied,
  );
  const second = await act(owner.accountId, {
    kind: 'offer',
    recipientEntryId: member.id,
  });
  assert.ok(second.offerId);
  await assert.rejects(
    act(member.accountId, { kind: 'accept', offerId: first.offerId }),
    rejected('handover-changed'),
  );
  await db
    .updateTable('group_handovers')
    .set({
      created_at: new Date(Date.now() - 8 * 86400000),
      expires_at: new Date(Date.now() - 1000),
    })
    .where('group_id', '=', group.groupId)
    .execute();
  await assert.rejects(
    act(member.accountId, { kind: 'accept', offerId: second.offerId }),
    rejected('handover-expired-or-changed'),
  );
  assert.equal(
    (await leagueGroupDetails(db, group.groupId, member.accountId)).handover,
    null,
  );
  await act(owner.accountId, { kind: 'cancel', offerId: second.offerId });
  const third = await act(owner.accountId, {
    kind: 'offer',
    recipientEntryId: member.id,
  });
  assert.ok(third.offerId);
  await db
    .updateTable('group_memberships')
    .set({ status: 'left' })
    .where('group_id', '=', group.groupId)
    .where('entry_id', '=', member.id)
    .execute();
  await assert.rejects(
    act(member.accountId, { kind: 'accept', offerId: third.offerId }),
    rejected('handover-recipient-unavailable'),
  );
  await db
    .updateTable('group_memberships')
    .set({ status: 'active' })
    .where('group_id', '=', group.groupId)
    .where('entry_id', '=', member.id)
    .execute();
  const source = await db
    .selectFrom('league_groups')
    .selectAll()
    .where('id', '=', group.groupId)
    .executeTakeFirstOrThrow();
  const capGroups: string[] = [];
  for (let i = 0; i < 20; i++) {
    const id = randomUUID();
    groups.push(id);
    capGroups.push(id);
    await db
      .insertInto('league_groups')
      .values({
        ...source,
        id,
        organizer_id: member.accountId,
        data: { ...source.data, id, organizerId: member.accountId },
      })
      .execute();
  }
  await assert.rejects(
    act(member.accountId, { kind: 'accept', offerId: third.offerId }),
    rejected('organizer-group-limit'),
  );
  await db.deleteFrom('league_groups').where('id', 'in', capGroups).execute();
  const accept = command({ kind: 'accept', offerId: third.offerId });
  const [accepted, retry] = await Promise.all([
    executeGroupHandover(db, principal(member.accountId), accept),
    executeGroupHandover(db, principal(member.accountId), accept),
  ]);
  assert.deepEqual(accepted, retry);
  assert.equal(accepted.organizerId, member.accountId);
  assert.equal(accepted.revision, 2);
  const updated = await db
    .selectFrom('league_groups')
    .selectAll()
    .where('id', '=', group.groupId)
    .executeTakeFirstOrThrow();
  assert.notEqual(updated.invitation_hash, source.invitation_hash);
  assert.equal(
    (
      await db
        .selectFrom('group_memberships')
        .select('entry_id')
        .where('group_id', '=', group.groupId)
        .where('status', '=', 'active')
        .execute()
    ).length,
    2,
  );
  await assert.rejects(
    act(owner.accountId, {
      kind: 'offer',
      recipientEntryId: member.id,
      expectedRevision: 2,
    }),
    AccessDenied,
  );
  const back = await act(member.accountId, {
    kind: 'offer',
    recipientEntryId: owner.id,
    expectedRevision: 2,
  });
  assert.ok(back.offerId);
  await act(owner.accountId, {
    kind: 'decline',
    offerId: back.offerId,
    expectedRevision: 2,
  });
  assert.equal(
    (await leagueGroupDetails(db, group.groupId, member.accountId)).handover,
    null,
  );
  const stale = await act(member.accountId, {
    kind: 'offer',
    recipientEntryId: owner.id,
    expectedRevision: 2,
  });
  assert.ok(stale.offerId);
  await executeGroupCommand(
    db,
    principal(member.accountId),
    groupCommandSchema.parse({
      kind: 'rotate-invitation',
      commandId: randomUUID(),
      competitionId,
      groupId: group.groupId,
      expectedRevision: 2,
      invitationToken: randomBytes(32).toString('hex'),
    }),
  );
  await assert.rejects(
    act(owner.accountId, {
      kind: 'accept',
      offerId: stale.offerId,
      expectedRevision: 3,
    }),
    rejected('handover-expired-or-changed'),
  );
});
