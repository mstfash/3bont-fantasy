import { z } from 'zod';
import { idSchema } from './common.ts';

export const providerNormalizationSelectionSchema = z.strictObject({
  fixtureId: idSchema,
  fixtureAttemptId: idSchema,
  playersAttemptId: idSchema,
  lineupsAttemptId: idSchema,
  eventsAttemptId: idSchema,
});
export const providerReportReviewSchema = z.strictObject({
  selection: providerNormalizationSelectionSchema,
  expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  eligibilityReference: z.string().trim().min(5).max(2000),
});
export type ProviderNormalizationSelection = z.infer<
  typeof providerNormalizationSelectionSchema
>;
export type ProviderReportReview = z.infer<typeof providerReportReviewSchema>;
