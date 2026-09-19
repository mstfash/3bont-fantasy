import { z } from 'zod';
import { idSchema } from './common.ts';
import { chipSchema } from './rules.ts';

const lineup = z.strictObject({
  starterIds: z.array(idSchema).max(22),
  reserveIds: z.array(idSchema).max(8),
  captaincy: z
    .strictObject({ captainId: idSchema, viceCaptainId: idSchema })
    .nullable(),
});
const quote = z.strictObject({
  footballerId: idSchema,
  priceRevision: z.int().positive(),
});
const base = {
  commandId: idSchema,
  competitionId: idSchema,
  gameweekId: idSchema,
};
const existing = {
  ...base,
  entryId: idSchema,
  expectedRevision: z.int().positive(),
};

export const entryCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...base,
    kind: z.literal('create'),
    name: z.string().trim().min(2).max(60),
    lineup,
    players: z.array(quote).min(2).max(25),
  }),
  z.strictObject({ ...existing, kind: z.literal('lineup'), lineup }),
  z.strictObject({
    ...existing,
    kind: z.literal('transfer'),
    lineup,
    transfers: z
      .array(z.strictObject({ out: idSchema, in: idSchema }))
      .min(1)
      .max(25),
    quotes: z.array(quote).min(2).max(50),
  }),
  z.strictObject({
    ...existing,
    kind: z.literal('chip'),
    chip: chipSchema.nullable(),
  }),
]);
export type EntryCommand = z.infer<typeof entryCommandSchema>;
