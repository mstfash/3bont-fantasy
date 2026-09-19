import { z } from 'zod';
import { idSchema } from './common.ts';
import { catalogueCommandSchema } from './catalogue.ts';
import { seasonSchema, clubSchema, footballerSchema } from './football.ts';
export const catalogueManifestSchema = z
  .strictObject({
    version: z.literal(1),
    sourceName: z.string().trim().min(2).max(200),
    sourceEvidenceReference: z.string().trim().min(5).max(1000),
    items: z.array(catalogueCommandSchema).min(1).max(1000),
  })
  .superRefine((manifest, ctx) => {
    const entities = new Set<string>(),
      commands = new Set<string>();
    for (const [i, item] of manifest.items.entries()) {
      const doc =
        item.kind === 'season'
          ? item.season
          : item.kind === 'club'
            ? item.club
            : item.footballer;
      if (
        entities.has(`${item.kind}:${doc.id}`) ||
        commands.has(item.commandId)
      )
        ctx.addIssue({
          code: 'custom',
          path: ['items', i],
          message: 'Each entity and command identifier must occur once',
        });
      entities.add(`${item.kind}:${doc.id}`);
      commands.add(item.commandId);
    }
  });
export const catalogueImportCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('preview'),
    manifest: catalogueManifestSchema,
  }),
  z.strictObject({
    kind: z.literal('apply'),
    commandId: idSchema,
    expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    manifest: catalogueManifestSchema,
  }),
]);
const document = z.union([seasonSchema, clubSchema, footballerSchema]);
export const catalogueImportPreviewSchema = z.strictObject({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
  changes: z
    .array(
      z.strictObject({
        kind: z.enum(['season', 'club', 'footballer']),
        id: idSchema,
        before: document.nullable(),
        after: document,
        action: z.enum(['create', 'update', 'unchanged']),
      }),
    )
    .max(1000),
});
export const catalogueImportResultSchema = z.strictObject({
  batchId: idSchema,
  acceptedRows: z.int().min(1).max(1000),
});
export type CatalogueManifest = z.infer<typeof catalogueManifestSchema>;
export type CatalogueImportPreview = z.infer<
  typeof catalogueImportPreviewSchema
>;
export type CatalogueImportCommand = z.infer<
  typeof catalogueImportCommandSchema
>;
export const catalogueImportResponseSchema = z.discriminatedUnion('kind', [
  catalogueImportPreviewSchema.extend({ kind: z.literal('preview') }),
  catalogueImportResultSchema.extend({ kind: z.literal('applied') }),
  z.strictObject({
    kind: z.literal('invalid'),
    itemIndex: z.int().nonnegative(),
    code: z.string(),
  }),
]);
