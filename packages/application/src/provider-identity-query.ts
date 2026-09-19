import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { CommandRejected } from './errors.ts';
import {
  readProviderIdentityEvidence,
  type ProviderIdentityCandidate,
} from './provider-identity-evidence.ts';
export async function readProviderIdentityAdministration(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  selection: {
    bindingId: string | null;
    evidenceId: string | null;
    kind: 'club' | 'footballer' | 'fixture';
  },
) {
  requireCapability(principal, grants, 'facts.manage', null, new Date());
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      const seasons = await tx
        .selectFrom('seasons')
        .select('data')
        .orderBy('id')
        .limit(501)
        .execute();
      if (seasons.length > 500)
        throw new CommandRejected('provider-identity-scope-too-large');
      const bindings = (
        await tx
          .selectFrom('provider_season_bindings')
          .select('data')
          .orderBy('id')
          .execute()
      ).map((r) => r.data);
      const binding =
        bindings.find((b) => b.id === selection.bindingId) ?? null;
      const resource = !binding
        ? 'leagues'
        : selection.kind === 'club'
          ? 'teams'
          : selection.kind === 'footballer'
            ? 'players'
            : 'fixtures';
      let query = tx
        .selectFrom('provider_evidence')
        .innerJoin(
          'provider_attempts',
          'provider_attempts.evidence_id',
          'provider_evidence.id',
        )
        .select([
          'provider_evidence.id',
          'provider_evidence.received_at',
          'provider_evidence.payload',
          'provider_attempts.request',
        ])
        .distinct()
        .where('provider_evidence.provider', '=', 'api-football-direct')
        .where('provider_attempts.outcome', '=', 'success')
        .where('provider_attempts.http_status', '=', 200)
        .where(
          sql<string>`provider_attempts.request->>'resource'`,
          '=',
          resource,
        );
      if (binding)
        query = query
          .where(
            sql<string>`provider_attempts.request->>'league'`,
            '=',
            String(binding.leagueId),
          )
          .where(
            sql<string>`provider_attempts.request->>'season'`,
            '=',
            String(binding.seasonYear),
          );
      const evidence = await query
        .orderBy('provider_evidence.received_at', 'desc')
        .orderBy('provider_evidence.id')
        .limit(50)
        .execute();
      const selected =
        evidence.find((e) => e.id === selection.evidenceId) ??
        evidence[0] ??
        null;
      let candidates: ProviderIdentityCandidate[] = [],
        evidenceIssue: string | null = null;
      if (selected)
        try {
          candidates = readProviderIdentityEvidence(
            selected.request,
            selected.payload,
            binding ?? undefined,
          );
        } catch (error) {
          if (error instanceof CommandRejected) evidenceIssue = error.code;
          else throw error;
        }
      const mappings = binding
        ? (
            await tx
              .selectFrom('provider_identities')
              .select('data')
              .where('binding_id', '=', binding.id)
              .where('kind', '=', selection.kind)
              .orderBy('external_id')
              .limit(5001)
              .execute()
          ).map((r) => r.data)
        : [];
      let targets: { id: string; name: { ar: string; en: string } }[] = [];
      if (binding) {
        if (selection.kind === 'club')
          targets = (
            await tx
              .selectFrom('clubs')
              .select('data')
              .where('season_id', '=', binding.seasonId)
              .orderBy('id')
              .limit(5001)
              .execute()
          ).map((r) => ({ id: r.data.id, name: r.data.name }));
        else if (selection.kind === 'footballer')
          targets = (
            await tx
              .selectFrom('footballers')
              .select('data')
              .where('season_id', '=', binding.seasonId)
              .orderBy('id')
              .limit(5001)
              .execute()
          ).map((r) => ({ id: r.data.id, name: r.data.name }));
        else
          targets = (
            await tx
              .selectFrom('fixtures')
              .innerJoin('clubs as home', (join) =>
                join.onRef(
                  'home.id',
                  '=',
                  sql<string>`(fixtures.data->>'homeClubId')::uuid`,
                ),
              )
              .innerJoin('clubs as away', (join) =>
                join.onRef(
                  'away.id',
                  '=',
                  sql<string>`(fixtures.data->>'awayClubId')::uuid`,
                ),
              )
              .select([
                'fixtures.id',
                'fixtures.kickoff',
                'home.data as home',
                'away.data as away',
              ])
              .where('fixtures.season_id', '=', binding.seasonId)
              .orderBy('fixtures.kickoff')
              .limit(5001)
              .execute()
          ).map((r) => ({
            id: r.id,
            name: {
              ar: `${r.home.name.ar} / ${r.away.name.ar} · ${r.kickoff.toISOString().slice(0, 10)}`,
              en: `${r.home.name.en} / ${r.away.name.en} · ${r.kickoff.toISOString().slice(0, 10)}`,
            },
          }));
      }
      if (mappings.length > 5000 || targets.length > 5000)
        throw new CommandRejected('provider-identity-scope-too-large');
      return {
        seasons: seasons.map((r) => r.data),
        bindings,
        binding,
        kind: selection.kind,
        mappings,
        targets,
        candidates,
        evidenceIssue,
        evidence: evidence.map((e) => ({
          id: e.id,
          receivedAt: e.received_at.toISOString(),
          request: e.request,
        })),
        selectedEvidenceId: selected?.id ?? null,
        selectedYear:
          selected && 'season' in selected.request
            ? selected.request.season
            : null,
      };
    });
}
