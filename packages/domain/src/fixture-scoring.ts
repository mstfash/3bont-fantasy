import {
  multiplyPoints,
  pointUnits,
  sumPoints,
  type PointUnits,
} from './quantities.ts';
import type { FixtureScoringRules } from './scoring-rules.ts';
import { POSITIONS, type Position } from './squads.ts';

export type Discipline =
  | { readonly kind: 'none' }
  | { readonly kind: 'yellow' }
  | { readonly kind: 'second-yellow' }
  | { readonly kind: 'straight-red'; readonly priorYellow: boolean };

export interface FixtureStatistics {
  readonly minutes: number | null;
  readonly goals: number | null;
  readonly assists: number | null;
  readonly ownGoals: number | null;
  readonly penaltyMisses: number | null;
  readonly concededWhileOnPitch: number | null;
  readonly concededAfterDismissal: number | null;
  /** Already includes penalty saves; the scorer must not add them again. */
  readonly savesIncludingPenalties: number | null;
  readonly penaltySaves: number | null;
}

/** Normalized non-shootout facts. The adapter must establish participation/event ordering. */
export interface FixturePerformance {
  readonly fixtureId: string;
  readonly footballerId: string;
  readonly factRevision: string;
  readonly position: Position;
  readonly statistics: FixtureStatistics;
  readonly discipline: Discipline | null;
}

export type ScoreCategory =
  | 'appearance'
  | 'goals'
  | 'assists'
  | 'clean-sheet'
  | 'conceded'
  | 'discipline'
  | 'saves'
  | 'penalty-saves'
  | 'penalty-misses'
  | 'own-goals';

export interface ScoreComponent {
  readonly category: ScoreCategory;
  readonly points: PointUnits;
}

export interface ScoringIssue {
  readonly code: 'missing-fact' | 'invalid-fact' | 'invalid-rules';
  readonly path: string;
}

export type FixtureScore =
  | { readonly status: 'blocked'; readonly issues: readonly ScoringIssue[] }
  | {
      readonly status: 'scored';
      readonly fixtureId: string;
      readonly footballerId: string;
      readonly factRevision: string;
      readonly rulesVersion: string;
      readonly calculationVersion: 'fixture-v1';
      readonly breakdown: readonly ScoreComponent[];
      readonly total: PointUnits;
    };

function rulesIssues(rules: FixtureScoringRules): ScoringIssue[] {
  const issues: ScoringIssue[] = [];
  if (!rules.version.trim())
    issues.push({ code: 'invalid-rules', path: 'version' });
  const thresholds = {
    appearanceThreshold: rules.appearance.thresholdMinutes,
    cleanSheetThreshold: rules.cleanSheet.thresholdMinutes,
    concededGroup: rules.conceded.perGoals,
    saveGroup: rules.saves.perSaves,
  };
  for (const [path, value] of Object.entries(thresholds)) {
    if (!Number.isSafeInteger(value) || value < 1)
      issues.push({ code: 'invalid-rules', path });
  }
  const awards = [
    rules.appearance.short,
    rules.appearance.full,
    ...Object.values(rules.goal),
    rules.assist,
    ...Object.values(rules.cleanSheet.award),
    ...Object.values(rules.conceded.award),
    rules.yellow,
    rules.straightRed,
    rules.secondYellowDismissal,
    rules.saves.award,
    rules.penaltySave,
    rules.penaltyMiss,
    rules.ownGoal,
  ];
  if (awards.some((value) => !Number.isSafeInteger(value)))
    issues.push({ code: 'invalid-rules', path: 'awards' });
  return issues;
}

function disciplinePoints(
  discipline: Discipline,
  rules: FixtureScoringRules,
): PointUnits {
  switch (discipline.kind) {
    case 'none':
      return pointUnits(0);
    case 'yellow':
      return rules.yellow;
    case 'second-yellow':
      return rules.secondYellowDismissal;
    case 'straight-red':
      return sumPoints([
        rules.straightRed,
        discipline.priorYellow ? rules.yellow : pointUnits(0),
      ]);
  }
}

export function scoreFixture(
  performance: FixturePerformance,
  rules: FixtureScoringRules,
): FixtureScore {
  const issues = rulesIssues(rules);
  if (issues.length > 0) return { status: 'blocked', issues };
  if (
    !performance.fixtureId.trim() ||
    !performance.footballerId.trim() ||
    !performance.factRevision.trim() ||
    !POSITIONS.includes(performance.position)
  ) {
    return {
      status: 'blocked',
      issues: [{ code: 'invalid-fact', path: 'identity' }],
    };
  }
  const stats = performance.statistics;
  for (const [path, value] of Object.entries(stats)) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
      issues.push({ code: 'invalid-fact', path });
    }
  }
  // Missing values use placeholders only during validation; no score is returned if required data is absent.
  const required = (key: keyof FixtureStatistics, needed = true): number => {
    const value = stats[key];
    if (value === null) {
      if (needed) issues.push({ code: 'missing-fact', path: key });
      return 0;
    }
    return value;
  };
  const position = performance.position;
  const discipline = performance.discipline;
  if (discipline === null)
    issues.push({ code: 'missing-fact', path: 'discipline' });
  const dismissed =
    discipline?.kind === 'second-yellow' || discipline?.kind === 'straight-red';
  const minutes = required('minutes');
  const goals = required('goals', rules.goal[position] !== 0);
  const assists = required('assists', rules.assist !== 0);
  const ownGoals = required('ownGoals', rules.ownGoal !== 0);
  const penaltyMisses = required('penaltyMisses', rules.penaltyMiss !== 0);
  const cleanSheetPossible =
    !dismissed &&
    minutes >= rules.cleanSheet.thresholdMinutes &&
    rules.cleanSheet.award[position] !== 0;
  const conceded = required(
    'concededWhileOnPitch',
    cleanSheetPossible || rules.conceded.award[position] !== 0,
  );
  const afterDismissal = required(
    'concededAfterDismissal',
    dismissed && rules.conceded.award[position] !== 0,
  );
  const saves = required(
    'savesIncludingPenalties',
    position === 'GK' && rules.saves.award !== 0,
  );
  const penaltySaves = required(
    'penaltySaves',
    position === 'GK' && rules.penaltySave !== 0,
  );
  if (
    position === 'GK' &&
    stats.penaltySaves !== null &&
    stats.savesIncludingPenalties !== null &&
    penaltySaves > saves
  )
    issues.push({ code: 'invalid-fact', path: 'penaltySaves' });
  if (!dismissed && afterDismissal !== 0)
    issues.push({ code: 'invalid-fact', path: 'concededAfterDismissal' });
  if (issues.length > 0 || discipline === null)
    return { status: 'blocked', issues };

  const totalConceded = conceded + (dismissed ? afterDismissal : 0);
  if (!Number.isSafeInteger(totalConceded)) {
    return {
      status: 'blocked',
      issues: [{ code: 'invalid-fact', path: 'totalConceded' }],
    };
  }

  const breakdown: ScoreComponent[] = [
    {
      category: 'appearance',
      points:
        minutes === 0
          ? pointUnits(0)
          : minutes >= rules.appearance.thresholdMinutes
            ? rules.appearance.full
            : rules.appearance.short,
    },
    { category: 'goals', points: multiplyPoints(rules.goal[position], goals) },
    { category: 'assists', points: multiplyPoints(rules.assist, assists) },
    {
      category: 'clean-sheet',
      points:
        cleanSheetPossible && conceded === 0
          ? rules.cleanSheet.award[position]
          : pointUnits(0),
    },
    {
      category: 'conceded',
      points: multiplyPoints(
        rules.conceded.award[position],
        Math.floor(totalConceded / rules.conceded.perGoals),
      ),
    },
    { category: 'discipline', points: disciplinePoints(discipline, rules) },
    {
      category: 'saves',
      points:
        position === 'GK'
          ? multiplyPoints(
              rules.saves.award,
              Math.floor(saves / rules.saves.perSaves),
            )
          : pointUnits(0),
    },
    {
      category: 'penalty-saves',
      points:
        position === 'GK'
          ? multiplyPoints(rules.penaltySave, penaltySaves)
          : pointUnits(0),
    },
    {
      category: 'penalty-misses',
      points: multiplyPoints(rules.penaltyMiss, penaltyMisses),
    },
    { category: 'own-goals', points: multiplyPoints(rules.ownGoal, ownGoals) },
  ];
  return {
    status: 'scored',
    fixtureId: performance.fixtureId,
    footballerId: performance.footballerId,
    factRevision: performance.factRevision,
    rulesVersion: rules.version,
    calculationVersion: 'fixture-v1',
    breakdown,
    total: sumPoints(breakdown.map((item) => item.points)),
  };
}
