import { z } from 'zod';
import { idSchema } from './common.ts';
export const staffRoleSchema = z.enum([
  'owner',
  'competition-manager',
  'data-steward',
  'moderator',
  'prize-manager',
  'prize-approver',
  'sponsor-manager',
  'support-viewer',
]);
export const staffGrantRecordSchema = z.strictObject({
  id: idSchema,
  accountId: z.string().min(1).max(200),
  role: staffRoleSchema,
  competitionId: idSchema.nullable(),
});
const common = {
  commandId: idSchema,
  reason: z.string().trim().min(5).max(1000),
};
export const staffCommandSchema = z.discriminatedUnion('kind', [
  z
    .strictObject({
      ...common,
      kind: z.literal('grant'),
      accountId: z.string().trim().min(1).max(200),
      role: staffRoleSchema,
      competitionId: idSchema.nullable(),
    })
    .refine(
      (c) =>
        !['owner', 'data-steward'].includes(c.role) || c.competitionId === null,
      { message: 'Owner and shared data steward roles require platform scope' },
    ),
  z.strictObject({ ...common, kind: z.literal('revoke'), grantId: idSchema }),
]);
export const staffCommandResultSchema = z.strictObject({
  grant: staffGrantRecordSchema,
  revoked: z.boolean(),
});
export type StaffCommand = z.infer<typeof staffCommandSchema>;
export type StaffGrantRecord = z.infer<typeof staffGrantRecordSchema>;
export type StaffCommandResult = z.infer<typeof staffCommandResultSchema>;
export type StaffRole = z.infer<typeof staffRoleSchema>;
