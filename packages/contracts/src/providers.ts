import { z } from 'zod';
import { idSchema, instantSchema } from './common.ts';
export const providerAccountSchema = z.strictObject({
  id: idSchema,
  provider: z.literal('api-football-direct'),
  revision: z.int().positive(),
  state: z.enum(['paused', 'enabled']),
  dailyLimit: z.int().min(1).max(1500000).nullable(),
  minuteLimit: z.int().min(1).max(10000).nullable(),
  resetAnchor: instantSchema.nullable(),
  evidenceReference: z.string().min(5).max(1000).nullable(),
  dedicatedKeyConfirmed: z.boolean(),
  reconciledAt: instantSchema.nullable(),
});
const queryId = z.int().positive();
export const providerRequestSchema = z.discriminatedUnion('resource', [
  z.strictObject({ resource: z.literal('status') }),
  z.strictObject({
    resource: z.literal('leagues'),
    country: z.literal('Egypt'),
    season: z.int().min(2000).max(2200),
  }),
  z.strictObject({
    resource: z.literal('teams'),
    league: queryId,
    season: z.int().min(2000).max(2200),
  }),
  z.strictObject({
    resource: z.literal('players'),
    league: queryId,
    season: z.int().min(2000).max(2200),
    page: z.int().min(1).max(1000),
  }),
  z.strictObject({
    resource: z.literal('fixtures'),
    league: queryId,
    season: z.int().min(2000).max(2200),
  }),
  z.strictObject({ resource: z.literal('fixtures/events'), fixture: queryId }),
  z.strictObject({ resource: z.literal('fixtures/lineups'), fixture: queryId }),
  z.strictObject({ resource: z.literal('fixtures/players'), fixture: queryId }),
]);
export const providerCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('configure'),
    commandId: idSchema,
    expectedRevision: z.int().nonnegative(),
    dailyLimit: z.int().min(1).max(1500000),
    minuteLimit: z.int().min(1).max(10000),
    resetAnchor: instantSchema,
    dedicatedKeyConfirmed: z.literal(true),
    reason: z.string().trim().min(5).max(1000),
    evidenceReference: z.string().trim().min(5).max(1000),
  }),
  z.strictObject({
    kind: z.literal('reconcile'),
    commandId: idSchema,
    expectedRevision: z.int().positive(),
    usedToday: z.int().nonnegative().max(1500000),
    windowStart: instantSchema,
    reason: z.string().trim().min(5).max(1000),
    evidenceReference: z.string().trim().min(5).max(1000),
  }),
  z.strictObject({
    kind: z.literal('pause'),
    commandId: idSchema,
    expectedRevision: z.int().positive(),
    reason: z.string().trim().min(5).max(1000),
  }),
]);
export const providerCommandResultSchema = z.strictObject({
  account: providerAccountSchema,
});
export type ProviderAccount = z.infer<typeof providerAccountSchema>;
export type ProviderRequest = z.infer<typeof providerRequestSchema>;
export type ProviderCommand = z.infer<typeof providerCommandSchema>;
