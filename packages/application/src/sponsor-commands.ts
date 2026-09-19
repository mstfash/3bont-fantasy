import { requireCurrentStaffWrite } from './staff-write-access.ts';
import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  sponsorCommandSchema,
  sponsorCampaignSchema,
  sponsorCommandResultSchema,
  type SponsorCommand,
  type SponsorCampaign,
} from '@fantasy/contracts';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { CommandRejected } from './errors.ts';
export async function executeSponsorCommand(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  input: SponsorCommand,
) {
  const command = sponsorCommandSchema.parse(input);
  requireCapability(
    principal,
    grants,
    'sponsors.manage',
    command.competitionId,
    new Date(),
    true,
  );
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex');
  return db.transaction().execute(async (tx) => {
    await requireCurrentStaffWrite(
      tx,
      principal,
      'sponsors.manage',
      command.competitionId,
    );
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${principal.accountId}:${command.commandId}`},0))`.execute(
      tx,
    );
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`sponsor:${command.competitionId ?? 'global'}`},0))`.execute(
      tx,
    );
    const cached = await tx
      .selectFrom('commands')
      .selectAll()
      .where('actor_id', '=', principal.accountId)
      .where('command_id', '=', command.commandId)
      .executeTakeFirst();
    if (cached) {
      if (cached.fingerprint !== fingerprint)
        throw new CommandRejected('idempotency-conflict');
      return sponsorCommandResultSchema.parse(cached.result);
    }
    const current =
      'campaignId' in command
        ? (
            await tx
              .selectFrom('sponsor_campaigns')
              .select('data')
              .where('id', '=', command.campaignId)
              .where(
                'competition_id',
                command.competitionId === null ? 'is' : '=',
                command.competitionId,
              )
              .forUpdate()
              .executeTakeFirst()
          )?.data
        : null;
    if (command.kind !== 'create' && !current)
      throw new CommandRejected('sponsor-campaign-unavailable');
    if (
      'expectedRevision' in command &&
      current?.revision !== command.expectedRevision
    )
      throw new CommandRejected('sponsor-campaign-changed');
    const now = new Date();
    let campaign: SponsorCampaign;
    if (command.kind === 'create' || command.kind === 'update') {
      if (current?.state === 'published')
        throw new CommandRejected('sponsor-pause-before-edit');
      campaign = sponsorCampaignSchema.parse({
        competitionId: command.competitionId,
        name: command.name,
        description: command.description,
        assets: command.assets,
        destination: command.destination,
        slot: command.slot,
        startsAt: command.startsAt,
        endsAt: command.endsAt,
        priority: command.priority,
        id: current?.id ?? randomUUID(),
        revision: (current?.revision ?? 0) + 1,
        state: 'draft',
        authorizationReference: null,
        publishedAt: null,
      });
    } else {
      if (!current) throw new CommandRejected('sponsor-campaign-unavailable');
      if (command.kind === 'publish') {
        if (
          current.state === 'published' ||
          Date.parse(current.endsAt) <= now.getTime()
        )
          throw new CommandRejected('sponsor-publication-unavailable');
        campaign = {
          ...current,
          revision: current.revision + 1,
          state: 'published',
          publishedAt: now.toISOString(),
          authorizationReference: command.authorizationReference,
        };
      } else
        campaign = {
          ...current,
          revision: current.revision + 1,
          state: 'paused',
        };
    }
    const assets = await tx
      .selectFrom('sponsor_assets')
      .select(['id', 'competition_id'])
      .where('id', 'in', [campaign.assets.ar, campaign.assets.en])
      .execute();
    if (
      ![campaign.assets.ar, campaign.assets.en].every((id) =>
        assets.some(
          (a) => a.id === id && a.competition_id === campaign.competitionId,
        ),
      )
    )
      throw new CommandRejected('sponsor-assets-scope');
    await tx
      .insertInto('sponsor_campaigns')
      .values({
        id: campaign.id,
        competition_id: campaign.competitionId,
        revision: campaign.revision,
        data: campaign,
      })
      .onConflict((oc) =>
        oc
          .column('id')
          .doUpdateSet({ revision: campaign.revision, data: campaign }),
      )
      .execute();
    const result = { campaignId: campaign.id, revision: campaign.revision };
    await tx
      .insertInto('commands')
      .values({
        actor_id: principal.accountId,
        command_id: command.commandId,
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
        action: `sponsor.${command.kind}`,
        scope_id: command.competitionId,
        reason: command.reason,
        payload: { before: current, after: campaign },
      })
      .execute();
    return result;
  });
}
