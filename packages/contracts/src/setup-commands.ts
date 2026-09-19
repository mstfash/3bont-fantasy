import { initialPriceReviewSchema } from './initial-pricing.ts';
import { z } from 'zod';
import {
  fantasyTicksSchema,
  idSchema,
  instantSchema,
  localizedSchema,
  positionSchema,
} from './common.ts';

const common = {
  commandId: idSchema,
  competitionId: idSchema,
  expectedRevision: z.int().positive(),
  reason: z.string().trim().min(5).max(1000),
};
export const setupCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...common,
    kind: z.literal('pool'),
    initialPriceReview: initialPriceReviewSchema.optional(),
    players: z
      .array(
        z.strictObject({
          footballerId: idSchema,
          position: positionSchema,
          price: fantasyTicksSchema,
          selectable: z.boolean(),
          manuallyPinned: z.boolean(),
        }),
      )
      .min(1)
      .max(2000),
  }),
  z.strictObject({
    ...common,
    kind: z.literal('round'),
    gameweekId: idSchema,
    number: z.int().min(1).max(200),
    name: localizedSchema,
    deadline: instantSchema,
    fixtureIds: z.array(idSchema).max(100),
  }),
]);
export type SetupCommand = z.infer<typeof setupCommandSchema>;
