import { z } from 'zod';
import { idSchema } from './common.ts';
export const workerTaskSchema = z.enum([
  'game-cycle',
  'maintenance',
  'account-exports',
  'provider-collection',
]);
export const workerRunSummarySchema = z
  .strictObject({
    counts: z.partialRecord(
      z.enum([
        'providerAutomationEnabled',
        'collectionsPlanned',
        'providerAttempts',
        'collectionsCompleted',
        'collectionsHeld',
        'archivesReady',
        'archivesFailed',
        'roundsInspected',
        'roundsLocked',
        'entriesSnapshotted',
        'resultsProcessed',
        'achievementChanges',
        'prizeCasesOpened',
        'prizeCasesUpdated',
      ]),
      z.int().nonnegative(),
    ),
    issueCount: z.int().nonnegative(),
    issues: z
      .array(
        z.strictObject({
          kind: z.enum([
            'gameweek',
            'competition',
            'prize-proposal',
            'provider-collection',
          ]),
          id: idSchema,
          code: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/u),
        }),
      )
      .max(100),
  })
  .refine((s) => s.issueCount >= s.issues.length);
export type WorkerTask = z.infer<typeof workerTaskSchema>;
export type WorkerRunSummary = z.infer<typeof workerRunSummarySchema>;
