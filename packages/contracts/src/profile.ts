import { z } from 'zod';
import { idSchema } from './common.ts';
export const displayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .refine(
    (name) => !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(name),
    'Use a plain display name',
  );
export const profileCommandSchema = z.strictObject({
  commandId: idSchema,
  expectedDisplayName: z.string().max(1000),
  displayName: displayNameSchema,
});
export const profileResultSchema = z.strictObject({
  accountId: z.string().min(1).max(200),
});
export type ProfileCommand = z.infer<typeof profileCommandSchema>;
