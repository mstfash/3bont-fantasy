import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  providerIdentityCommandSchema,
  providerIdentityResultSchema,
  providerIdentitySchema,
  providerSeasonBindingSchema,
  type ProviderIdentityCommand,
  type ProviderSeasonBinding,
  type ProviderIdentity,
} from '@fantasy/contracts';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { requireCurrentStaffWrite } from './staff-write-access.ts';
import { readProviderIdentityEvidence } from './provider-identity-evidence.ts';
import { CommandRejected } from './errors.ts';
export async function executeProviderIdentityCommand(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  input: ProviderIdentityCommand,
) {
  const command = providerIdentityCommandSchema.parse(input);
  requireCapability(principal, grants, 'facts.manage', null, new Date(), true);
  const fingerprint = createHash('sha256')
    .update(JSON.stringify(command))
    .digest('hex');
  return db.transaction().execute(async (tx) => {
    await requireCurrentStaffWrite(tx, principal, 'facts.manage', null);
    await sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${'catalogue-import-coordination'},0))`.execute(
      tx,
    );
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${'provider-identity-mapping'},0))`.execute(
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
      return providerIdentityResultSchema.parse(cached.result);
    }
    const now = (
      await sql<{ now: Date }>`SELECT clock_timestamp() AS now`.execute(tx)
    ).rows[0]?.now;
    if (!now) throw new Error('Database clock unavailable');
    let binding: ProviderSeasonBinding,
      mapping: ProviderIdentity | null = null,
      before: ProviderIdentity | null = null;
    if (command.kind === 'retire-entity') {
      before =
        (
          await tx
            .selectFrom('provider_identities')
            .select('data')
            .where('id', '=', command.mappingId)
            .executeTakeFirst()
        )?.data ?? null;
      if (
        !before ||
        before.revision !== command.expectedRevision ||
        before.state !== 'active'
      )
        throw new CommandRejected('provider-identity-changed');
      binding = (
        await tx
          .selectFrom('provider_season_bindings')
          .select('data')
          .where('id', '=', before.bindingId)
          .executeTakeFirstOrThrow()
      ).data;
      mapping = {
        ...before,
        state: 'retired',
        revision: before.revision + 1,
        updatedAt: now.toISOString(),
      };
    } else {
      const evidence = await tx
        .selectFrom('provider_evidence')
        .innerJoin(
          'provider_attempts',
          'provider_attempts.evidence_id',
          'provider_evidence.id',
        )
        .select(['provider_evidence.payload', 'provider_attempts.request'])
        .where('provider_evidence.id', '=', command.evidenceId)
        .where('provider_evidence.provider', '=', 'api-football-direct')
        .where('provider_attempts.outcome', '=', 'success')
        .where('provider_attempts.http_status', '=', 200)
        .limit(1)
        .executeTakeFirst();
      if (!evidence)
        throw new CommandRejected('provider-identity-evidence-unavailable');
      if (command.kind === 'bind-season') {
        if (
          evidence.request.resource !== 'leagues' ||
          evidence.request.season !== command.seasonYear
        )
          throw new CommandRejected('provider-identity-scope-mismatch');
        if (
          !readProviderIdentityEvidence(
            evidence.request,
            evidence.payload,
          ).some((c) => c.externalId === command.leagueId)
        )
          throw new CommandRejected('provider-identity-source-missing');
        const season = await tx
          .selectFrom('seasons')
          .select('id')
          .where('id', '=', command.seasonId)
          .forShare()
          .executeTakeFirst();
        if (!season) throw new CommandRejected('season-unavailable');
        const existing = await tx
          .selectFrom('provider_season_bindings')
          .select('id')
          .where((eb) =>
            eb.or([
              eb('season_id', '=', command.seasonId),
              eb.and([
                eb('league_id', '=', String(command.leagueId)),
                eb('season_year', '=', command.seasonYear),
              ]),
            ]),
          )
          .executeTakeFirst();
        if (existing)
          throw new CommandRejected('provider-season-already-bound');
        binding = providerSeasonBindingSchema.parse({
          id: randomUUID(),
          provider: 'api-football-direct',
          seasonId: command.seasonId,
          leagueId: command.leagueId,
          seasonYear: command.seasonYear,
          evidenceId: command.evidenceId,
          rightsReference: command.rightsReference,
          createdAt: now.toISOString(),
        });
        await tx
          .insertInto('provider_season_bindings')
          .values({
            id: binding.id,
            provider: binding.provider,
            season_id: binding.seasonId,
            league_id: String(binding.leagueId),
            season_year: binding.seasonYear,
            evidence_id: binding.evidenceId,
            data: binding,
          })
          .execute();
      } else {
        const row = await tx
          .selectFrom('provider_season_bindings')
          .select('data')
          .where('id', '=', command.bindingId)
          .executeTakeFirst();
        if (!row) throw new CommandRejected('provider-binding-unavailable');
        binding = row.data;
        const resource =
          command.entityKind === 'club'
            ? 'teams'
            : command.entityKind === 'footballer'
              ? 'players'
              : 'fixtures';
        if (evidence.request.resource !== resource)
          throw new CommandRejected('provider-identity-scope-mismatch');
        const source = readProviderIdentityEvidence(
          evidence.request,
          evidence.payload,
          binding,
        ).find((c) => c.externalId === command.externalId);
        if (!source)
          throw new CommandRejected('provider-identity-source-missing');
        const table =
          command.entityKind === 'club'
            ? 'clubs'
            : command.entityKind === 'footballer'
              ? 'footballers'
              : 'fixtures';
        const target = await tx
          .selectFrom(table)
          .select('id')
          .where('id', '=', command.entityId)
          .where('season_id', '=', binding.seasonId)
          .forShare()
          .executeTakeFirst();
        if (!target)
          throw new CommandRejected('provider-identity-target-unavailable');
        if (command.entityKind === 'fixture') {
          if (
            source.homeExternalId === undefined ||
            source.awayExternalId === undefined
          )
            throw new CommandRejected('provider-identity-evidence-invalid');
          const fixture = (
            await tx
              .selectFrom('fixtures')
              .select('data')
              .where('id', '=', target.id)
              .executeTakeFirstOrThrow()
          ).data;
          const clubs = await tx
            .selectFrom('provider_identities')
            .select(['external_id', 'entity_id'])
            .where('binding_id', '=', binding.id)
            .where(sql<string>`data->>'state'`, '=', 'active')
            .where('kind', '=', 'club')
            .where('external_id', 'in', [
              String(source.homeExternalId),
              String(source.awayExternalId),
            ])
            .execute();
          if (
            clubs.find((c) => c.external_id === String(source.homeExternalId))
              ?.entity_id !== fixture.homeClubId ||
            clubs.find((c) => c.external_id === String(source.awayExternalId))
              ?.entity_id !== fixture.awayClubId
          )
            throw new CommandRejected('provider-fixture-clubs-mismatch');
        }
        before =
          (
            await tx
              .selectFrom('provider_identities')
              .select('data')
              .where('binding_id', '=', binding.id)
              .where('kind', '=', command.entityKind)
              .where('external_id', '=', String(command.externalId))
              .executeTakeFirst()
          )?.data ?? null;
        if ((before?.revision ?? 0) !== command.expectedRevision)
          throw new CommandRejected('provider-identity-changed');
        if (
          before &&
          before.entityId !== target.id &&
          !command.targetChangeReviewed
        )
          throw new CommandRejected('provider-identity-relink-review-required');
        const duplicate = await tx
          .selectFrom('provider_identities')
          .select('id')
          .where('binding_id', '=', binding.id)
          .where('kind', '=', command.entityKind)
          .where(sql<string>`data->>'state'`, '=', 'active')
          .where('entity_id', '=', target.id)
          .where('external_id', '!=', String(command.externalId))
          .executeTakeFirst();
        if (duplicate)
          throw new CommandRejected('provider-identity-target-conflict');
        mapping = providerIdentitySchema.parse({
          id: before?.id ?? randomUUID(),
          bindingId: binding.id,
          kind: command.entityKind,
          state: 'active',
          externalId: command.externalId,
          entityId: target.id,
          revision: (before?.revision ?? 0) + 1,
          evidenceId: command.evidenceId,
          updatedAt: now.toISOString(),
        });
      }
    }
    const previous = before;
    if (
      previous?.kind === 'club' &&
      mapping &&
      (mapping.state === 'retired' || previous.entityId !== mapping.entityId)
    ) {
      const dependent = await tx
        .selectFrom('provider_identities as identity')
        .innerJoin('fixtures', 'fixtures.id', 'identity.entity_id')
        .select('identity.id')
        .where('identity.binding_id', '=', binding.id)
        .where('identity.kind', '=', 'fixture')
        .where(sql<string>`identity.data->>'state'`, '=', 'active')
        .where((eb) =>
          eb.or([
            eb(
              sql<string>`fixtures.data->>'homeClubId'`,
              '=',
              previous.entityId,
            ),
            eb(
              sql<string>`fixtures.data->>'awayClubId'`,
              '=',
              previous.entityId,
            ),
          ]),
        )
        .executeTakeFirst();
      if (dependent)
        throw new CommandRejected('provider-identity-has-fixtures');
    }
    if (mapping) {
      const nextMapping = mapping;
      await tx
        .insertInto('provider_identities')
        .values({
          id: mapping.id,
          binding_id: binding.id,
          kind: mapping.kind,
          external_id: String(mapping.externalId),
          entity_id: mapping.entityId,
          revision: mapping.revision,
          data: mapping,
        })
        .onConflict((oc) =>
          oc.column('id').doUpdateSet({
            entity_id: nextMapping.entityId,
            revision: nextMapping.revision,
            data: nextMapping,
          }),
        )
        .execute();
      await tx
        .insertInto('provider_identity_history')
        .values({
          mapping_id: mapping.id,
          evidence_id: mapping.evidenceId,
          revision: mapping.revision,
          data: mapping,
        })
        .execute();
    }
    const result = { binding, mapping };
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
        action: `provider.identity.${command.kind}`,
        scope_id: mapping?.id ?? binding.id,
        reason: command.reason,
        payload: { before, ...result },
      })
      .execute();
    return result;
  });
}
