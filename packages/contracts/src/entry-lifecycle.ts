import { z } from 'zod';
import { idSchema, instantSchema } from './common.ts';
const common = {
  commandId: idSchema,
  competitionId: idSchema,
  entryId: idSchema,
  expectedRevision: z.int().positive(),
};
export const entryLifecycleCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...common, kind: z.literal('retire') }),
  z.strictObject({ ...common, kind: z.literal('discard-draft') }),
  z.strictObject({
    ...common,
    kind: z.literal('rename'),
    name: z.string().trim().min(2).max(60),
  }),
]);
export const entryLifecycleResultSchema = z.strictObject({
  entryId: idSchema,
  revision: z.int().positive(),
  retiredAt: instantSchema.nullable(),
  discarded: z.boolean(),
});
export type EntryLifecycleCommand = z.infer<typeof entryLifecycleCommandSchema>;
