import { z } from 'zod';
import {
  idSchema,
  instantSchema,
  localizedSchema,
  pointUnitsSchema,
} from './common.ts';
export const achievementConditionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('activated') }),
  z.strictObject({ kind: z.literal('positive-round') }),
  z.strictObject({ kind: z.literal('points'), minimum: pointUnitsSchema }),
  z.strictObject({
    kind: z.literal('top-rank'),
    maximumRank: z.int().min(1).max(100000),
  }),
  z.strictObject({
    kind: z.literal('streak'),
    length: z.int().min(2).max(100),
    minimum: pointUnitsSchema,
  }),
]);
const template = {
  name: localizedSchema,
  description: localizedSchema,
  icon: z.enum(['star', 'trophy', 'shield', 'bolt', 'crown']),
  scope: z.enum(['entry', 'account']),
  condition: achievementConditionSchema,
  firstRound: z.int().min(1).max(200),
  lastRound: z.int().min(1).max(200),
};
export const achievementDefinitionSchema = z
  .strictObject({
    id: idSchema,
    competitionId: idSchema,
    version: z.int().positive(),
    revision: z.int().positive(),
    ...template,
    state: z.enum(['draft', 'published']),
    publishedAt: instantSchema.nullable(),
    activeUntilRound: z.int().min(0).max(200),
  })
  .refine(
    (d) =>
      d.firstRound <= d.lastRound &&
      (d.scope !== 'account' || d.condition.kind === 'activated'),
  );
export const achievementGrantSchema = z.strictObject({
  id: idSchema,
  definitionId: idSchema,
  version: z.int().positive(),
  competitionId: idSchema,
  accountId: z.string(),
  entryId: idSchema.nullable(),
  scopeKey: z.string(),
  witnessEntryId: idSchema,
  witnessRounds: z.array(z.int().positive()).max(100),
  state: z.enum(['active', 'revoked']),
  awardedAt: instantSchema,
  changedAt: instantSchema,
  revision: z.int().positive(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
});
const base = {
  commandId: idSchema,
  competitionId: idSchema,
  reason: z.string().trim().min(5).max(1000),
};
export const achievementCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...base, kind: z.literal('create'), ...template }),
  z.strictObject({
    ...base,
    kind: z.literal('revise'),
    definitionId: idSchema,
    sourceVersion: z.int().positive(),
    ...template,
  }),
  z.strictObject({
    ...base,
    kind: z.literal('update'),
    definitionId: idSchema,
    version: z.int().positive(),
    expectedRevision: z.int().positive(),
    ...template,
  }),
  z.strictObject({
    ...base,
    kind: z.literal('publish'),
    definitionId: idSchema,
    version: z.int().positive(),
    expectedRevision: z.int().positive(),
    allowHistorical: z.boolean(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('retire'),
    definitionId: idSchema,
    version: z.int().positive(),
    expectedRevision: z.int().positive(),
    afterRound: z.int().min(0).max(200),
  }),
  z.strictObject({ ...base, kind: z.literal('reconcile') }),
]);
export const achievementCommandResultSchema = z.strictObject({
  definitionId: idSchema.nullable(),
  version: z.int().positive().nullable(),
  changed: z.int().nonnegative(),
});
export type AchievementDefinition = z.infer<typeof achievementDefinitionSchema>;
export type AchievementGrant = z.infer<typeof achievementGrantSchema>;
export type AchievementCommand = z.infer<typeof achievementCommandSchema>;
