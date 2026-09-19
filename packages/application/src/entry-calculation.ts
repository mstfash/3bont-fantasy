import {
  entryResultSchema,
  type Gameweek,
  type PlayerRoundResult,
} from '@fantasy/contracts';
import { scoreGameweek, type LockedEntry } from '@fantasy/domain';

/** One calculator for publication and correction previews, including sporting tie-break inputs. */
export function calculateEntryResult(
  locked: LockedEntry,
  round: Gameweek,
  playersById: ReadonlyMap<string, PlayerRoundResult>,
  settled: boolean,
) {
  const players = locked.roster.holdings.flatMap((holding) => {
    const player = playersById.get(holding.footballerId);
    return player ? [player] : [];
  });
  const result = scoreGameweek(
    locked,
    players,
    round.rules.squad,
    round.rules.gameweek,
    settled ? 'settled' : 'live',
  );
  if (result.status === 'blocked') return result;
  return {
    status: 'scored' as const,
    payload: entryResultSchema.parse({
      effectiveIds: result.effectiveIds,
      substitutions: result.substitutions,
      captainId: result.captainId,
      captainExtra: result.captainExtra,
      playersTotal: result.playersTotal,
      transferDeduction: result.transferDeduction,
      total: result.total,
      settled,
      players,
      goals: players
        .filter((player) => result.effectiveIds.includes(player.footballerId))
        .reduce((sum, player) => sum + player.goals, 0),
    }),
  };
}
