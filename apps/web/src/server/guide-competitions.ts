import { competitionSchema } from '@fantasy/contracts';
import { getRuntime } from './runtime';
export async function publicGuideCompetitions() {
  const rows = await getRuntime()
    .db.selectFrom('competitions')
    .select('data')
    .orderBy('slug')
    .execute();
  return rows
    .map((row) => competitionSchema.parse(row.data))
    .filter((competition) =>
      ['published', 'running', 'completed'].includes(competition.status),
    );
}
