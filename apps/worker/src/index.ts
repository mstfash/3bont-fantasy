import { setTimeout as wait } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { PgBoss } from 'pg-boss';
import { z } from 'zod';
import {
  createDatabase,
  applicationSchemaReady,
  createManagedPool,
} from '@fantasy/persistence';
import {
  planProviderCollections,
  processNextProviderCollection,
  acceptNextProviderReport,
  buildNextAccountExport,
  purgeAccountExports,
  purgeGroupHandovers,
  recordWorkerRun,
  purgeWorkerRuns,
  advanceDueGameweeks,
  publishDueResults,
  reconcileAchievements,
  purgeExpiredChat,
  purgeSponsorReceipts,
  reconcilePrizeCorrections,
} from '@fantasy/application';

const config = z
  .object({
    API_FOOTBALL_AUTOMATION_ENABLED: z.enum(['true', 'false']).default('false'),
    API_FOOTBALL_KEY: z.string().optional(),
    DATABASE_URL: z
      .url()
      .refine((value) =>
        ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
      ),
  })
  .parse(process.env);
const pool = createManagedPool({
  connectionString: config.DATABASE_URL,
  max: 4,
  connectionTimeoutMillis: 3000,
  application_name: '3bont-fantasy-worker',
});
if (!(await applicationSchemaReady(pool))) {
  await pool.end();
  throw new Error('Apply the release migrations before starting the worker.');
}
const db = createDatabase(pool);
const boss = new PgBoss({
  connectionString: config.DATABASE_URL,
  schema: 'fantasy_jobs',
  max: 4,
  connectionTimeoutMillis: 3000,
});
boss.on('error', (error) => {
  console.error('Worker queue error', { name: error.name });
});
await boss.start();
const instanceId = randomUUID();
await boss.createQueue('lock-gameweeks');
await boss.work('lock-gameweeks', { batchSize: 1 }, async () => {
  await recordWorkerRun(db, instanceId, 'game-cycle', async () => {
    const deadlines = await advanceDueGameweeks(db);
    const results = await publishDueResults(db);
    const badges = await reconcileAchievements(db);
    const prizes = await reconcilePrizeCorrections(db);
    const issues = [
      ...results.failed.map((p) => ({
        kind: 'gameweek' as const,
        id: p.gameweekId,
        code: p.code,
      })),
      ...badges.failed.map((id) => ({
        kind: 'competition' as const,
        id,
        code: 'achievement-reconciliation-failed',
      })),
      ...prizes.failed.map((p) => ({
        kind: 'prize-proposal' as const,
        id: p.proposalId,
        code: p.code,
      })),
    ];
    return {
      counts: {
        roundsInspected: deadlines.inspected,
        roundsLocked: deadlines.locked,
        entriesSnapshotted: deadlines.entries,
        resultsProcessed: results.published,
        achievementChanges: badges.changed,
        prizeCasesOpened: prizes.opened,
        prizeCasesUpdated: prizes.updated,
      },
      issueCount: issues.length,
      issues: issues.slice(0, 100),
    };
  });
});
await boss.schedule('lock-gameweeks', '* * * * *');
await boss.createQueue('expire-chat');
await boss.work('expire-chat', { batchSize: 1 }, async () => {
  await recordWorkerRun(db, instanceId, 'maintenance', async () => {
    await purgeExpiredChat(db);
    await purgeSponsorReceipts(db);
    await purgeWorkerRuns(db);
    await purgeAccountExports(db);
    await purgeGroupHandovers(db);
    return { counts: {}, issueCount: 0, issues: [] };
  });
});
await boss.schedule('expire-chat', '17 * * * *');
await boss.createQueue('account-exports');
await boss.work('account-exports', { batchSize: 1 }, async () => {
  await recordWorkerRun(db, instanceId, 'account-exports', async () => {
    let ready = 0,
      failed = 0;
    for (let i = 0; i < 2; i++) {
      const result = await buildNextAccountExport(db);
      if (!result) break;
      if (result.state === 'ready') ready++;
      else failed++;
    }
    return {
      counts: { archivesReady: ready, archivesFailed: failed },
      issueCount: failed,
      issues: [],
    };
  });
});
await boss.schedule('account-exports', '* * * * *');
await boss.send('account-exports', {}, { singletonKey: 'startup-exports' });

await boss.createQueue('provider-collection');
await boss.work('provider-collection', { batchSize: 1 }, async () => {
  await recordWorkerRun(db, instanceId, 'provider-collection', async () => {
    if (config.API_FOOTBALL_AUTOMATION_ENABLED !== 'true')
      return {
        counts: { providerAutomationEnabled: 0 },
        issueCount: 0,
        issues: [],
      };
    if (!config.API_FOOTBALL_KEY || config.API_FOOTBALL_KEY.trim().length < 10)
      throw new Error('Provider automation requires a configured worker key');
    const plan = await planProviderCollections(db);
    let attempts = 0,
      completed = 0,
      held = 0;
    const issues: { kind: 'provider-collection'; id: string; code: string }[] =
      [];
    const began = performance.now();
    for (
      let index = 0;
      index < 4 && performance.now() - began < 24_000;
      index++
    ) {
      const result = await processNextProviderCollection(
        db,
        config.API_FOOTBALL_KEY,
      );
      if (result.attempted) attempts++;
      if (result.state === 'complete') completed++;
      if (result.state === 'held') {
        held++;
        if (result.batchId && result.code)
          issues.push({
            kind: 'provider-collection',
            id: result.batchId,
            code: result.code,
          });
      }
      if (
        result.state === 'idle' ||
        (!result.attempted && result.code && result.state !== 'held')
      )
        break;
      if (result.attempted) await wait(1000);
    }
    const accepted =
      performance.now() - began < 24_000
        ? await acceptNextProviderReport(db)
        : null;
    if (accepted?.state === 'held')
      issues.push({
        kind: 'provider-collection',
        id: accepted.batchId,
        code: 'provider-report-held',
      });
    return {
      counts: {
        providerAutomationEnabled: 1,
        providerReportsAccepted: accepted?.state === 'accepted' ? 1 : 0,
        providerReportsHeld: accepted?.state === 'held' ? 1 : 0,
        collectionsPlanned: plan.planned,
        providerAttempts: attempts,
        collectionsCompleted: completed,
        collectionsHeld: held,
      },
      issueCount: issues.length,
      issues,
    };
  });
});
await boss.schedule('provider-collection', '* * * * *');
await boss.send(
  'provider-collection',
  {},
  { singletonKey: 'startup-provider-collection' },
);

await boss.send('lock-gameweeks', {}, { singletonKey: 'startup-deadlines' });
console.info('3BONT FANTASY deadline and scoring worker ready');
let stopping = false;
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await boss.stop();
  await db.destroy();
}
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void shutdown().catch((error: unknown) => {
      console.error(
        error instanceof Error ? error.message : 'Worker shutdown failed',
      );
      process.exitCode = 1;
    });
  });
