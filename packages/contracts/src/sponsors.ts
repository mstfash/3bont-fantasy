import { z } from 'zod';
import { idSchema, instantSchema, localizedSchema } from './common.ts';
export const sponsorSlotSchema = z.enum(['header', 'competition', 'prize']);
export const sponsorDestinationSchema = z
  .url()
  .max(2000)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  }, 'Use an HTTPS destination without credentials');
const details = {
  competitionId: idSchema.nullable(),
  name: localizedSchema.refine((v) => v.ar.length <= 200 && v.en.length <= 200),
  description: localizedSchema.refine(
    (v) => v.ar.length <= 200 && v.en.length <= 200,
  ),
  assets: z.strictObject({ ar: idSchema, en: idSchema }),
  destination: sponsorDestinationSchema,
  slot: sponsorSlotSchema,
  startsAt: instantSchema,
  endsAt: instantSchema,
  priority: z.int().min(0).max(100),
};
const validScope = (v: { competitionId: string | null; slot: string }) =>
  v.slot === 'header' ? v.competitionId === null : v.competitionId !== null;
export const sponsorCampaignSchema = z
  .strictObject({
    id: idSchema,
    revision: z.int().positive(),
    ...details,
    state: z.enum(['draft', 'published', 'paused']),
    authorizationReference: z.string().max(1000).nullable(),
    publishedAt: instantSchema.nullable(),
  })
  .refine(validScope, {
    message:
      'Header campaigns are global; competition/prize campaigns need a competition',
  })
  .refine((v) => Date.parse(v.startsAt) < Date.parse(v.endsAt), {
    message: 'Campaign end must follow its start',
  });
const common = {
  commandId: idSchema,
  reason: z.string().trim().min(5).max(1000),
};
export const sponsorCommandSchema = z.discriminatedUnion('kind', [
  z
    .strictObject({ ...common, kind: z.literal('create'), ...details })
    .refine(validScope),
  z
    .strictObject({
      ...common,
      kind: z.literal('update'),
      campaignId: idSchema,
      expectedRevision: z.int().positive(),
      ...details,
    })
    .refine(validScope),
  z.strictObject({
    ...common,
    kind: z.literal('publish'),
    campaignId: idSchema,
    competitionId: idSchema.nullable(),
    expectedRevision: z.int().positive(),
    authorizationReference: z.string().trim().min(5).max(1000),
  }),
  z.strictObject({
    ...common,
    kind: z.literal('pause'),
    campaignId: idSchema,
    competitionId: idSchema.nullable(),
    expectedRevision: z.int().positive(),
  }),
]);
export const sponsorCommandResultSchema = z.strictObject({
  campaignId: idSchema,
  revision: z.int().positive(),
});
export const sponsorAssetMetadataSchema = z.strictObject({
  id: idSchema,
  competitionId: idSchema.nullable(),
  label: z.string().trim().min(2).max(150),
  width: z.int().positive(),
  height: z.int().positive(),
  byteLength: z.int().positive(),
  createdAt: instantSchema,
});
export const sponsorUploadFieldsSchema = z.strictObject({
  commandId: idSchema,
  competitionId: idSchema.nullable(),
  label: z.string().trim().min(2).max(150),
  authorizationReference: z.string().trim().min(5).max(1000),
});
export const sponsorMetricSchema = z.strictObject({
  token: z.string().min(20).max(2000),
  kind: z.enum(['impression', 'click']),
});
export type SponsorCampaign = z.infer<typeof sponsorCampaignSchema>;
export type SponsorCommand = z.infer<typeof sponsorCommandSchema>;
export type SponsorSlot = z.infer<typeof sponsorSlotSchema>;
