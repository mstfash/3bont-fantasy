import { z } from 'zod';
import { idSchema } from './common.ts';
import { seasonSchema, clubSchema, footballerSchema } from './football.ts';
const base = {
  commandId: idSchema,
  expectedFingerprint: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .nullable(),
  reason: z.string().trim().min(5).max(1000),
};
export const catalogueCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...base, kind: z.literal('season'), season: seasonSchema }),
  z.strictObject({ ...base, kind: z.literal('club'), club: clubSchema }),
  z.strictObject({
    ...base,
    kind: z.literal('footballer'),
    footballer: footballerSchema,
  }),
]);
export type CatalogueCommand = z.infer<typeof catalogueCommandSchema>;
