import { z } from 'zod';
import { idSchema, instantSchema } from './common.ts';
const externalId = z.int().positive();
export const providerSeasonBindingSchema = z.strictObject({
  id: idSchema,
  provider: z.literal('api-football-direct'),
  seasonId: idSchema,
  leagueId: externalId,
  seasonYear: z.int().min(2000).max(2200),
  evidenceId: idSchema,
  rightsReference: z.string().trim().min(5).max(1000),
  createdAt: instantSchema,
});
export const providerIdentitySchema = z.strictObject({
  id: idSchema,
  bindingId: idSchema,
  kind: z.enum(['club', 'footballer', 'fixture']),
  state: z.enum(['active', 'retired']),
  externalId,
  entityId: idSchema,
  revision: z.int().positive(),
  evidenceId: idSchema,
  updatedAt: instantSchema,
});
const common = {
  commandId: idSchema,
  reason: z.string().trim().min(5).max(1000),
  evidenceId: idSchema,
};
export const providerIdentityCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    commandId: idSchema,
    reason: common.reason,
    kind: z.literal('retire-entity'),
    mappingId: idSchema,
    expectedRevision: z.int().positive(),
  }),
  z.strictObject({
    ...common,
    kind: z.literal('bind-season'),
    seasonId: idSchema,
    leagueId: externalId,
    seasonYear: z.int().min(2000).max(2200),
    rightsReference: z.string().trim().min(5).max(1000),
  }),
  z.strictObject({
    ...common,
    kind: z.literal('map-entity'),
    bindingId: idSchema,
    entityKind: providerIdentitySchema.shape.kind,
    externalId,
    entityId: idSchema,
    expectedRevision: z.int().nonnegative(),
    targetChangeReviewed: z.boolean(),
  }),
]);
export const providerIdentityResultSchema = z.strictObject({
  binding: providerSeasonBindingSchema,
  mapping: providerIdentitySchema.nullable(),
});
export type ProviderSeasonBinding = z.infer<typeof providerSeasonBindingSchema>;
export type ProviderIdentity = z.infer<typeof providerIdentitySchema>;
export type ProviderIdentityCommand = z.infer<
  typeof providerIdentityCommandSchema
>;
