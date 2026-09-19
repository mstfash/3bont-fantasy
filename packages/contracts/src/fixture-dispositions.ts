import { z } from 'zod';
import { idSchema, instantSchema } from './common.ts';
import { fixtureSchema } from './football.ts';
export const fixtureDispositionChoiceSchema = z.discriminatedUnion('outcome', [
  z.strictObject({
    outcome: z.literal('void'),
    replacementFixtureId: z.null(),
  }),
  z.strictObject({
    outcome: z.literal('replay'),
    replacementFixtureId: idSchema,
  }),
  z.strictObject({
    outcome: z.literal('awarded'),
    homeGoals: z.int().min(0).max(100),
    awayGoals: z.int().min(0).max(100),
    replacementFixtureId: z.null(),
  }),
  z.strictObject({
    outcome: z.literal('release'),
    replacementFixtureId: z.null(),
  }),
]);
export const fixtureDispositionSchema = z.strictObject({
  id: idSchema,
  fixtureId: idSchema,
  revision: z.int().positive(),
  choice: fixtureDispositionChoiceSchema,
  officialReference: z.string().trim().min(5).max(2000),
  reason: z.string().trim().min(5).max(1000),
  actorId: z.string().min(1),
  recordedAt: instantSchema,
  previousFixture: fixtureSchema,
});
export type FixtureDisposition = z.infer<typeof fixtureDispositionSchema>;
