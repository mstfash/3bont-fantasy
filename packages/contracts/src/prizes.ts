import { z } from 'zod';
import {
  idSchema,
  instantSchema,
  localizedSchema,
  pointUnitsSchema,
} from './common.ts';
import { currencyMinorDigits } from '@fantasy/domain';
const minor = z.int().nonnegative().max(1_000_000_000_000);
const currency = z
  .string()
  .regex(/^[A-Z]{3}$/u)
  .refine((value) => {
    try {
      if (!Intl.supportedValuesOf('currency').includes(value)) return false;
      currencyMinorDigits(value);
      return true;
    } catch {
      return false;
    }
  });
export const prizeRewardSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('cash'),
    amountMinor: minor.refine((v) => v > 0),
  }),
  z.strictObject({
    kind: z.literal('goods'),
    name: localizedSchema,
    cashEquivalentMinor: minor.refine((v) => v > 0).nullable(),
  }),
]);
const terms = {
  name: localizedSchema,
  description: localizedSchema,
  firstGameweekId: idSchema,
  lastGameweekId: idSchema,
  groupId: idSchema.nullable(),
  eligibilityCutoff: instantSchema,
  currency,
  places: z.array(prizeRewardSchema).min(1).max(100),
  oneAwardPerAccount: z.boolean(),
};
export const prizePoolSchema = z.strictObject({
  id: idSchema,
  competitionId: idSchema,
  revision: z.int().positive(),
  ...terms,
  state: z.enum(['draft', 'published']),
  synthetic: z.boolean(),
  gameweekIds: z.array(idSchema).max(200),
  publishedAt: instantSchema.nullable(),
  evidenceReference: z.string().max(1000).nullable(),
  ranking: z.enum(['shared', 'deductions-then-goals']),
});
export const prizeAwardSchema = z.strictObject({
  entryId: idSchema,
  accountId: z.string(),
  entryName: z.string(),
  rank: z.int().positive(),
  reward: prizeRewardSchema,
});
export const prizeCandidateSchema = z.strictObject({
  entryId: idSchema,
  accountId: z.string(),
  entryName: z.string(),
  points: pointUnitsSchema,
  transferDeductions: pointUnitsSchema,
  effectiveGoals: z.int().nonnegative(),
  eligible: z.boolean(),
  reasons: z.array(z.string()),
});
export const prizePreviewSchema = z.strictObject({
  poolId: idSchema,
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  revisions: z.array(
    z.strictObject({ gameweekId: idSchema, revision: z.int().positive() }),
  ),
  candidates: z.array(prizeCandidateSchema),
  awards: z.array(prizeAwardSchema),
  residueMinor: minor,
  unallocatedMinor: minor,
  issues: z.array(z.string()),
});
export const prizeProposalSchema = z.strictObject({
  id: idSchema,
  poolId: idSchema,
  competitionId: idSchema,
  revision: z.int().positive(),
  preview: prizePreviewSchema,
  state: z.enum(['prepared', 'reviewed', 'approved', 'fulfilled', 'voided']),
  preparedBy: z.string(),
  preparedAt: instantSchema,
  reviewedBy: z.string().nullable(),
  reviewedAt: instantSchema.nullable(),
  approvedBy: z.string().nullable(),
  approvedAt: instantSchema.nullable(),
  fulfilledBy: z.string().nullable(),
  fulfilledAt: instantSchema.nullable(),
  fulfillmentReference: z.string().max(1000).nullable(),
});
const base = {
  commandId: idSchema,
  competitionId: idSchema,
  reason: z.string().trim().min(5).max(1000),
};
export const prizeCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...base, kind: z.literal('create'), ...terms }),
  z.strictObject({
    ...base,
    kind: z.literal('update'),
    poolId: idSchema,
    expectedRevision: z.int().positive(),
    ...terms,
  }),
  z.strictObject({
    ...base,
    kind: z.literal('publish'),
    poolId: idSchema,
    expectedRevision: z.int().positive(),
    evidenceReference: z.string().trim().min(5).max(1000),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('prepare'),
    poolId: idSchema,
    expectedRevision: z.int().positive(),
    expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('eligibility'),
    poolId: idSchema,
    expectedRevision: z.int().positive(),
    accountId: z.string().min(1).max(200),
    excluded: z.boolean(),
    evidenceReference: z.string().trim().min(5).max(1000),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('review'),
    proposalId: idSchema,
    expectedRevision: z.int().positive(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('approve'),
    proposalId: idSchema,
    expectedRevision: z.int().positive(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('fulfill'),
    proposalId: idSchema,
    expectedRevision: z.int().positive(),
    reference: z.string().trim().min(5).max(1000),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('void'),
    proposalId: idSchema,
    expectedRevision: z.int().positive(),
  }),
]);
export const prizeCommandResultSchema = z.strictObject({
  poolId: idSchema,
  proposalId: idSchema.nullable(),
});
export type PrizePool = z.infer<typeof prizePoolSchema>;
export type PrizeReward = z.infer<typeof prizeRewardSchema>;
export type PrizeAward = z.infer<typeof prizeAwardSchema>;
export type PrizePreview = z.infer<typeof prizePreviewSchema>;
export type PrizeProposal = z.infer<typeof prizeProposalSchema>;
export type PrizeCommand = z.infer<typeof prizeCommandSchema>;
