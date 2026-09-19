import { z } from 'zod';
import {
  fantasyTicksSchema,
  idSchema,
  instantSchema,
  pointUnitsSchema,
} from './common.ts';
export const priceProposalSchema = z.strictObject({
  footballerId: idSchema,
  oldPrice: fantasyTicksSchema,
  newPrice: fantasyTicksSchema,
  priceRevision: z.int().positive(),
  reason: z.enum([
    'pinned',
    'insufficient-history',
    'incomplete-data',
    'insufficient-minutes',
    'rise',
    'fall',
    'within-band',
    'at-bound',
  ]),
  pointsSum: z.string().regex(/^-?\d+$/u),
  minutesSum: z.int().nonnegative(),
  observations: z
    .array(
      z.strictObject({
        gameweekId: idSchema,
        revision: z.int().positive(),
        number: z.int().positive(),
        minutes: z.int().nonnegative().nullable(),
        points: pointUnitsSchema,
      }),
    )
    .max(20),
});
export const pricePreviewSchema = z.strictObject({
  competitionId: idSchema,
  fingerprint: z.string().length(64),
  editingGameweekId: idSchema.nullable(),
  publishBefore: instantSchema.nullable(),
  sourceGameweekIds: z.array(idSchema).max(200),
  blocked: z
    .enum([
      'no-new-finalized-round',
      'results-under-review',
      'no-editing-round',
      'freeze-window',
      'already-published-for-round',
    ])
    .nullable(),
  changes: z.array(priceProposalSchema).max(2000),
  netChange: z.int(),
  calculationVersion: z.literal('performance-price-v1'),
});
export const priceBatchCommandSchema = z.strictObject({
  commandId: idSchema,
  competitionId: idSchema,
  expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  reason: z.string().trim().min(5).max(1000),
});
export type PricePreview = z.infer<typeof pricePreviewSchema>;
export type PriceBatchCommand = z.infer<typeof priceBatchCommandSchema>;
