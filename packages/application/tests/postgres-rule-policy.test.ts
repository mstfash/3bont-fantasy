import { grantProofStaff, clearProofStaff } from './proof-staff.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  competitionCommandSchema,
  lockedEntrySchema,
  type Competition,
  type Gameweek,
} from '@fantasy/contracts';
import { seedDemoReplay } from '../src/demo-replay.ts';
import { executeCompetitionCommand } from '../src/competition-commands.ts';
import { advanceDueGameweeks } from '../src/deadlines.ts';
import { executeChipGrantCommand } from '../src/chip-grants.ts';
import { executeSetupCommand } from '../src/competition-setup.ts';
import { CommandRejected } from '../src/errors.ts';
import { previewCompetitionUpdate } from '../src/competition-impact.ts';
import { AccessDenied } from '../src/authorization.ts';
import { competitionUpdateSchema } from '@fantasy/contracts';
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
  await grantProofStaff(db, owner.accountId, grants);
});
after(async () => {
  await clearProofStaff(db);
  await db.destroy();
});
const owner = {
  accountId: 'rule-policy-owner',
  sessionId: 'rule-policy-session',
  emailVerified: true,
  mfaVerifiedAt: new Date(),
  authenticatedAt: new Date(),
};
const grants = [{ role: 'owner' as const, competitionId: null }];
const rejection = (code: string) => (error: unknown) =>
  error instanceof CommandRejected && error.code === code;
const edit = (competition: Competition, input: object) =>
  competitionCommandSchema.parse({
    kind: 'update',
    commandId: randomUUID(),
    competitionId: competition.id,
    expectedRevision: competition.revision,
    name: competition.name,
    description: competition.description,
    entryLimit: competition.entryLimit,
    registrationOpens: competition.registrationOpens,
    registrationCloses: competition.registrationCloses,
    rules: competition.rules,
    reason: 'Reviewed future rule policy',
    ...input,
  });
async function executeReviewed(input: ReturnType<typeof edit>) {
  const command = competitionUpdateSchema.parse(input);
  const impact = await previewCompetitionUpdate(db, owner, grants, command);
  return executeCompetitionCommand(db, owner, grants, {
    ...command,
    expectedImpactFingerprint: impact.fingerprint,
  });
}
async function fixture(active: boolean) {
  await seedDemoReplay(db);
  const source = (
    await db
      .selectFrom('competitions')
      .select('data')
      .where('slug', '=', 'cairo-replay')
      .executeTakeFirstOrThrow()
  ).data;
  const competition: Competition = {
    ...source,
    id: randomUUID(),
    slug: `rules-${randomUUID()}`,
    revision: 1,
    status: active ? 'running' : 'published',
    firstLockedAt: active ? source.firstLockedAt : null,
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
  const market = await db
    .selectFrom('competition_players')
    .select('data')
    .where('competition_id', '=', source.id)
    .execute();
  await db
    .insertInto('competition_players')
    .values(
      market.map(({ data: p }) => ({
        competition_id: competition.id,
        footballer_id: p.footballerId,
        data: { ...p, competitionId: competition.id },
      })),
    )
    .execute();
  const sourceRound = (
    await db
      .selectFrom('gameweeks')
      .select('data')
      .where('competition_id', '=', source.id)
      .where('number', '=', 4)
      .executeTakeFirstOrThrow()
  ).data;
  const rounds: Gameweek[] = Array.from({ length: 3 }, (_, i) => ({
    ...sourceRound,
    id: randomUUID(),
    competitionId: competition.id,
    number: i + 1,
    deadline: new Date(Date.now() + (5 + i * 7) * 86400000).toISOString(),
  }));
  await db
    .insertInto('gameweeks')
    .values(
      rounds.map((g) => ({
        id: g.id,
        competition_id: competition.id,
        number: g.number,
        deadline: g.deadline,
        data: g,
      })),
    )
    .execute();
  const sourceEntry = (
    await db
      .selectFrom('entries')
      .select('data')
      .where('competition_id', '=', source.id)
      .executeTakeFirstOrThrow()
  ).data;
  const first = rounds[0];
  assert.ok(first);
  const entry = {
    ...sourceEntry,
    id: randomUUID(),
    competitionId: competition.id,
    firstGameweekId: first.id,
    editingGameweekId: first.id,
    revision: 1,
    state: {
      ...sourceEntry.state,
      freeTransfers: 1,
      transfersThisRound: 2,
      chip: 'bench-boost' as const,
      inventory: {
        wildcard: 1,
        'free-hit': 1,
        'bench-boost': 1,
        'triple-captain': 1,
      },
    },
  };
  if (active)
    await db
      .insertInto('entries')
      .values({
        id: entry.id,
        competition_id: competition.id,
        account_id: entry.accountId,
        revision: 1,
        data: entry,
      })
      .execute();
  return { competition, rounds, entry };
}
void test('economic changes wait for an unopened round and cannot recost accepted transfers or consume selected chips', async () => {
  const f = await fixture(true);
  let competition = f.competition;
  const first = f.rounds[0],
    next = f.rounds[1];
  assert.ok(first && next);
  const proposed = {
    ...competition.rules,
    transfer: {
      ...competition.rules.transfer,
      allowance: 2,
      extraTransferCost: 9000,
    },
    enabledChips: competition.rules.enabledChips.filter(
      (c) => c !== 'bench-boost',
    ),
  };
  await assert.rejects(
    executeCompetitionCommand(
      db,
      owner,
      grants,
      edit(competition, { rules: proposed }),
    ),
    rejection('economic-rules-need-future-round'),
  );
  await assert.rejects(
    executeCompetitionCommand(
      db,
      owner,
      grants,
      edit(competition, {
        rules: proposed,
        economicEffectiveGameweekId: first.id,
      }),
    ),
    rejection('economic-round-already-open'),
  );
  competition = await executeReviewed(
    edit(competition, {
      rules: proposed,
      economicEffectiveGameweekId: next.id,
    }),
  );
  const current = (
    await db
      .selectFrom('gameweeks')
      .select('data')
      .where('id', '=', first.id)
      .executeTakeFirstOrThrow()
  ).data;
  assert.equal(current.rules.transfer.extraTransferCost, 4000);
  assert.ok(current.rules.enabledChips.includes('bench-boost'));
  const scheduled = (
    await db
      .selectFrom('gameweeks')
      .select('data')
      .where('id', '=', next.id)
      .executeTakeFirstOrThrow()
  ).data;
  assert.equal(scheduled.rules.transfer.extraTransferCost, 9000);
  assert.equal(scheduled.rules.enabledChips.includes('bench-boost'), false);
  // An unrelated subsequent scoring edit must not pull scheduled economic rules forward.
  competition = await executeReviewed(
    edit(competition, {
      rules: {
        ...competition.rules,
        scoring: { ...competition.rules.scoring, assist: 4000 },
      },
    }),
  );
  const beforeLock = (
    await db
      .selectFrom('gameweeks')
      .select('data')
      .where('id', '=', first.id)
      .executeTakeFirstOrThrow()
  ).data;
  assert.equal(beforeLock.rules.transfer.extraTransferCost, 4000);
  assert.equal(beforeLock.rules.scoring.assist, 4000);
  await assert.rejects(
    executeCompetitionCommand(
      db,
      owner,
      grants,
      edit(competition, {
        rules: {
          ...competition.rules,
          chipInventory: { ...competition.rules.chipInventory, wildcard: 2 },
        },
      }),
    ),
    rejection('chip-inventory-needs-equal-grant'),
  );
  const deadline = new Date(Date.now() - 1000).toISOString();
  await db
    .updateTable('gameweeks')
    .set({ deadline, data: { ...beforeLock, deadline } })
    .where('id', '=', first.id)
    .execute();
  await advanceDueGameweeks(db, competition.id);
  const snapshot = lockedEntrySchema.parse(
    (
      await db
        .selectFrom('entry_snapshots')
        .select('payload')
        .where('entry_id', '=', f.entry.id)
        .where('gameweek_id', '=', first.id)
        .executeTakeFirstOrThrow()
    ).payload,
  );
  assert.equal(snapshot.transferDeduction, 4000);
  assert.equal(snapshot.chip, 'bench-boost');
  const advanced = (
    await db
      .selectFrom('entries')
      .select('data')
      .where('id', '=', f.entry.id)
      .executeTakeFirstOrThrow()
  ).data;
  assert.equal(advanced.editingGameweekId, next.id);
  assert.equal(
    advanced.state.freeTransfers,
    2,
    'the new round grants its own allowance',
  );
  assert.equal(advanced.state.inventory['bench-boost'], 0);
});
void test('published structural rules remain editable before the first deadline when the player pool stays legal', async () => {
  const { competition, rounds } = await fixture(false);
  const first = rounds[0];
  assert.ok(first);
  const changed = await executeReviewed(
    edit(competition, {
      rules: {
        ...competition.rules,
        squad: { ...competition.rules.squad, clubCap: 4 },
      },
    }),
  );
  assert.equal(changed.rules.squad.clubCap, 4);
  const deadline = new Date(Date.now() - 1000).toISOString();
  const current = (
    await db
      .selectFrom('gameweeks')
      .select('data')
      .where('id', '=', first.id)
      .executeTakeFirstOrThrow()
  ).data;
  await db
    .updateTable('gameweeks')
    .set({ deadline, data: { ...current, deadline } })
    .where('id', '=', first.id)
    .execute();
  await assert.rejects(
    executeCompetitionCommand(
      db,
      owner,
      grants,
      edit(changed, {
        rules: {
          ...changed.rules,
          squad: { ...changed.rules.squad, clubCap: 5 },
        },
      }),
    ),
    rejection('structural-rules-frozen'),
  );
});

void test('equal chip grants preserve spent inventory, resist duplicate delivery and protect announced calendar notice', async () => {
  const f = await fixture(true);
  const first = f.rounds[0],
    target = f.rounds[1];
  assert.ok(first && target);
  const command = {
    commandId: randomUUID(),
    competitionId: f.competition.id,
    expectedRevision: 1,
    gameweekId: target.id,
    amounts: {
      wildcard: 0,
      'free-hit': 0,
      'bench-boost': 2,
      'triple-captain': 0,
    },
    announcement: {
      en: 'Two extra bench boosts for every eligible squad',
      ar: 'فرصتان إضافيتان لكل فريق',
    },
    reason: 'Equal mid-season grant announced in advance',
  };
  const grant = await executeChipGrantCommand(db, owner, grants, command);
  assert.deepEqual(
    await executeChipGrantCommand(db, owner, grants, command),
    grant,
  );
  await assert.rejects(
    executeChipGrantCommand(db, owner, grants, {
      ...command,
      amounts: { ...command.amounts, wildcard: 1 },
    }),
    rejection('idempotency-conflict'),
  );
  const competition = (
    await db
      .selectFrom('competitions')
      .select('data')
      .where('id', '=', f.competition.id)
      .executeTakeFirstOrThrow()
  ).data;
  await assert.rejects(
    executeSetupCommand(db, owner, grants, {
      kind: 'round',
      commandId: randomUUID(),
      competitionId: competition.id,
      expectedRevision: competition.revision,
      gameweekId: first.id,
      number: first.number,
      name: first.name,
      deadline: new Date(Date.now() + 24 * 3600000).toISOString(),
      fixtureIds: [],
      reason: 'Attempt to shorten public notice',
    }),
    rejection('announced-notice-protected'),
  );
  await assert.rejects(
    executeCompetitionCommand(
      db,
      owner,
      grants,
      edit(competition, {
        economicEffectiveGameweekId: target.id,
        rules: {
          ...competition.rules,
          enabledChips: competition.rules.enabledChips.filter(
            (c) => c !== 'bench-boost',
          ),
        },
      }),
    ),
    rejection('announced-grant-protected'),
  );
  const deadline = new Date(Date.now() - 1000).toISOString();
  await db
    .updateTable('gameweeks')
    .set({ deadline, data: { ...first, deadline } })
    .where('id', '=', first.id)
    .execute();
  await advanceDueGameweeks(db, competition.id);
  await advanceDueGameweeks(db, competition.id);
  const entry = (
    await db
      .selectFrom('entries')
      .select('data')
      .where('id', '=', f.entry.id)
      .executeTakeFirstOrThrow()
  ).data;
  assert.equal(entry.editingGameweekId, target.id);
  assert.equal(
    entry.state.inventory['bench-boost'],
    2,
    'the outgoing use remains spent, then two uses are granted',
  );
  const receipts = await db
    .selectFrom('chip_grant_receipts')
    .selectAll()
    .where('grant_id', '=', grant.id)
    .execute();
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0]?.entry_id, entry.id);
});
void test('active scoring changes skip rounds with less than 48 hours notice', async () => {
  const f = await fixture(true),
    first = f.rounds[0],
    next = f.rounds[1];
  assert.ok(first && next);
  const deadline = new Date(Date.now() + 24 * 3600000).toISOString();
  await db
    .updateTable('gameweeks')
    .set({ deadline, data: { ...first, deadline } })
    .where('id', '=', first.id)
    .execute();
  await executeReviewed(
    edit(f.competition, {
      rules: {
        ...f.competition.rules,
        scoring: { ...f.competition.rules.scoring, assist: 4000 },
      },
    }),
  );
  const rounds = await db
    .selectFrom('gameweeks')
    .select('data')
    .where('competition_id', '=', f.competition.id)
    .orderBy('number')
    .execute();
  assert.equal(rounds[0]?.data.rules.scoring.assist, 3000);
  assert.equal(rounds[1]?.data.rules.scoring.assist, 4000);
});

void test('configuration preview is read-only, binds exact round scheduling, and audits the confirmed impact', async () => {
  const f = await fixture(true);
  const first = f.rounds[0],
    next = f.rounds[1];
  assert.ok(first && next);
  const deadline = new Date(Date.now() + 24 * 3600000).toISOString();
  await db
    .updateTable('gameweeks')
    .set({ deadline, data: { ...first, deadline } })
    .where('id', '=', first.id)
    .execute();
  const command = competitionUpdateSchema.parse(
    edit(f.competition, {
      entryLimit: 2,
      rules: {
        ...f.competition.rules,
        scoring: { ...f.competition.rules.scoring, assist: 4000 },
      },
    }),
  );
  const impact = await previewCompetitionUpdate(db, owner, grants, command);
  assert.equal(impact.rounds[0]?.disposition, 'notice');
  assert.equal(impact.rounds[1]?.disposition, 'updated');
  assert.deepEqual(impact.rounds[1].changedCategories, ['scoring']);
  assert.deepEqual(impact.metadataChanges, ['entryLimit']);
  assert.equal(impact.entries.active, 1);
  assert.equal(impact.entries.accounts, 1);
  assert.deepEqual(
    await previewCompetitionUpdate(db, owner, grants, {
      ...command,
      commandId: randomUUID(),
    }),
    impact,
  );
  assert.equal(
    (
      await db
        .selectFrom('competitions')
        .select('data')
        .where('id', '=', f.competition.id)
        .executeTakeFirstOrThrow()
    ).data.revision,
    1,
  );
  assert.equal(
    (
      await db
        .selectFrom('gameweeks')
        .select('data')
        .where('id', '=', next.id)
        .executeTakeFirstOrThrow()
    ).data.rules.scoring.assist,
    3000,
  );
  assert.equal(
    (
      await db
        .selectFrom('commands')
        .select('command_id')
        .where('command_id', '=', command.commandId)
        .execute()
    ).length,
    0,
  );
  assert.equal(
    (
      await db
        .selectFrom('audit_events')
        .select('id')
        .where('scope_id', '=', f.competition.id)
        .execute()
    ).length,
    0,
  );
  await assert.rejects(
    executeCompetitionCommand(db, owner, grants, command),
    rejection('competition-impact-required'),
  );
  const confirmed = {
    ...command,
    expectedImpactFingerprint: impact.fingerprint,
  };
  const result = await executeCompetitionCommand(db, owner, grants, confirmed);
  assert.deepEqual(
    await executeCompetitionCommand(db, owner, grants, confirmed),
    result,
  );
  const audit = await db
    .selectFrom('audit_events')
    .select('payload')
    .where('scope_id', '=', f.competition.id)
    .executeTakeFirstOrThrow();
  assert.ok(
    audit.payload &&
      typeof audit.payload === 'object' &&
      'impact' in audit.payload,
  );
  assert.deepEqual(audit.payload.impact, impact);
  const saved = await db
    .selectFrom('gameweeks')
    .select('data')
    .where('competition_id', '=', f.competition.id)
    .orderBy('number')
    .execute();
  for (const [i, row] of saved.entries())
    assert.equal(row.data.rules.version, impact.rounds[i]?.afterVersion);
});

void test('configuration confirmation rejects a changed population, proposed values and schedule without partial writes', async () => {
  const f = await fixture(true);
  const command = competitionUpdateSchema.parse(
    edit(f.competition, {
      entryLimit: 2,
      rules: {
        ...f.competition.rules,
        scoring: { ...f.competition.rules.scoring, assist: 4000 },
      },
    }),
  );
  const impact = await previewCompetitionUpdate(db, owner, grants, command);
  const confirmed = {
    ...command,
    expectedImpactFingerprint: impact.fingerprint,
  };
  await assert.rejects(
    executeCompetitionCommand(db, owner, grants, {
      ...confirmed,
      entryLimit: 3,
    }),
    rejection('competition-impact-changed'),
  );
  const extra = { ...f.entry, id: randomUUID() };
  await db
    .insertInto('entries')
    .values({
      id: extra.id,
      competition_id: extra.competitionId,
      account_id: extra.accountId,
      revision: 1,
      data: extra,
    })
    .execute();
  await assert.rejects(
    executeCompetitionCommand(db, owner, grants, confirmed),
    rejection('competition-impact-changed'),
  );
  const fresh = await previewCompetitionUpdate(db, owner, grants, command);
  assert.equal(fresh.entries.maximumOwned, 2);
  assert.notEqual(fresh.fingerprint, impact.fingerprint);
  await assert.rejects(
    previewCompetitionUpdate(db, owner, grants, { ...command, entryLimit: 1 }),
    rejection('entry-limit-below-existing'),
  );
  const first = f.rounds[0];
  assert.ok(first);
  const deadline = new Date(Date.now() + 24 * 3600000).toISOString();
  await db
    .updateTable('gameweeks')
    .set({ deadline, data: { ...first, deadline } })
    .where('id', '=', first.id)
    .execute();
  await assert.rejects(
    executeCompetitionCommand(db, owner, grants, {
      ...confirmed,
      expectedImpactFingerprint: fresh.fingerprint,
    }),
    rejection('competition-impact-changed'),
  );
  assert.equal(
    (
      await db
        .selectFrom('competitions')
        .select('data')
        .where('id', '=', f.competition.id)
        .executeTakeFirstOrThrow()
    ).data.revision,
    1,
  );
  assert.equal(
    (
      await db
        .selectFrom('commands')
        .select('command_id')
        .where('command_id', '=', command.commandId)
        .execute()
    ).length,
    0,
  );
  const final = await previewCompetitionUpdate(db, owner, grants, command);
  await executeCompetitionCommand(db, owner, grants, {
    ...confirmed,
    expectedImpactFingerprint: final.fingerprint,
  });
});

void test('configuration preview reports future cap effects without changing balances and checks current scoped authority', async () => {
  const f = await fixture(true),
    next = f.rounds[1];
  assert.ok(next);
  const entry = { ...f.entry, state: { ...f.entry.state, freeTransfers: 5 } };
  await db
    .updateTable('entries')
    .set({ data: entry })
    .where('id', '=', entry.id)
    .execute();
  const command = competitionUpdateSchema.parse(
    edit(f.competition, {
      economicEffectiveGameweekId: next.id,
      rules: {
        ...f.competition.rules,
        transfer: { ...f.competition.rules.transfer, carryCap: 2 },
      },
    }),
  );
  const impact = await previewCompetitionUpdate(db, owner, grants, command);
  assert.equal(impact.economicStart, 2);
  assert.equal(impact.entries.activeAboveProposedCarryCap, 1);
  assert.equal(impact.rounds[0]?.disposition, 'unchanged');
  assert.equal(
    (
      await db
        .selectFrom('entries')
        .select('data')
        .where('id', '=', entry.id)
        .executeTakeFirstOrThrow()
    ).data.state.freeTransfers,
    5,
  );
  const principal = { ...owner, accountId: 'impact-scoped-admin' };
  const scoped = [
    { role: 'competition-manager' as const, competitionId: f.competition.id },
  ];
  await grantProofStaff(db, principal.accountId, scoped);
  assert.equal(
    (await previewCompetitionUpdate(db, principal, scoped, command))
      .fingerprint,
    impact.fingerprint,
  );
  await assert.rejects(
    previewCompetitionUpdate(db, principal, scoped, {
      ...command,
      competitionId: randomUUID(),
    }),
    AccessDenied,
  );
  await executeCompetitionCommand(db, principal, scoped, {
    ...command,
    expectedImpactFingerprint: impact.fingerprint,
  });
  await db
    .deleteFrom('staff_grants')
    .where('account_id', '=', principal.accountId)
    .execute();
  await assert.rejects(
    previewCompetitionUpdate(db, principal, scoped, command),
    AccessDenied,
  );
  await assert.rejects(
    executeCompetitionCommand(db, principal, scoped, {
      ...command,
      expectedImpactFingerprint: impact.fingerprint,
    }),
    AccessDenied,
  );
});

void test('a deadline passing after preview requires fresh review even before the worker locks it', async () => {
  const f = await fixture(false),
    first = f.rounds[0];
  assert.ok(first);
  const deadline = new Date(Date.now() + 1000).toISOString();
  await db
    .updateTable('gameweeks')
    .set({ deadline, data: { ...first, deadline } })
    .where('id', '=', first.id)
    .execute();
  const command = competitionUpdateSchema.parse(
    edit(f.competition, {
      rules: {
        ...f.competition.rules,
        scoring: { ...f.competition.rules.scoring, assist: 4000 },
      },
    }),
  );
  const impact = await previewCompetitionUpdate(db, owner, grants, command);
  assert.equal(impact.rounds[0]?.disposition, 'updated');
  await setTimeout(Math.max(0, Date.parse(deadline) - Date.now()) + 25);
  await assert.rejects(
    executeCompetitionCommand(db, owner, grants, {
      ...command,
      expectedImpactFingerprint: impact.fingerprint,
    }),
    rejection('competition-impact-changed'),
  );
  const fresh = await previewCompetitionUpdate(db, owner, grants, command);
  assert.equal(fresh.rounds[0]?.disposition, 'locked');
  assert.equal(fresh.rounds[1]?.disposition, 'updated');
  assert.equal(
    (
      await db
        .selectFrom('competitions')
        .select('revision')
        .where('id', '=', f.competition.id)
        .executeTakeFirstOrThrow()
    ).revision,
    1,
  );
});
