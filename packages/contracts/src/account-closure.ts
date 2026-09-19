import { z } from 'zod';
import { idSchema, instantSchema, localizedSchema } from './common.ts';
export const accountClosurePreviewSchema = z.strictObject({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  entries: z.array(
    z.strictObject({
      id: idSchema,
      competitionId: idSchema,
      name: z.string(),
      status: z.enum(['draft', 'active', 'retired']),
      revision: z.int().positive(),
    }),
  ),
  groups: z.array(z.strictObject({ id: idSchema, name: z.string() })),
  staffRoles: z.array(z.string()),
  awards: z.array(
    z.strictObject({
      poolId: idSchema,
      name: localizedSchema,
      state: z.enum(['unfulfilled', 'correction-open']),
    }),
  ),
  messageCount: z.int().nonnegative(),
  archiveCount: z.int().nonnegative(),
  canClose: z.boolean(),
});
export const accountClosureCommandSchema = z.strictObject({
  commandId: idSchema,
  expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  confirmation: z.literal('CLOSE'),
});
export const accountClosureResultSchema = z.strictObject({
  closedAt: instantSchema,
});
export type AccountClosurePreview = z.infer<typeof accountClosurePreviewSchema>;
export type AccountClosureCommand = z.infer<typeof accountClosureCommandSchema>;
