import { z } from 'zod';
import { idSchema, instantSchema } from './common.ts';
export const groupHandoverSchema = z.strictObject({
  id: idSchema,
  groupId: idSchema,
  fromAccountId: z.string().min(1).max(200),
  toAccountId: z.string().min(1).max(200),
  recipientEntryId: idSchema,
  groupRevision: z.int().positive(),
  createdAt: instantSchema,
  expiresAt: instantSchema,
});
const common = {
  commandId: idSchema,
  competitionId: idSchema,
  groupId: idSchema,
  expectedRevision: z.int().positive(),
};
export const groupHandoverCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...common,
    kind: z.literal('offer'),
    recipientEntryId: idSchema,
  }),
  z.strictObject({
    ...common,
    kind: z.enum(['accept', 'decline', 'cancel']),
    offerId: idSchema,
  }),
]);
export const groupHandoverResultSchema = z.strictObject({
  groupId: idSchema,
  revision: z.int().positive(),
  organizerId: z.string().min(1).max(200),
  offerId: idSchema.nullable(),
});
export type GroupHandover = z.infer<typeof groupHandoverSchema>;
export type GroupHandoverCommand = z.infer<typeof groupHandoverCommandSchema>;
