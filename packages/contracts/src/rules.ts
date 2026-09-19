import { z } from 'zod';
import { fantasyTicks, pointUnits, validateSquadRules } from '@fantasy/domain';
import { fantasyTicksSchema, pointUnitsSchema } from './common.ts';

const count = z.int().min(0).max(25);
const positionCounts = z.strictObject({
  GK: count,
  DEF: count,
  MID: count,
  FWD: count,
});
const positionPoints = z.strictObject({
  GK: pointUnitsSchema,
  DEF: pointUnitsSchema,
  MID: pointUnitsSchema,
  FWD: pointUnitsSchema,
});
export const squadRulesSchema = z
  .strictObject({
    squadSize: z.int().min(2).max(25),
    quotas: positionCounts,
    starterCount: z.int().min(1).max(22),
    formations: z.array(positionCounts).min(1).max(100),
    startingBudget: fantasyTicksSchema,
    clubCap: z.int().min(1).max(25),
    captaincyEnabled: z.boolean(),
  })
  .superRefine((value, context) => {
    for (const issue of validateSquadRules(value))
      context.addIssue({
        code: 'custom',
        message: issue.code,
        path: [issue.path],
      });
    if (value.squadSize - value.starterCount > 8)
      context.addIssue({
        code: 'custom',
        message: 'At most eight reserves are supported',
        path: ['squadSize'],
      });
  });
export const transferRulesSchema = z
  .strictObject({
    allowance: z.int().min(0).max(100),
    carryCap: z.int().min(0).max(100),
    extraTransferCost: pointUnitsSchema.refine((value) => value >= 0),
    sellingPolicy: z.enum(['half-gain-full-loss', 'current-price']),
  })
  .refine((value) => value.carryCap >= value.allowance, {
    message: 'Carry cap must cover the allowance',
    path: ['carryCap'],
  });
export const scoringRulesSchema = z.strictObject({
  version: z.string().trim().min(1).max(100),
  appearance: z.strictObject({
    thresholdMinutes: z.int().min(1).max(180),
    short: pointUnitsSchema,
    full: pointUnitsSchema,
  }),
  goal: positionPoints,
  assist: pointUnitsSchema,
  cleanSheet: z.strictObject({
    thresholdMinutes: z.int().min(1).max(180),
    award: positionPoints,
  }),
  conceded: z.strictObject({
    perGoals: z.int().min(1).max(100),
    award: positionPoints,
  }),
  yellow: pointUnitsSchema,
  straightRed: pointUnitsSchema,
  secondYellowDismissal: pointUnitsSchema,
  saves: z.strictObject({
    perSaves: z.int().min(1).max(100),
    award: pointUnitsSchema,
  }),
  penaltySave: pointUnitsSchema,
  penaltyMiss: pointUnitsSchema,
  ownGoal: pointUnitsSchema,
});
export const chipSchema = z.enum([
  'wildcard',
  'free-hit',
  'bench-boost',
  'triple-captain',
]);
export const chipInventorySchema = z.strictObject({
  wildcard: count,
  'free-hit': count,
  'bench-boost': count,
  'triple-captain': count,
});
export const chipWindowSchema = z
  .strictObject({
    chip: chipSchema,
    firstRound: z.int().positive(),
    lastRound: z.int().positive(),
  })
  .refine((value) => value.lastRound >= value.firstRound);
export const gameweekOptionsSchema = z.strictObject({
  automaticSubstitutions: z.boolean(),
  captainMultiplier: z.int().min(1).max(10),
  tripleCaptainMultiplier: z.int().min(1).max(10),
});
export const pricingPolicySchema = z
  .strictObject({
    minimum: fantasyTicksSchema,
    maximum: fantasyTicksSchema,
    step: fantasyTicksSchema.refine((n) => n > 0),
    automaticUpdates: z.boolean(),
    observedGameweeks: z.int().min(1).max(20),
    minimumMinutes: z.int().min(0).max(10000),
    riseAt: pointUnitsSchema,
    fallAt: pointUnitsSchema,
    freezeHours: z.int().min(0).max(168),
  })
  .refine((p) => p.minimum <= p.maximum && p.fallAt < p.riseAt);
export const competitionRulesSchema = z
  .strictObject({
    pricing: pricingPolicySchema.default({
      minimum: fantasyTicks(30),
      maximum: fantasyTicks(150),
      step: fantasyTicks(1),
      automaticUpdates: false,
      observedGameweeks: 3,
      minimumMinutes: 90,
      riseAt: pointUnits(6000),
      fallAt: pointUnits(2000),
      freezeHours: 24,
    }),
    version: z.int().positive(),
    squad: squadRulesSchema,
    transfer: transferRulesSchema,
    scoring: scoringRulesSchema,
    gameweek: gameweekOptionsSchema,
    enabledChips: z
      .array(chipSchema)
      .max(4)
      .refine((chips) => new Set(chips).size === chips.length),
    chipInventory: chipInventorySchema,
    chipWindows: z.array(chipWindowSchema).max(100),
    ranking: z.enum(['shared', 'deductions-then-goals']),
    deadlineOffsetMinutes: z.int().min(0).max(10080),
    correctionWindowHours: z.int().min(0).max(168),
  })
  .superRefine((rules, context) => {
    if (
      !rules.squad.captaincyEnabled &&
      rules.enabledChips.includes('triple-captain')
    )
      context.addIssue({
        code: 'custom',
        path: ['enabledChips'],
        message: 'Triple Captain requires captaincy',
      });
  });
export type CompetitionRules = z.infer<typeof competitionRulesSchema>;
