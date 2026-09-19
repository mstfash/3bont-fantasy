import { grantProofStaff, clearProofStaff } from './proof-staff.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { createDatabase, migrateApplication } from '@fantasy/persistence';
import {
  catalogueManifestSchema,
  type CatalogueManifest,
} from '@fantasy/contracts';
import { executeCatalogueImport } from '../src/catalogue-import.ts';
import { exportCatalogueSeason } from '../src/catalogue-export.ts';
import {
  executeCatalogueCommand,
  catalogueFingerprint,
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
const pool = new Pool({ connectionString, max: 4 }),
  db = createDatabase(pool);
before(async () => {
  await migrateApplication(pool);
});
after(async () => {
  await clearProofStaff(db);
  await db.destroy();
});
void test('reviewed catalogue batches are atomic, revision-bound and retry-safe', async (t) => {
  const actor = {
      accountId: randomUUID(),
      sessionId: randomUUID(),
      emailVerified: true,
      mfaVerifiedAt: new Date(),
      authenticatedAt: new Date(),
    },
    grants = [{ role: 'data-steward' as const, competitionId: null }];
  await grantProofStaff(db, actor.accountId, grants);
  function fixture() {
    const season = {
      id: randomUUID(),
      name: { en: 'Import proof', ar: 'اختبار الاستيراد' },
      startsAt: '2026-01-01T00:00:00Z',
      endsAt: '2027-01-01T00:00:00Z',
      synthetic: true,
    };
    const club = {
      id: randomUUID(),
      seasonId: season.id,
      name: { en: 'Proof club', ar: 'نادي الاختبار' },
      shortName: 'PRF',
      color: '#123456',
    };
    const footballer = {
      id: randomUUID(),
      seasonId: season.id,
      clubId: club.id,
      name: { en: 'Proof footballer', ar: 'لاعب الاختبار' },
      defaultPosition: 'MID',
      status: 'available',
      valuation: null,
      synthetic: true,
    };
    const base = () => ({
      commandId: randomUUID(),
      expectedFingerprint: null,
      reason: 'Reviewed fictional source for integration proof',
    });
    return {
      season,
      club,
      footballer,
      manifest: catalogueManifestSchema.parse({
        version: 1,
        sourceName: 'Proof source',
        sourceEvidenceReference: 'Fictional integration source',
        items: [
          { ...base(), kind: 'footballer', footballer },
          { ...base(), kind: 'club', club },
          { ...base(), kind: 'season', season },
        ],
      }),
    };
  }
  const review = (manifest: CatalogueManifest) =>
    executeCatalogueImport(db, actor, grants, { kind: 'preview', manifest });
  const audits = () =>
    db
      .selectFrom('audit_events')
      .selectAll()
      .where('actor_id', '=', actor.accountId)
      .execute();
  const receipts = () =>
    db
      .selectFrom('commands')
      .selectAll()
      .where('actor_id', '=', actor.accountId)
      .execute();
  await t.test(
    'preview uses dependency order but rolls back records, audits and receipts; apply retries once',
    async () => {
      const f = fixture(),
        preview = await review(f.manifest);
      assert.equal(preview.kind, 'preview');
      assert.deepEqual(
        preview.changes.map((c) => c.kind),
        ['season', 'club', 'footballer'],
      );
      assert.equal(
        await db
          .selectFrom('seasons')
          .select('id')
          .where('id', '=', f.season.id)
          .executeTakeFirst(),
        undefined,
      );
      assert.equal((await audits()).length, 0);
      assert.equal((await receipts()).length, 0);
      const command = {
        kind: 'apply' as const,
        commandId: randomUUID(),
        expectedFingerprint: preview.fingerprint,
        manifest: f.manifest,
      };
      const outcomes = await Promise.all([
        executeCatalogueImport(db, actor, grants, command),
        executeCatalogueImport(db, actor, grants, command),
      ]);
      assert.deepEqual(outcomes[0], outcomes[1]);
      assert.equal(outcomes[0].kind, 'applied');
      assert.equal((await audits()).length, 4);
      assert.equal((await receipts()).length, 4);
      await assert.rejects(
        executeCatalogueImport(db, actor, grants, {
          ...command,
          manifest: { ...f.manifest, sourceName: 'Different source' },
        }),
        (e) =>
          e instanceof CommandRejected && e.code === 'idempotency-conflict',
      );
      const exported = await exportCatalogueSeason(
        db,
        actor,
        grants,
        f.season.id,
      );
      const p = await review(exported);
      assert.equal(p.kind, 'preview');
      assert.ok(p.changes.every((c) => c.action === 'unchanged'));
      assert.equal(
        (await audits()).length,
        4,
        'export and preview do not write',
      );
    },
  );
  await t.test(
    'invalid last dependency rolls back every earlier write and reports original file row',
    async () => {
      const f = fixture();
      const player = f.manifest.items[0];
      assert.ok(player?.kind === 'footballer');
      player.footballer.clubId = randomUUID();
      const auditCount = (await audits()).length,
        receiptCount = (await receipts()).length;
      assert.deepEqual(await review(f.manifest), {
        kind: 'invalid',
        itemIndex: 0,
        code: 'club-outside-season',
      });
      assert.equal(
        await db
          .selectFrom('seasons')
          .select('id')
          .where('id', '=', f.season.id)
          .executeTakeFirst(),
        undefined,
      );
      assert.equal((await audits()).length, auditCount);
      assert.equal((await receipts()).length, receiptCount);
    },
  );
  await t.test(
    'changes after preview invalidate the batch without partial mutation',
    async () => {
      const f = fixture(),
        p = await review(f.manifest);
      assert.ok(p.kind === 'preview');
      const seasonCommand = f.manifest.items.find((i) => i.kind === 'season');
      assert.ok(seasonCommand?.kind === 'season');
      await executeCatalogueCommand(db, actor, grants, {
        ...seasonCommand,
        commandId: randomUUID(),
        season: { ...f.season, name: { en: 'Newer edit', ar: 'تعديل أحدث' } },
      });
      const outcome = await executeCatalogueImport(db, actor, grants, {
        kind: 'apply',
        commandId: randomUUID(),
        expectedFingerprint: p.fingerprint,
        manifest: f.manifest,
      });
      assert.deepEqual(outcome, {
        kind: 'invalid',
        itemIndex: 2,
        code: 'catalogue-changed',
      });
      assert.equal(
        await db
          .selectFrom('clubs')
          .select('id')
          .where('id', '=', f.club.id)
          .executeTakeFirst(),
        undefined,
      );
    },
  );
  await t.test(
    'a stale preview with refreshed row fingerprints is still rejected and rolled back',
    async () => {
      const f = fixture(),
        p = await review(f.manifest);
      assert.ok(p.kind === 'preview');
      const seasonCommand = f.manifest.items.find((i) => i.kind === 'season');
      assert.ok(seasonCommand?.kind === 'season');
      await executeCatalogueCommand(db, actor, grants, {
        ...seasonCommand,
        commandId: randomUUID(),
      });
      seasonCommand.expectedFingerprint = catalogueFingerprint(f.season);
      await assert.rejects(
        executeCatalogueImport(db, actor, grants, {
          kind: 'apply',
          commandId: randomUUID(),
          expectedFingerprint: p.fingerprint,
          manifest: f.manifest,
        }),
        (e) =>
          e instanceof CommandRejected && e.code === 'import-preview-changed',
      );
      assert.equal(
        await db
          .selectFrom('clubs')
          .select('id')
          .where('id', '=', f.club.id)
          .executeTakeFirst(),
        undefined,
      );
    },
  );
  await t.test(
    'duplicate records and unprivileged imports are rejected before writes',
    async () => {
      const f = fixture(),
        first = f.manifest.items[0];
      assert.ok(first);
      assert.equal(
        catalogueManifestSchema.safeParse({
          ...f.manifest,
          items: [first, first],
        }).success,
        false,
      );
      await assert.rejects(
        executeCatalogueImport(
          db,
          actor,
          [{ role: 'competition-manager', competitionId: null }],
          { kind: 'preview', manifest: f.manifest },
        ),
        AccessDenied,
      );
      await assert.rejects(
        exportCatalogueSeason(db, actor, [], f.season.id),
        AccessDenied,
      );
    },
  );
});
