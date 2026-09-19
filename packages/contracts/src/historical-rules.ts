import { z } from 'zod';
import { idSchema } from './common.ts';
import { scoringRulesSchema, gameweekOptionsSchema } from './rules.ts';
export const historicalRuleSettingsSchema = z.strictObject({
  scoring: scoringRulesSchema.omit({ version: true }),
  gameweek: gameweekOptionsSchema,
});
export const historicalRuleSelectionSchema = z.strictObject({
  gameweekId: idSchema,
  expectedResultRevision: z.int().positive(),
  settings: historicalRuleSettingsSchema,
});
export const historicalRuleCommandSchema = z.strictObject({
  kind: z.literal('replay-rules'),
  commandId: idSchema,
  selection: historicalRuleSelectionSchema,
  expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  reason: z.string().trim().min(5).max(1000),
});
export type HistoricalRuleSelection = z.infer<
  typeof historicalRuleSelectionSchema
>;
export type HistoricalRuleCommand = z.infer<typeof historicalRuleCommandSchema>;
