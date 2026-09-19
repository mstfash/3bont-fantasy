import { z } from 'zod';
import { idSchema, instantSchema, localizedSchema } from './common.ts';

export const ruleCategorySchema = z.enum([
  'squad',
  'ranking',
  'transfer',
  'scoring',
  'gameweek',
  'enabledChips',
  'chipInventory',
  'chipWindows',
  'deadlineOffsetMinutes',
  'correctionWindowHours',
  'pricing',
]);
export const competitionImpactSchema = z.strictObject({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  competitionId: idSchema,
  revision: z.int().positive(),
  changedCategories: z.array(ruleCategorySchema),
  metadataChanges: z.array(
    z.enum([
      'name',
      'description',
      'entryLimit',
      'registrationOpens',
      'registrationCloses',
    ]),
  ),
  entries: z.strictObject({
    accounts: z.int().nonnegative(),
    draft: z.int().nonnegative(),
    active: z.int().nonnegative(),
    retired: z.int().nonnegative(),
    maximumOwned: z.int().nonnegative(),
    activeAboveProposedCarryCap: z.int().nonnegative(),
  }),
  entryLimit: z.strictObject({ before: z.int(), after: z.int() }),
  economicStart: z.int().positive().nullable(),
  noticeRequired: z.boolean(),
  rounds: z.array(
    z.strictObject({
      id: idSchema,
      number: z.int().positive(),
      name: localizedSchema,
      deadline: instantSchema,
      beforeVersion: z.int().positive(),
      afterVersion: z.int().positive(),
      changedCategories: z.array(ruleCategorySchema),
      disposition: z.enum(['updated', 'locked', 'notice', 'unchanged']),
    }),
  ),
});
export type CompetitionImpact = z.infer<typeof competitionImpactSchema>;
