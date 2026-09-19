import { z } from 'zod';
import { idSchema, instantSchema } from './common.ts';
export const accountModerationCommandSchema = z.strictObject({
  commandId: idSchema,
  accountId: z.string().min(1).max(200),
  expectedSuspendedUntil: instantSchema.nullable(),
  until: instantSchema.nullable(),
  reason: z.string().trim().min(5).max(1000),
  evidenceReference: z.string().trim().min(5).max(1000),
});
export const accountModerationResultSchema = z.strictObject({
  accountId: z.string(),
  suspendedUntil: instantSchema.nullable(),
});
export type AccountModerationCommand = z.infer<
  typeof accountModerationCommandSchema
>;
