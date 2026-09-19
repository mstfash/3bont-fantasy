import { fixtureDispositionChoiceSchema } from './fixture-dispositions.ts';
import {
  providerNormalizationSelectionSchema,
  providerReportReviewSchema,
} from './provider-normalization.ts';
import {
  providerIdentitySchema,
  providerSeasonBindingSchema,
} from './provider-identities.ts';
import { z } from 'zod';
import { competitionRulesSchema } from './rules.ts';
import {
  idSchema,
  instantSchema,
  pointUnitsSchema,
  positionSchema,
} from './common.ts';
import {
  fixtureSchema,
  statisticsSchema,
  disciplineSchema,
} from './football.ts';

export const fixtureObservationSchema = z
  .strictObject({
    fixture: fixtureSchema,
    eligibilityComplete: z.boolean(),
    eligibleFootballerIds: z.array(idSchema).max(200),
    performances: z
      .array(
        z.strictObject({
          footballerId: idSchema,
          statistics: statisticsSchema,
          discipline: disciplineSchema.nullable(),
        }),
      )
      .max(200),
  })
  .superRefine((value, context) => {
    const ids = new Set(value.eligibleFootballerIds);
    if (
      ids.size !== value.eligibleFootballerIds.length ||
      new Set(value.performances.map((p) => p.footballerId)).size !==
        value.performances.length
    )
      context.addIssue({ code: 'custom', message: 'Duplicate footballer' });
    if (value.performances.some((p) => !ids.has(p.footballerId)))
      context.addIssue({
        code: 'custom',
        message: 'Performance outside eligibility roster',
      });
  });
export const factChangeSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('performance'),
    statistics: statisticsSchema,
    discipline: disciplineSchema.nullable(),
  }),
  z.strictObject({ kind: z.literal('release-override') }),
]);
const commandBase = {
  commandId: idSchema,
  reason: z.string().trim().min(5).max(1000),
};
export const matchDataCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...commandBase,
    kind: z.literal('disposition'),
    fixtureId: idSchema,
    expectedRevision: z.int().positive(),
    choice: fixtureDispositionChoiceSchema,
    officialReference: z.string().trim().min(5).max(2000),
  }),
  z.strictObject({
    ...commandBase,
    kind: z.literal('import'),
    expectedRevision: z.int().positive(),
    source: z.string().trim().min(2).max(100),
    observation: fixtureObservationSchema,
    providerReview: providerReportReviewSchema.optional(),
  }),
  z.strictObject({
    ...commandBase,
    kind: z.literal('override'),
    fixtureId: idSchema,
    footballerId: idSchema,
    expectedRevision: z.int().nonnegative(),
    change: factChangeSchema,
  }),
]);
export const resultCommandSchema = z.strictObject({
  ...commandBase,
  kind: z.literal('reopen'),
  gameweekId: idSchema,
  expectedResultRevision: z.int().nonnegative(),
  expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
});
export const playerRoundResultSchema = z.strictObject({
  footballerId: idSchema,
  position: positionSchema,
  minutes: z.int().nonnegative().nullable(),
  points: pointUnitsSchema,
  goals: z.int().nonnegative(),
  fixtures: z
    .array(
      z.strictObject({
        fixtureId: idSchema,
        factRevision: z.string(),
        points: pointUnitsSchema,
        breakdown: z.array(
          z.strictObject({ category: z.string(), points: pointUnitsSchema }),
        ),
      }),
    )
    .max(100),
});
export const entryResultSchema = z.strictObject({
  effectiveIds: z.array(idSchema).max(25),
  substitutions: z
    .array(z.strictObject({ out: idSchema, in: idSchema }))
    .max(8),
  captainId: idSchema.nullable(),
  captainExtra: pointUnitsSchema,
  playersTotal: pointUnitsSchema,
  transferDeduction: pointUnitsSchema,
  total: pointUnitsSchema,
  goals: z.int().nonnegative(),
  settled: z.boolean(),
  players: z.array(playerRoundResultSchema).max(25),
});
export const roundCalculationSchema = z.strictObject({
  rules: competitionRulesSchema,
  calculationVersion: z.literal('round-v1'),
  gameweekId: idSchema,
  revision: z.int().positive(),
  fingerprint: z.string().length(64),
  calculatedAt: instantSchema,
  settled: z.boolean(),
  issues: z.array(z.string()).max(1000),
  players: z.array(playerRoundResultSchema).max(2000),
});
export type FixtureObservation = z.infer<typeof fixtureObservationSchema>;
export type FactChange = z.infer<typeof factChangeSchema>;
export type MatchDataCommand = z.infer<typeof matchDataCommandSchema>;
export type ResultCommand = z.infer<typeof resultCommandSchema>;
export type PlayerRoundResult = z.infer<typeof playerRoundResultSchema>;
export type EntryResult = z.infer<typeof entryResultSchema>;
export type RoundCalculation = z.infer<typeof roundCalculationSchema>;

export const providerNormalizationPreviewSchema = z.strictObject({
  selection: providerNormalizationSelectionSchema,
  adapterVersion: z.enum([
    'api-football-reviewed-v1',
    'api-football-reviewed-v2',
    'api-football-reviewed-v3',
  ]),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  observation: fixtureObservationSchema,
  binding: providerSeasonBindingSchema,
  mappings: z.array(providerIdentitySchema).max(203),
  sources: z
    .array(
      z.strictObject({
        attemptId: idSchema,
        evidenceId: idSchema,
        checksum: z.string(),
      }),
    )
    .length(4),
  issues: z.array(z.string().min(1).max(300)).max(1000),
  replacesCompleteReport: z.boolean(),
});
export type ProviderNormalizationPreview = z.infer<
  typeof providerNormalizationPreviewSchema
>;
