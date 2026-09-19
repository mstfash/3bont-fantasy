import { z } from 'zod';
import { idSchema, instantSchema } from './common.ts';
export const AUTOMATIC_PROVIDER_ADAPTER = 'api-football-reviewed-v3' as const;
const settings = {
  enabled: z.boolean(),
  adapterVersion: z.literal(AUTOMATIC_PROVIDER_ADAPTER),
  maximumSourceAgeMinutes: z.int().min(5).max(1440),
  eligibilityEvidenceReference: z.string().trim().min(5).max(2000),
};
export const providerAcceptancePolicySchema = z.strictObject({
  bindingId: idSchema,
  accountId: idSchema,
  revision: z.int().positive(),
  ...settings,
  updatedAt: instantSchema,
});
export const providerAcceptanceCommandSchema = z
  .strictObject({
    commandId: idSchema,
    bindingId: idSchema,
    accountId: idSchema,
    expectedRevision: z.int().nonnegative(),
    ...settings,
    reason: z.string().trim().min(5).max(1000),
    completeEligibilityConfirmed: z.boolean(),
  })
  .refine((value) => !value.enabled || value.completeEligibilityConfirmed, {
    message:
      'Complete eligibility evidence must be confirmed before enabling acceptance',
  });
export const providerAcceptanceSchema = z.strictObject({
  batchId: idSchema,
  fixtureId: idSchema,
  policy: providerAcceptancePolicySchema,
  state: z.enum(['accepted', 'held']),
  sourceAt: instantSchema.nullable(),
  decidedAt: instantSchema,
  reportEvidenceId: idSchema.nullable(),
  fixtureRevision: z.int().positive().nullable(),
  normalizationFingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .nullable(),
  issues: z.array(z.string().min(1).max(300)).max(1000),
});
export type ProviderAcceptancePolicy = z.infer<
  typeof providerAcceptancePolicySchema
>;
export type ProviderAcceptanceCommand = z.infer<
  typeof providerAcceptanceCommandSchema
>;
export type ProviderAcceptance = z.infer<typeof providerAcceptanceSchema>;
