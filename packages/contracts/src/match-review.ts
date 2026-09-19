import { z } from 'zod';
import { idSchema, localizedSchema } from './common.ts';
import { matchDataCommandSchema } from './results.ts';
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/u);
export const matchReviewCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('preview'),
    command: matchDataCommandSchema,
  }),
  z.strictObject({
    kind: z.literal('apply'),
    command: matchDataCommandSchema,
    expectedFingerprint: fingerprint,
  }),
]);
export const matchReviewPreviewSchema = z.strictObject({
  fingerprint,
  affectedCompetitions: z.int().nonnegative(),
  restrictedCompetitions: z.int().nonnegative(),
  rounds: z.array(
    z.strictObject({
      competitionId: idSchema,
      competitionName: localizedSchema,
      gameweekId: idSchema,
      name: localizedSchema,
      status: z.string(),
      rulesVersion: z.int().positive(),
      changedSquads: z.int().nonnegative(),
      changedRanks: z.int().nonnegative(),
      classicGroups: z.int().nonnegative(),
      headToHeadEditions: z.int().nonnegative(),
      prizePools: z.int().nonnegative(),
      heldPrizeProjections: z.int().nonnegative(),
      settled: z.boolean(),
      locked: z.boolean(),
    }),
  ),
});
export type MatchReviewPreview = z.infer<typeof matchReviewPreviewSchema>;
export type MatchReviewCommand = z.infer<typeof matchReviewCommandSchema>;
