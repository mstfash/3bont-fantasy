import { z } from 'zod';
import { idSchema, instantSchema, localizedSchema } from './common.ts';
import { competitionRulesSchema } from './rules.ts';

const details = {
  name: localizedSchema,
  description: localizedSchema,
  entryLimit: z.int().min(1).max(100),
  registrationOpens: instantSchema,
  registrationCloses: instantSchema,
};
export const competitionCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('create'),
    commandId: idSchema,
    seasonId: idSchema,
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
      .max(80),
    ...details,
    rules: competitionRulesSchema,
    reason: z.string().trim().min(5).max(1000),
  }),
  z.strictObject({
    kind: z.literal('update'),
    commandId: idSchema,
    competitionId: idSchema,
    expectedRevision: z.int().positive(),
    economicEffectiveGameweekId: idSchema.optional(),
    expectedImpactFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    ...details,
    rules: competitionRulesSchema,
    reason: z.string().trim().min(5).max(1000),
  }),
  z.strictObject({
    kind: z.literal('publish'),
    commandId: idSchema,
    competitionId: idSchema,
    expectedRevision: z.int().positive(),
    reason: z.string().trim().min(5).max(1000),
  }),
]);
export type CompetitionCommand = z.infer<typeof competitionCommandSchema>;

export const competitionUpdateSchema = competitionCommandSchema.options[1];
export type CompetitionUpdate = z.infer<typeof competitionUpdateSchema>;
