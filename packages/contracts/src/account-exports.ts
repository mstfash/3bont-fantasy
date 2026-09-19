import { z } from 'zod';
import { idSchema, instantSchema } from './common.ts';
export const accountExportScopeSchema = z
  .strictObject({
    competitionId: idSchema.nullable(),
    historyFrom: instantSchema.nullable(),
    historyUntil: instantSchema.nullable(),
  })
  .refine(
    (s) =>
      s.historyFrom === null ||
      s.historyUntil === null ||
      Date.parse(s.historyFrom) < Date.parse(s.historyUntil),
  );
export const accountExportCommandSchema = z.strictObject({
  commandId: idSchema,
  scope: accountExportScopeSchema,
});
export const accountExportSchema = z.strictObject({
  id: idSchema,
  accountId: z.string().min(1).max(200),
  scope: accountExportScopeSchema,
  state: z.enum(['queued', 'ready', 'failed']),
  requestedAt: instantSchema,
  completedAt: instantSchema.nullable(),
  expiresAt: instantSchema.nullable(),
  byteLength: z.int().nonnegative().nullable(),
  checksum: z
    .string()
    .regex(/^[a-f0-9]{64}$/u)
    .nullable(),
  errorCode: z
    .enum([
      'archive-too-large',
      'archive-time-limit',
      'archive-build-failed',
      'account-unavailable',
    ])
    .nullable(),
});
export const accountExportResultSchema = z.strictObject({
  archive: accountExportSchema,
});
export type AccountExport = z.infer<typeof accountExportSchema>;
export type AccountExportCommand = z.infer<typeof accountExportCommandSchema>;
export type AccountExportScope = z.infer<typeof accountExportScopeSchema>;
