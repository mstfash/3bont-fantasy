import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CLASSIC_SCORING_RULES,
  points,
  scoreFixture,
  sumPoints,
} from '../src/index.ts';
import type {
  FixturePerformance,
  FixtureScore,
  FixtureStatistics,
  ScoreCategory,
} from '../src/index.ts';

// Synthetic normalized facts. They do not assert any provider has these fields.
function performance(
  statistics: Partial<FixtureStatistics> = {},
  changes: Partial<Omit<FixturePerformance, 'statistics'>> = {},
): FixturePerformance {
  return {
    fixtureId: 'synthetic-fixture',
    footballerId: 'synthetic-footballer',
    factRevision: 'facts-1',
    position: 'DEF',
    discipline: { kind: 'none' },
    statistics: {
      minutes: 90,
      goals: 0,
      assists: 0,
      ownGoals: 0,
      penaltyMisses: 0,
      concededWhileOnPitch: 0,
      concededAfterDismissal: 0,
      savesIncludingPenalties: 0,
      penaltySaves: 0,
      ...statistics,
    },
    ...changes,
  };
}

function component(result: FixtureScore, category: ScoreCategory): number {
  assert.equal(result.status, 'scored');
  const found = result.breakdown.find((item) => item.category === category);
  assert.ok(found);
  return found.points;
}

void test('A38: appearance tiers at zero, 59 and 60 minutes are mutually exclusive', () => {
  for (const [minutes, expected] of [
    [0, '0'],
    [59, '1'],
    [60, '2'],
  ] as const) {
    assert.equal(
      component(
        scoreFixture(performance({ minutes }), CLASSIC_SCORING_RULES),
        'appearance',
      ),
      points(expected),
    );
  }
});

void test('A38: two short fixtures do not combine into a 60-minute clean sheet', () => {
  const a = scoreFixture(performance({ minutes: 30 }), CLASSIC_SCORING_RULES);
  const b = scoreFixture(
    performance({ minutes: 30 }, { fixtureId: 'second-fixture' }),
    CLASSIC_SCORING_RULES,
  );
  assert.ok(a.status === 'scored' && b.status === 'scored');
  assert.equal(sumPoints([a.total, b.total]), points('2'));
});

void test('Q12: positional goals and assists use the selected rule version', () => {
  for (const [position, goal] of [
    ['GK', '10'],
    ['DEF', '6'],
    ['MID', '5'],
    ['FWD', '4'],
  ] as const) {
    const result = scoreFixture(
      performance({ goals: 1, assists: 2 }, { position }),
      CLASSIC_SCORING_RULES,
    );
    assert.equal(component(result, 'goals'), points(goal));
    assert.equal(component(result, 'assists'), points('6'));
  }
});

void test('A39: substitution at 65 keeps clean sheet when later conceded goals are outside participation', () => {
  const result = scoreFixture(
    performance({ minutes: 65 }),
    CLASSIC_SCORING_RULES,
  );
  assert.equal(component(result, 'clean-sheet'), points('4'));
  assert.equal(component(result, 'conceded'), points('0'));
  assert.equal(
    component(
      scoreFixture(performance({ minutes: 59 }), CLASSIC_SCORING_RULES),
      'clean-sheet',
    ),
    points('0'),
  );
});

void test('A39: concessions are floored per fixture, never across fixtures', () => {
  for (const [concededWhileOnPitch, expected] of [
    [1, '0'],
    [2, '-1'],
    [3, '-1'],
    [4, '-2'],
  ] as const) {
    const result = scoreFixture(
      performance({ concededWhileOnPitch }),
      CLASSIC_SCORING_RULES,
    );
    assert.equal(component(result, 'conceded'), points(expected));
    assert.equal(component(result, 'clean-sheet'), points('0'));
  }
});

void test('A40: second-yellow total replaces yellows; separate yellow and straight red remain additive', () => {
  for (const [discipline, expected] of [
    [{ kind: 'yellow' }, '-1'],
    [{ kind: 'second-yellow' }, '-3'],
    [{ kind: 'straight-red', priorYellow: false }, '-3'],
    [{ kind: 'straight-red', priorYellow: true }, '-4'],
  ] as const)
    assert.equal(
      component(
        scoreFixture(performance({}, { discipline }), CLASSIC_SCORING_RULES),
        'discipline',
      ),
      points(expected),
    );
});

void test('A40: dismissed defender loses clean sheet and remains liable for later concessions', () => {
  const result = scoreFixture(
    performance(
      { minutes: 70, concededWhileOnPitch: 1, concededAfterDismissal: 3 },
      { discipline: { kind: 'straight-red', priorYellow: false } },
    ),
    CLASSIC_SCORING_RULES,
  );
  assert.equal(component(result, 'clean-sheet'), points('0'));
  assert.equal(component(result, 'conceded'), points('-2'));
  const noGoals = scoreFixture(
    performance({}, { discipline: { kind: 'second-yellow' } }),
    CLASSIC_SCORING_RULES,
  );
  assert.equal(component(noGoals, 'clean-sheet'), points('0'));
});

void test('A41: penalty save earns the additional award without inflating total saves', () => {
  const result = scoreFixture(
    performance(
      { savesIncludingPenalties: 3, penaltySaves: 1 },
      { position: 'GK' },
    ),
    CLASSIC_SCORING_RULES,
  );
  assert.equal(component(result, 'saves'), points('1'));
  assert.equal(component(result, 'penalty-saves'), points('5'));
  const belowThreshold = scoreFixture(
    performance(
      { savesIncludingPenalties: 2, penaltySaves: 1 },
      { position: 'GK' },
    ),
    CLASSIC_SCORING_RULES,
  );
  assert.equal(component(belowThreshold, 'saves'), points('0'));
});

void test('A41: own goal affects both own-goal and supplied concession facts; missed penalty also deducts', () => {
  const result = scoreFixture(
    performance({ ownGoals: 1, concededWhileOnPitch: 2, penaltyMisses: 1 }),
    CLASSIC_SCORING_RULES,
  );
  assert.equal(component(result, 'own-goals'), points('-2'));
  assert.equal(component(result, 'penalty-misses'), points('-2'));
  assert.equal(component(result, 'conceded'), points('-1'));
  assert.equal(component(result, 'clean-sheet'), points('0'));
});

void test('missing required statistics produce a blocked result, never invented zero points', () => {
  for (const key of [
    'minutes',
    'goals',
    'assists',
    'ownGoals',
    'penaltyMisses',
    'concededWhileOnPitch',
  ] as const) {
    const result = scoreFixture(
      performance({ [key]: null }),
      CLASSIC_SCORING_RULES,
    );
    assert.ok(result.status === 'blocked');
    assert.ok(
      result.issues.some((i) => i.code === 'missing-fact' && i.path === key),
    );
    assert.equal('total' in result, false);
  }
  assert.equal(
    scoreFixture(performance({}, { discipline: null }), CLASSIC_SCORING_RULES)
      .status,
    'blocked',
  );
});

void test('irrelevant goalkeeper statistics do not block outfield scoring', () => {
  assert.equal(
    scoreFixture(
      performance({ savesIncludingPenalties: null, penaltySaves: null }),
      CLASSIC_SCORING_RULES,
    ).status,
    'scored',
  );
  assert.equal(
    scoreFixture(
      performance({ savesIncludingPenalties: null }, { position: 'GK' }),
      CLASSIC_SCORING_RULES,
    ).status,
    'blocked',
  );
});

void test('disabled assist award does not require an unavailable assist input', () => {
  assert.equal(
    scoreFixture(performance({ assists: null }), {
      ...CLASSIC_SCORING_RULES,
      assist: points('0'),
    }).status,
    'scored',
  );
});

void test('invalid negative/fractional/nonfinite statistics and inconsistent penalty saves are blocked', () => {
  for (const goals of [-1, 0.5, NaN, Infinity]) {
    assert.equal(
      scoreFixture(performance({ goals }), CLASSIC_SCORING_RULES).status,
      'blocked',
    );
  }
  assert.equal(
    scoreFixture(
      performance(
        { savesIncludingPenalties: 1, penaltySaves: 2 },
        { position: 'GK' },
      ),
      CLASSIC_SCORING_RULES,
    ).status,
    'blocked',
  );
  assert.equal(
    scoreFixture(
      performance({ concededAfterDismissal: 1 }),
      CLASSIC_SCORING_RULES,
    ).status,
    'blocked',
  );
});

void test('invalid division groups and empty rule revisions cannot publish a score', () => {
  for (const rules of [
    { ...CLASSIC_SCORING_RULES, version: '' },
    {
      ...CLASSIC_SCORING_RULES,
      saves: { ...CLASSIC_SCORING_RULES.saves, perSaves: 0 },
    },
    {
      ...CLASSIC_SCORING_RULES,
      appearance: {
        ...CLASSIC_SCORING_RULES.appearance,
        thresholdMinutes: 0.5,
      },
    },
  ])
    assert.equal(scoreFixture(performance(), rules).status, 'blocked');
});

void test('configurable fractional points and thresholds keep exact totals and provenance', () => {
  const result = scoreFixture(performance({ minutes: 45, assists: 1 }), {
    ...CLASSIC_SCORING_RULES,
    version: 'custom-v2',
    assist: points('0.125'),
    appearance: {
      thresholdMinutes: 45,
      short: points('0.5'),
      full: points('1.5'),
    },
  });
  assert.ok(result.status === 'scored');
  assert.equal(result.total, points('1.625'));
  assert.equal(result.rulesVersion, 'custom-v2');
  assert.equal(result.factRevision, 'facts-1');
  assert.equal(result.calculationVersion, 'fixture-v1');
});

void test('replay is deterministic; corrected facts create a new attributable result without mutation', () => {
  const original = performance({ goals: 1 });
  const snapshot = JSON.stringify(original);
  const a = scoreFixture(original, CLASSIC_SCORING_RULES);
  assert.deepEqual(scoreFixture(original, CLASSIC_SCORING_RULES), a);
  const corrected = scoreFixture(
    performance({ goals: 0 }, { factRevision: 'facts-2' }),
    CLASSIC_SCORING_RULES,
  );
  assert.ok(a.status === 'scored' && corrected.status === 'scored');
  assert.equal(a.total - corrected.total, points('6'));
  assert.equal(JSON.stringify(original), snapshot);
  assert.equal(corrected.factRevision, 'facts-2');
});
