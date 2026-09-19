import { z } from 'zod';
import {
  fantasyTicksSchema,
  httpsUrlSchema,
  idSchema,
  instantSchema,
  localizedSchema,
  positionSchema,
} from './common.ts';

export const seasonSchema = z.strictObject({
  id: idSchema,
  name: localizedSchema,
  startsAt: instantSchema,
  endsAt: instantSchema,
  synthetic: z.boolean(),
});
export const clubSchema = z.strictObject({
  id: idSchema,
  seasonId: idSchema,
  name: localizedSchema,
  shortName: z.string().min(2).max(5),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/u),
});
export const valuationSchema = z.strictObject({
  amountMinor: z.int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  asOf: instantSchema,
  sourceName: z.string().min(1).max(200),
  sourceUrl: httpsUrlSchema,
  licensedForDisplay: z.boolean(),
});
export const footballerSchema = z.strictObject({
  id: idSchema,
  seasonId: idSchema,
  clubId: idSchema,
  name: localizedSchema,
  defaultPosition: positionSchema,
  shirtNumber: z.int().min(0).max(99).nullable().optional(),
  status: z.enum(['available', 'injured', 'suspended', 'unavailable']),
  valuation: valuationSchema.nullable(),
  synthetic: z.boolean(),
});
export const poolPlayerSchema = z.strictObject({
  competitionId: idSchema,
  footballerId: idSchema,
  position: positionSchema,
  price: fantasyTicksSchema,
  priceRevision: z.int().positive(),
  selectable: z.boolean(),
  manuallyPinned: z.boolean(),
});
const statistic = z.int().min(0).max(10000).nullable();
export const statisticsSchema = z.strictObject({
  minutes: statistic,
  goals: statistic,
  assists: statistic,
  ownGoals: statistic,
  penaltyMisses: statistic,
  concededWhileOnPitch: statistic,
  concededAfterDismissal: statistic,
  savesIncludingPenalties: statistic,
  penaltySaves: statistic,
});
export const disciplineSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('yellow') }),
  z.strictObject({ kind: z.literal('second-yellow') }),
  z.strictObject({ kind: z.literal('straight-red'), priorYellow: z.boolean() }),
]);
export const performanceSchema = z.strictObject({
  fixtureId: idSchema,
  footballerId: idSchema,
  factRevision: z.string().min(1).max(100),
  position: positionSchema,
  statistics: statisticsSchema,
  discipline: disciplineSchema.nullable(),
});
export const fixtureSchema = z
  .strictObject({
    id: idSchema,
    seasonId: idSchema,
    homeClubId: idSchema,
    awayClubId: idSchema,
    kickoff: instantSchema,
    status: z.enum([
      'scheduled',
      'live',
      'suspended',
      'postponed',
      'finished',
      'void',
    ]),
    homeGoals: z.int().nonnegative().nullable(),
    awayGoals: z.int().nonnegative().nullable(),
    factsComplete: z.boolean(),
    revision: z.int().positive(),
  })
  .refine((f) => f.homeClubId !== f.awayClubId);
export type Season = z.infer<typeof seasonSchema>;
export type Club = z.infer<typeof clubSchema>;
export type Footballer = z.infer<typeof footballerSchema>;
export type PoolPlayer = z.infer<typeof poolPlayerSchema>;
export type Fixture = z.infer<typeof fixtureSchema>;
