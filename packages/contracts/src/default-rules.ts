import {
  CHIPS,
  CLASSIC_GAMEWEEK_OPTIONS,
  CLASSIC_SCORING_RULES,
  CLASSIC_SQUAD_RULES,
  CLASSIC_TRANSFER_RULES,
} from '@fantasy/domain';
import { competitionRulesSchema } from './rules.ts';

export function defaultCompetitionRules() {
  return competitionRulesSchema.parse({
    version: 1,
    squad: CLASSIC_SQUAD_RULES,
    transfer: CLASSIC_TRANSFER_RULES,
    scoring: CLASSIC_SCORING_RULES,
    gameweek: CLASSIC_GAMEWEEK_OPTIONS,
    enabledChips: CHIPS,
    chipInventory: {
      wildcard: 1,
      'free-hit': 1,
      'bench-boost': 1,
      'triple-captain': 1,
    },
    chipWindows: [],
    ranking: 'shared',
    deadlineOffsetMinutes: 90,
    correctionWindowHours: 24,
  });
}
