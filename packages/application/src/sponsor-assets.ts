import { requireCurrentStaffWrite } from './staff-write-access.ts';
import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { sql } from 'kysely';
import type { z } from 'zod';
import type { createDatabase } from '@fantasy/persistence';
import {
  sponsorUploadFieldsSchema,
  sponsorAssetMetadataSchema,
} from '@fantasy/contracts';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { CommandRejected } from './errors.ts';
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export async function normalizeSponsorImage(content: Buffer) {
  if (content.length > 4 * 1024 * 1024 || content.length < 12)
    throw new CommandRejected('sponsor-image-size');
  const supported =
    content.subarray(0, 8).equals(png) ||
    (content[0] === 255 && content[1] === 216 && content[2] === 255) ||
    (content.toString('ascii', 0, 4) === 'RIFF' &&
      content.toString('ascii', 8, 12) === 'WEBP');
  if (!supported) throw new CommandRejected('sponsor-image-format');
  try {
    const image = sharp(content, {
        failOn: 'warning',
        limitInputPixels: 8_000_000,
        limitInputChannels: 4,
        unlimited: false,
      }),
      metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width < 128 ||
      metadata.height < 64 ||
      metadata.width > 4096 ||
      metadata.height > 4096 ||
      (metadata.pages ?? 1) > 1
    )
      throw new CommandRejected('sponsor-image-dimensions');
    const output = await image
      .autoOrient()
      .resize({
        width: 1600,
        height: 900,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    if (output.data.length > 1024 * 1024)
      throw new CommandRejected('sponsor-image-size');
    return {
      content: output.data,
      width: output.info.width,
      height: output.info.height,
    };
  } catch (error) {
    if (error instanceof CommandRejected) throw error;
    throw new CommandRejected('sponsor-image-invalid');
  }
}
export async function storeSponsorAsset(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  fields: z.infer<typeof sponsorUploadFieldsSchema>,
  content: Buffer,
) {
  const input = sponsorUploadFieldsSchema.parse(fields);
  requireCapability(
    principal,
    grants,
    'sponsors.manage',
    input.competitionId,
    new Date(),
    true,
  );
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(input))
    .update(content)
    .digest('hex');
  const image = await normalizeSponsorImage(content);
  return db.transaction().execute(async (tx) => {
    await requireCurrentStaffWrite(
      tx,
      principal,
      'sponsors.manage',
      input.competitionId,
    );
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${principal.accountId}:${input.commandId}`},0))`.execute(
      tx,
    );
    const cached = await tx
      .selectFrom('commands')
      .selectAll()
      .where('actor_id', '=', principal.accountId)
      .where('command_id', '=', input.commandId)
      .executeTakeFirst();
    if (cached) {
      if (cached.fingerprint !== fingerprint)
        throw new CommandRejected('idempotency-conflict');
      return sponsorAssetMetadataSchema.parse(cached.result);
    }
    const now = new Date(),
      id = randomUUID();
    const result = {
      id,
      competitionId: input.competitionId,
      label: input.label,
      width: image.width,
      height: image.height,
      byteLength: image.content.length,
      createdAt: now.toISOString(),
    };
    await tx
      .insertInto('sponsor_assets')
      .values({
        id,
        competition_id: input.competitionId,
        label: input.label,
        content: image.content,
        width: image.width,
        height: image.height,
        checksum: createHash('sha256').update(image.content).digest('hex'),
        authorization_reference: input.authorizationReference,
        uploaded_by: principal.accountId,
        created_at: now,
      })
      .execute();
    await tx
      .insertInto('commands')
      .values({
        actor_id: principal.accountId,
        command_id: input.commandId,
        fingerprint,
        accepted_at: now,
        result,
      })
      .execute();
    await tx
      .insertInto('audit_events')
      .values({
        id: randomUUID(),
        actor_id: principal.accountId,
        action: 'sponsor.asset-upload',
        scope_id: input.competitionId,
        reason: 'Reviewed sponsor artwork authorization',
        payload: {
          ...result,
          authorizationReference: input.authorizationReference,
        },
      })
      .execute();
    return result;
  });
}
