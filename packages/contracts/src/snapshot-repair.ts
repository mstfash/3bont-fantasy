import { z } from 'zod';
import { idSchema, instantSchema } from './common.ts';
import { editingEntrySchema, lockedEntrySchema } from './competition.ts';
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/u);
export const snapshotRepairSelectionSchema = z.strictObject({
  entryId: idSchema,
  gameweekId: idSchema,
  expectedResultRevision: z.int().positive(),
});
export const snapshotRepairCommandSchema = z.strictObject({
  commandId: idSchema,
  selection: snapshotRepairSelectionSchema,
  expectedFingerprint: fingerprint,
  reason: z.string().trim().min(5).max(1000),
});
export const snapshotRepairSchema = z.strictObject({
  entryId: idSchema,
  gameweekId: idSchema,
  revision: z.int().min(2),
  resultRevision: z.int().positive(),
  snapshot: lockedEntrySchema,
  originalFingerprint: fingerprint,
  source: z.strictObject({
    commandId: idSchema,
    accountId: z.string().min(1).max(200),
    acceptedAt: instantSchema,
    entryRevision: z.int().positive(),
    commandFingerprint: fingerprint,
    resultFingerprint: fingerprint,
    state: editingEntrySchema,
  }),
  actorId: z.string().min(1).max(200),
  recordedAt: instantSchema,
  reason: z.string().trim().min(5).max(1000),
});
export type SnapshotRepair = z.infer<typeof snapshotRepairSchema>;
export type SnapshotRepairSelection = z.infer<
  typeof snapshotRepairSelectionSchema
>;
export type SnapshotRepairCommand = z.infer<typeof snapshotRepairCommandSchema>;
