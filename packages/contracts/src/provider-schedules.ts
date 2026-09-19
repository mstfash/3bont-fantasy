import { z } from 'zod';
import { idSchema, instantSchema } from './common.ts';
import { providerRequestSchema } from './providers.ts';
const settings = {
  enabled: z.boolean(),
  liveIntervalMinutes: z.int().min(5).max(1440),
  correctionIntervalMinutes: z.int().min(60).max(1440),
  beforeKickoffMinutes: z.int().min(0).max(120),
  activeHours: z.int().min(3).max(24),
  correctionHours: z.int().min(24).max(168),
  evidenceReference: z.string().trim().min(5).max(2000),
};
export const providerScheduleSchema = z
  .strictObject({
    id: idSchema,
    accountId: idSchema,
    bindingId: idSchema,
    revision: z.int().positive(),
    ...settings,
    updatedAt: instantSchema,
  })
  .refine(
    (value) => value.correctionIntervalMinutes >= value.liveIntervalMinutes,
    { message: 'Correction interval must be at least the active interval' },
  );
export const providerScheduleCommandSchema = z
  .strictObject({
    commandId: idSchema,
    accountId: idSchema,
    bindingId: idSchema,
    expectedRevision: z.int().nonnegative(),
    ...settings,
    reason: z.string().trim().min(5).max(1000),
  })
  .refine(
    (value) => value.correctionIntervalMinutes >= value.liveIntervalMinutes,
    { message: 'Correction interval must be at least the active interval' },
  );
export const providerCollectionSchema = z.strictObject({
  id: idSchema,
  scheduleId: idSchema,
  scheduleRevision: z.int().positive(),
  fixtureId: idSchema,
  fixtureKickoff: instantSchema,
  mappingId: idSchema,
  mappingRevision: z.int().positive(),
  requests: z.array(providerRequestSchema).length(4),
  state: z.enum(['queued', 'collecting', 'complete', 'held', 'cancelled']),
  step: z.int().min(0).max(4),
  plannedAt: instantSchema,
  startedAt: instantSchema.nullable(),
  finishedAt: instantSchema.nullable(),
  code: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,79}$/u)
    .nullable(),
});
export type ProviderSchedule = z.infer<typeof providerScheduleSchema>;
export type ProviderScheduleCommand = z.infer<
  typeof providerScheduleCommandSchema
>;
export type ProviderCollection = z.infer<typeof providerCollectionSchema>;
