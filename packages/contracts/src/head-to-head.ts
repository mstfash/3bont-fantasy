import { z } from 'zod';
import { idSchema, instantSchema } from './common.ts';
const roundIdsSchema = z
  .array(idSchema)
  .min(1)
  .max(200)
  .refine((ids) => new Set(ids).size === ids.length);
export const headToHeadEditionSchema = z.strictObject({
  id: idSchema,
  groupId: idSchema,
  competitionId: idSchema,
  name: z.string().trim().min(2).max(80),
  status: z.enum(['draft', 'registration', 'published']),
  revision: z.int().positive(),
  gameweekIds: roundIdsSchema,
  seed: z.string().regex(/^[a-f0-9]{32}$/u),
  tieBreak: z.enum(['shared', 'fantasy-points']),
  tablePoints: z
    .strictObject({
      win: z.int().min(1).max(100),
      draw: z.int().min(0).max(100),
      loss: z.int().min(0).max(100),
    })
    .refine((p) => p.win > p.draw && p.draw >= p.loss),
  createdAt: instantSchema,
  publishedAt: instantSchema.nullable(),
  schedule: z
    .array(
      z.strictObject({
        gameweekId: idSchema,
        homeId: idSchema,
        awayId: idSchema.nullable(),
        cycle: z.int().positive(),
      }),
    )
    .max(20000),
});
const common = {
  commandId: idSchema,
  competitionId: idSchema,
  groupId: idSchema,
};
export const headToHeadCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...common,
    kind: z.literal('create'),
    name: headToHeadEditionSchema.shape.name,
    gameweekIds: roundIdsSchema,
    tieBreak: headToHeadEditionSchema.shape.tieBreak,
    tablePoints: headToHeadEditionSchema.shape.tablePoints,
  }),
  z.strictObject({
    ...common,
    kind: z.literal('open-registration'),
    editionId: idSchema,
    expectedRevision: z.int().positive(),
  }),
  z.strictObject({
    ...common,
    kind: z.literal('register'),
    editionId: idSchema,
    entryId: idSchema,
  }),
  z.strictObject({
    ...common,
    kind: z.literal('withdraw'),
    editionId: idSchema,
    entryId: idSchema,
  }),
  z.strictObject({
    ...common,
    kind: z.literal('publish'),
    editionId: idSchema,
    expectedRevision: z.int().positive(),
    expectedRoster: z
      .array(idSchema)
      .min(2)
      .max(200)
      .refine((ids) => new Set(ids).size === ids.length),
  }),
]);
export const headToHeadCommandResultSchema = z.strictObject({
  editionId: idSchema,
  revision: z.int().positive(),
});
export type HeadToHeadEdition = z.infer<typeof headToHeadEditionSchema>;
export type HeadToHeadCommand = z.infer<typeof headToHeadCommandSchema>;
