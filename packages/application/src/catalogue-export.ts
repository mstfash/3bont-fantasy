import { randomUUID } from 'node:crypto';
import type { createDatabase } from '@fantasy/persistence';
import {
  catalogueManifestSchema,
  idSchema,
  type CatalogueCommand,
} from '@fantasy/contracts';
import {
  requireCapability,
  type Principal,
  type StaffGrant,
} from './authorization.ts';
import { catalogueFingerprint } from './catalogue.ts';
import { CommandRejected } from './errors.ts';
export async function exportCatalogueSeason(
  db: ReturnType<typeof createDatabase>,
  principal: Principal,
  grants: readonly StaffGrant[],
  seasonId: string,
) {
  requireCapability(principal, grants, 'facts.manage', null, new Date());
  idSchema.parse(seasonId);
  return db
    .transaction()
    .setIsolationLevel('repeatable read')
    .execute(async (tx) => {
      const season = await tx
        .selectFrom('seasons')
        .select('data')
        .where('id', '=', seasonId)
        .executeTakeFirst();
      if (!season) throw new CommandRejected('season-unavailable');
      const clubs = await tx
        .selectFrom('clubs')
        .select('data')
        .where('season_id', '=', seasonId)
        .orderBy('id')
        .limit(1000)
        .execute();
      const players = await tx
        .selectFrom('footballers')
        .select('data')
        .where('season_id', '=', seasonId)
        .orderBy('id')
        .limit(1000)
        .execute();
      if (1 + clubs.length + players.length > 1000)
        throw new CommandRejected('import-row-limit');
      const base = (data: object) => ({
        commandId: randomUUID(),
        expectedFingerprint: catalogueFingerprint(data),
        reason:
          'Review exported record and update the evidence before importing',
      });
      const items: CatalogueCommand[] = [
        { ...base(season.data), kind: 'season', season: season.data },
        ...clubs.map(({ data }) => ({
          ...base(data),
          kind: 'club' as const,
          club: data,
        })),
        ...players.map(({ data }) => ({
          ...base(data),
          kind: 'footballer' as const,
          footballer: data,
        })),
      ];
      return catalogueManifestSchema.parse({
        version: 1,
        sourceName: '3BONT FANTASY catalogue export',
        sourceEvidenceReference: `Catalogue snapshot exported at ${new Date().toISOString()}; replace with reviewed source evidence for changes`,
        items,
      });
    });
}
