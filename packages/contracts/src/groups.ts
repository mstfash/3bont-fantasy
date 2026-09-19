import { z } from 'zod';
import { idSchema, instantSchema } from './common.ts';
export const leagueGroupSchema = z.strictObject({
  id: idSchema,
  competitionId: idSchema,
  organizerId: z.string().min(1).max(200),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000),
  visibility: z.enum(['public', 'private']),
  approvalRequired: z.boolean(),
  entryLimit: z.int().min(1).max(100),
  startGameweekId: idSchema.nullable(),
  revision: z.int().positive(),
  createdAt: instantSchema,
});
export const membershipStatusSchema = z.enum([
  'pending',
  'active',
  'left',
  'removed',
]);
export const invitationTokenSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const common = { commandId: idSchema, competitionId: idSchema };
export const groupCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...common,
    kind: z.literal('create'),
    name: leagueGroupSchema.shape.name,
    description: leagueGroupSchema.shape.description,
    visibility: leagueGroupSchema.shape.visibility,
    approvalRequired: z.boolean(),
    entryLimit: leagueGroupSchema.shape.entryLimit,
    startGameweekId: idSchema.nullable(),
    entryId: idSchema,
    invitationToken: invitationTokenSchema,
  }),
  z.strictObject({
    ...common,
    kind: z.literal('join'),
    groupId: idSchema,
    entryId: idSchema,
    invitationToken: invitationTokenSchema.nullable(),
  }),
  z.strictObject({
    ...common,
    kind: z.literal('leave'),
    groupId: idSchema,
    entryId: idSchema,
  }),
  z.strictObject({
    ...common,
    kind: z.literal('review-member'),
    groupId: idSchema,
    entryId: idSchema,
    expectedStatus: membershipStatusSchema,
    decision: z.enum(['approve', 'remove']),
    reason: z.string().trim().min(5).max(1000),
  }),
  z.strictObject({
    ...common,
    kind: z.literal('rotate-invitation'),
    groupId: idSchema,
    expectedRevision: z.int().positive(),
    invitationToken: invitationTokenSchema,
  }),
]);
export const groupCommandResultSchema = z.strictObject({
  groupId: idSchema,
  revision: z.int().positive(),
  membership: membershipStatusSchema.nullable(),
});
export type LeagueGroup = z.infer<typeof leagueGroupSchema>;
export type GroupCommand = z.infer<typeof groupCommandSchema>;
export type GroupCommandResult = z.infer<typeof groupCommandResultSchema>;
