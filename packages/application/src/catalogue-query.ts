import { sql } from 'kysely';
import type { createDatabase } from '@fantasy/persistence';
/** Read only after authorizing catalogue access. Search is a literal substring, not a SQL pattern. */
export async function findCatalogueFootballers(
  db: ReturnType<typeof createDatabase>,
  seasonId: string,
  search: string,
  offset: number,
) {
  const term = search.slice(0, 100).toLowerCase();
  return db
    .selectFrom('footballers')
    .select('data')
    .where('season_id', '=', seasonId)
    .where(
      sql<boolean>`(position(${term} in lower(data->'name'->>'ar')) > 0 or position(${term} in lower(data->'name'->>'en')) > 0)`,
    )
    .orderBy('id')
    .offset(Math.max(0, Math.min(500000, Math.floor(offset))))
    .limit(51)
    .execute();
}
