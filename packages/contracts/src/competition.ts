import { z } from 'zod';
import {
  fantasyTicksSchema,
  idSchema,
  instantSchema,
  localizedSchema,
  pointUnitsSchema,
} from './common.ts';
import {
  chipInventorySchema,
  chipSchema,
  competitionRulesSchema,
} from './rules.ts';

export const competitionSchema = z
  .strictObject({
    id: idSchema,
    seasonId: idSchema,
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
      .max(80),
    name: localizedSchema,
    description: localizedSchema,
    status: z.enum(['draft', 'published', 'running', 'completed', 'archived']),
    rules: competitionRulesSchema,
    entryLimit: z.int().min(1).max(100),
    registrationOpens: instantSchema,
    registrationCloses: instantSchema,
    firstLockedAt: instantSchema.nullable(),
    revision: z.int().positive(),
  })
  .refine(
    (c) => Date.parse(c.registrationCloses) > Date.parse(c.registrationOpens),
  );
export const gameweekSchema = z.strictObject({
  id: idSchema,
  competitionId: idSchema,
  number: z.int().positive(),
  name: localizedSchema,
  deadline: instantSchema,
  status: z.enum(['upcoming', 'locked', 'provisional', 'finalized', 'review']),
  rules: competitionRulesSchema,
  resultRevision: z.int().nonnegative(),
  lastMaterialChangeAt: instantSchema.nullable(),
  finalizedAt: instantSchema.nullable(),
  issues: z.array(z.string().min(1).max(1000)).max(1000),
});
const captaincy = z
  .strictObject({ captainId: idSchema, viceCaptainId: idSchema })
  .nullable();
export const rosterSchema = z.strictObject({
  holdings: z
    .array(
      z.strictObject({
        footballerId: idSchema,
        purchasePrice: fantasyTicksSchema,
      }),
    )
    .max(25),
  bank: fantasyTicksSchema,
  starterIds: z.array(idSchema).max(22),
  reserveIds: z.array(idSchema).max(8),
  captaincy,
});
export const editingEntrySchema = z.strictObject({
  roster: rosterSchema,
  permanentBaseline: rosterSchema.nullable(),
  freeTransfers: z.int().min(0).max(100),
  transfersThisRound: z.int().nonnegative(),
  chip: chipSchema.nullable(),
  inventory: chipInventorySchema,
  beforeFreeHit: z
    .strictObject({ roster: rosterSchema, transfers: z.int().nonnegative() })
    .nullable(),
});
export const entrySchema = z.strictObject({
  id: idSchema,
  competitionId: idSchema,
  accountId: z.string().min(1).max(200),
  name: z.string().trim().min(2).max(60),
  status: z.enum(['draft', 'active', 'retired']),
  activatedAt: instantSchema.nullable(),
  firstGameweekId: idSchema,
  editingGameweekId: idSchema,
  state: editingEntrySchema,
  revision: z.int().positive(),
});
export const lockedEntrySchema = z.strictObject({
  roster: rosterSchema,
  chip: chipSchema.nullable(),
  transferDeduction: pointUnitsSchema.refine((n) => n >= 0),
});
export type Competition = z.infer<typeof competitionSchema>;
export type Gameweek = z.infer<typeof gameweekSchema>;
export type Entry = z.infer<typeof entrySchema>;
