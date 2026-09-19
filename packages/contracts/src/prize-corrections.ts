import { z } from 'zod';
import { idSchema, instantSchema } from './common.ts';
import { prizePreviewSchema } from './prizes.ts';
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/u);
export const prizeCorrectionObservationSchema = z.strictObject({
  fingerprint,
  preview: prizePreviewSchema.nullable(),
  hold: z.string().nullable(),
});
export const prizeCorrectionCaseSchema = z.strictObject({
  id: idSchema,
  competitionId: idSchema,
  poolId: idSchema,
  proposalId: idSchema,
  revision: z.int().positive(),
  state: z.enum(['open', 'resolved']),
  openedAt: instantSchema,
  updatedAt: instantSchema,
  observation: prizeCorrectionObservationSchema,
  resolution: z
    .strictObject({
      decision: z.enum([
        'original-delivery-stands',
        'external-remedy-recorded',
      ]),
      reason: z.string().min(5).max(1000),
      reference: z.string().min(5).max(1000),
      actorId: z.string(),
      resolvedAt: instantSchema,
    })
    .nullable(),
});
export const prizeCorrectionCommandSchema = z.strictObject({
  commandId: idSchema,
  competitionId: idSchema,
  caseId: idSchema,
  expectedRevision: z.int().positive(),
  expectedFingerprint: fingerprint,
  decision: z.enum(['original-delivery-stands', 'external-remedy-recorded']),
  reason: z.string().trim().min(5).max(1000),
  reference: z.string().trim().min(5).max(1000),
});
export const prizeCorrectionResultSchema = z.strictObject({
  caseId: idSchema,
  revision: z.int().positive(),
});
export type PrizeCorrectionObservation = z.infer<
  typeof prizeCorrectionObservationSchema
>;
export type PrizeCorrectionCase = z.infer<typeof prizeCorrectionCaseSchema>;
export type PrizeCorrectionCommand = z.infer<
  typeof prizeCorrectionCommandSchema
>;
