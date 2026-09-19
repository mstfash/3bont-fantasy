import { z } from 'zod';
import { idSchema } from './common.ts';
export const emptyGameweekCommandSchema = z.strictObject({
  commandId: idSchema,
  gameweekId: idSchema,
  expectedResultRevision: z.int().nonnegative(),
  expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  reason: z.string().trim().min(5).max(1000),
});
export type EmptyGameweekCommand = z.infer<typeof emptyGameweekCommandSchema>;
