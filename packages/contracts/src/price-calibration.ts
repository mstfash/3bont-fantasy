import { z } from 'zod';
import {
  fantasyTicksSchema,
  idSchema,
  instantSchema,
  pointUnitsSchema,
  positionSchema,
} from './common.ts';
import { pricingPolicySchema, squadRulesSchema } from './rules.ts';
const candidateSchema = z.strictObject({
  label: z.string().trim().min(1).max(80),
  rules: pricingPolicySchema,
});
export const priceCalibrationCommandSchema = z
  .strictObject({
    commandId: idSchema,
    competitionId: idSchema,
    reason: z.string().trim().min(5).max(1000),
    candidates: z.array(candidateSchema).min(1).max(3),
  })
  .refine(
    (c) =>
      new Set(c.candidates.map((p) => p.label)).size === c.candidates.length,
  );
const playerSchema = z.strictObject({
  footballerId: idSchema,
  clubId: idSchema,
  position: positionSchema,
  price: fantasyTicksSchema,
  pinned: z.boolean(),
  selectable: z.boolean(),
});
const observationSchema = z.strictObject({
  footballerId: idSchema,
  gameweekId: idSchema,
  revision: z.int().positive(),
  number: z.int().positive(),
  minutes: z.int().nonnegative().nullable(),
  points: pointUnitsSchema,
});
export const priceCalibrationBasisSchema = z.strictObject({
  competitionId: idSchema,
  competitionRevision: z.int().positive(),
  cutoff: instantSchema,
  synthetic: z.boolean(),
  squad: squadRulesSchema,
  players: z.array(playerSchema).min(1).max(1000),
  rounds: z
    .array(
      z.strictObject({
        id: idSchema,
        number: z.int().positive(),
        deadline: instantSchema,
        finalizedAt: instantSchema.nullable(),
        revision: z.int().nonnegative(),
        observations: z.array(observationSchema).max(1000),
      }),
    )
    .max(100),
});
const marketSchema = z.strictObject({
  totalTicks: z.string().regex(/^\d+$/u),
  positions: z
    .array(
      z.strictObject({
        position: positionSchema,
        count: z.int().nonnegative(),
        totalTicks: z.string().regex(/^\d+$/u),
      }),
    )
    .length(4),
  minimumSquadTicks: z.string().regex(/^\d+$/u).nullable(),
  affordable: z.boolean(),
  cheapestSquad: z.array(idSchema).max(100),
});
const reasonSchema = z.enum([
  'pinned',
  'insufficient-history',
  'incomplete-data',
  'insufficient-minutes',
  'rise',
  'fall',
  'within-band',
  'at-bound',
]);
const outputSchema = z.strictObject({
  version: z.literal('price-calibration-v1'),
  baseline: marketSchema,
  results: z
    .array(
      z.strictObject({
        label: z.string(),
        batches: z.array(
          z.strictObject({
            at: instantSchema,
            editingGameweekId: idSchema,
            sourceGameweekIds: z.array(idSchema),
            changes: z.array(
              z.strictObject({
                footballerId: idSchema,
                oldPrice: fantasyTicksSchema,
                newPrice: fantasyTicksSchema,
                reason: reasonSchema,
              }),
            ),
            holds: z.partialRecord(reasonSchema, z.int().nonnegative()),
            market: marketSchema,
          }),
        ),
        final: marketSchema,
        finalPrices: z.array(
          z.strictObject({ footballerId: idSchema, price: fantasyTicksSchema }),
        ),
        deferredGameweekIds: z.array(idSchema),
      }),
    )
    .max(3),
});
export const priceCalibrationReportSchema = z.strictObject({
  id: idSchema,
  basisFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  basis: priceCalibrationBasisSchema,
  candidates: z.array(candidateSchema).max(3),
  output: outputSchema,
});
export const priceCalibrationResultSchema = z.strictObject({
  reportId: idSchema,
});
export type PriceCalibrationCommand = z.infer<
  typeof priceCalibrationCommandSchema
>;
export type PriceCalibrationReport = z.infer<
  typeof priceCalibrationReportSchema
>;
