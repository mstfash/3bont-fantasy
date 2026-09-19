import { grantProofStaff, clearProofStaff } from './proof-staff.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import { catalogueCommandSchema, type Footballer } from '@fantasy/contracts';
import {
  catalogueFingerprint,
  executeCatalogueCommand,
} from '../src/catalogue.ts';
import { AccessDenied } from '../src/authorization.ts';
import { CommandRejected } from '../src/errors.ts';
const connectionString = process.env['FANTASY_TEST_DATABASE_URL'];
if (
  !connectionString ||
  new URL(connectionString).hostname !== '127.0.0.1' ||
  new URL(connectionString).pathname !== '/fantasy_proof'
)
  throw new Error('Use disposable integration runner');
const pool = new Pool({ connectionString, max: 4 });
const db = createDatabase(pool);
before(async () => {
  await migrateApplication(pool);
});
after(async () => {
  await clearProofStaff(db);
  await db.destroy();
});
void test('catalogue edits bind semantic revisions, preserve provenance and audit licensed valuations without repricing', async () => {
  const actor = {
    accountId: 'catalogue-proof',
    sessionId: 'catalogue-session',
    emailVerified: true,
    mfaVerifiedAt: new Date(),
    authenticatedAt: new Date(),
  };
  const grants = [{ role: 'data-steward' as const, competitionId: null }];
  await grantProofStaff(db, actor.accountId, grants);
  const cmd = (input: object) =>
    catalogueCommandSchema.parse({
      commandId: randomUUID(),
      expectedFingerprint: null,
      reason: 'Reviewed source and provenance',
      ...input,
    });
  const execute = (input: object) =>
    executeCatalogueCommand(db, actor, grants, cmd(input));
  const rejected = (code: string) => (error: unknown) =>
    error instanceof CommandRejected && error.code === code;
  const season = {
    id: randomUUID(),
    name: { en: 'Catalogue proof', ar: 'اختبار الدليل' },
    startsAt: '2026-01-01T00:00:00Z',
    endsAt: '2027-01-01T00:00:00Z',
    synthetic: true,
  };
  await assert.rejects(
    executeCatalogueCommand(
      db,
      actor,
      [{ role: 'competition-manager', competitionId: null }],
      cmd({ kind: 'season', season }),
    ),
    AccessDenied,
  );
  await execute({ kind: 'season', season });
  await assert.rejects(
    execute({
      kind: 'season',
      season: { ...season, synthetic: false },
      expectedFingerprint: catalogueFingerprint(season),
    }),
    rejected('synthetic-provenance-frozen'),
  );
  const club = {
    id: randomUUID(),
    seasonId: season.id,
    name: { en: 'Club one', ar: 'نادي أول' },
    shortName: 'ONE',
    color: '#abcdef',
  };
  await execute({ kind: 'club', club });
  const footballer: Footballer = {
    id: randomUUID(),
    seasonId: season.id,
    clubId: club.id,
    name: { en: 'Proof player', ar: 'لاعب اختبار' },
    defaultPosition: 'MID',
    status: 'available',
    synthetic: true,
    valuation: null,
  };
  const creation = cmd({ kind: 'footballer', footballer });
  const first = await executeCatalogueCommand(db, actor, grants, creation);
  assert.deepEqual(
    await executeCatalogueCommand(db, actor, grants, creation),
    first,
  );
  const original = await db
    .selectFrom('footballers')
    .select('data')
    .where('id', '=', footballer.id)
    .executeTakeFirstOrThrow();
  assert.equal(
    catalogueFingerprint(original.data),
    catalogueFingerprint(footballer),
    'JSONB object key ordering cannot cause false conflicts',
  );
  const valued = {
    ...footballer,
    valuation: {
      amountMinor: 1234,
      currency: 'KWD',
      asOf: '2026-01-02T00:00:00Z',
      sourceName: 'Synthetic valuation proof',
      sourceUrl: 'https://example.com/proof',
      licensedForDisplay: false,
    },
  };
  const updates = await Promise.allSettled([
    execute({
      kind: 'footballer',
      footballer: valued,
      expectedFingerprint: catalogueFingerprint(footballer),
    }),
    execute({
      kind: 'footballer',
      footballer: {
        ...valued,
        name: { en: 'Concurrent change', ar: 'تغيير متزامن' },
      },
      expectedFingerprint: catalogueFingerprint(footballer),
    }),
  ]);
  assert.equal(updates.filter((r) => r.status === 'fulfilled').length, 1);
  const failed = updates.find((r) => r.status === 'rejected');
  assert.ok(
    failed?.status === 'rejected' &&
      rejected('catalogue-changed')(failed.reason),
  );
  const saved = await db
    .selectFrom('footballers')
    .select('data')
    .where('id', '=', footballer.id)
    .executeTakeFirstOrThrow();
  assert.deepEqual(saved.data.valuation, valued.valuation);
  const expectedFingerprint = catalogueFingerprint(saved.data);
  await assert.rejects(
    execute({
      kind: 'footballer',
      footballer: { ...saved.data, clubId: randomUUID() },
      expectedFingerprint,
    }),
    rejected('club-outside-season'),
  );
  await assert.rejects(
    execute({
      kind: 'footballer',
      footballer: {
        ...saved.data,
        valuation: {
          ...valued.valuation,
          asOf: new Date(Date.now() + 86400000).toISOString(),
        },
      },
      expectedFingerprint,
    }),
    rejected('valuation-date-in-future'),
  );
  const audits = await db
    .selectFrom('audit_events')
    .selectAll()
    .where('scope_id', '=', footballer.id)
    .execute();
  assert.equal(audits.length, 2, 'retry does not duplicate evidence');
  assert.equal(
    (
      await db
        .selectFrom('competition_players')
        .selectAll()
        .where('footballer_id', '=', footballer.id)
        .execute()
    ).length,
    0,
    'catalogue does not silently publish selection prices',
  );
});
