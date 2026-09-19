import { points, type PointUnits } from './quantities.ts';
import type { Position } from './squads.ts';

export interface FixtureScoringRules {
  readonly version: string;
  readonly appearance: {
    readonly thresholdMinutes: number;
    readonly short: PointUnits;
    readonly full: PointUnits;
  };
  readonly goal: Readonly<Record<Position, PointUnits>>;
  readonly assist: PointUnits;
  readonly cleanSheet: {
    readonly thresholdMinutes: number;
    readonly award: Readonly<Record<Position, PointUnits>>;
  };
  readonly conceded: {
    readonly perGoals: number;
    readonly award: Readonly<Record<Position, PointUnits>>;
  };
  readonly yellow: PointUnits;
  readonly straightRed: PointUnits;
  readonly secondYellowDismissal: PointUnits;
  readonly saves: { readonly perSaves: number; readonly award: PointUnits };
  readonly penaltySave: PointUnits;
  readonly penaltyMiss: PointUnits;
  readonly ownGoal: PointUnits;
}

export const CLASSIC_SCORING_RULES: FixtureScoringRules = Object.freeze({
  version: 'classic-v1',
  appearance: Object.freeze({
    thresholdMinutes: 60,
    short: points('1'),
    full: points('2'),
  }),
  goal: Object.freeze({
    GK: points('10'),
    DEF: points('6'),
    MID: points('5'),
    FWD: points('4'),
  }),
  assist: points('3'),
  cleanSheet: Object.freeze({
    thresholdMinutes: 60,
    award: Object.freeze({
      GK: points('4'),
      DEF: points('4'),
      MID: points('1'),
      FWD: points('0'),
    }),
  }),
  conceded: Object.freeze({
    perGoals: 2,
    award: Object.freeze({
      GK: points('-1'),
      DEF: points('-1'),
      MID: points('0'),
      FWD: points('0'),
    }),
  }),
  yellow: points('-1'),
  straightRed: points('-3'),
  secondYellowDismissal: points('-3'),
  saves: Object.freeze({ perSaves: 3, award: points('1') }),
  penaltySave: points('5'),
  penaltyMiss: points('-2'),
  ownGoal: points('-2'),
});
