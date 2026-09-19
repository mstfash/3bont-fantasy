import { z } from 'zod';
import { chipInventorySchema } from './rules.ts';
import { idSchema, instantSchema, localizedSchema } from './common.ts';
const amounts = chipInventorySchema.refine((value) =>
  Object.values(value).some((n) => n > 0),
);
export const chipGrantSchema = z.strictObject({
  id: idSchema,
  competitionId: idSchema,
  gameweekId: idSchema,
  amounts,
  announcement: localizedSchema,
  announcedAt: instantSchema,
});
export const chipGrantCommandSchema = z.strictObject({
  commandId: idSchema,
  competitionId: idSchema,
  expectedRevision: z.int().positive(),
  gameweekId: idSchema,
  amounts,
  announcement: localizedSchema,
  reason: z.string().trim().min(5).max(1000),
});
export type ChipGrant = z.infer<typeof chipGrantSchema>;
export type ChipGrantCommand = z.infer<typeof chipGrantCommandSchema>;
