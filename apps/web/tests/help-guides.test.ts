import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  competitionRulesSchema,
  defaultCompetitionRules,
  gameweekSchema,
} from '@fantasy/contracts';
import { guideGameweek, playingSteps } from '../src/lib/help/guide-rules.ts';
import { helpCopy, helpTopics, pageHelpTopic } from '../src/lib/help/topics.ts';
const first = defaultCompetitionRules();
const second = competitionRulesSchema.parse({
  ...first,
  version: 2,
  squad: { ...first.squad, startingBudget: 1230, captaincyEnabled: false },
  transfer: {
    ...first.transfer,
    allowance: 2,
    carryCap: 9,
    extraTransferCost: 7500,
  },
  gameweek: { ...first.gameweek, automaticSubstitutions: false },
  enabledChips: [],
  correctionWindowHours: 37,
});
const competitionId = randomUUID();
function round(number: number, status: 'locked' | 'upcoming', rules = first) {
  return gameweekSchema.parse({
    id: randomUUID(),
    competitionId,
    number,
    name: { en: `Round ${String(number)}`, ar: `جولة ${String(number)}` },
    deadline: `2026-10-${number === 1 ? '01' : '15'}T12:00:00Z`,
    status,
    rules,
    resultRevision: 0,
    lastMaterialChangeAt: null,
    finalizedAt: null,
    issues: [],
  });
}
void test('guide uses the eligible round version and preserves explicitly selected historical explanations', () => {
  const old = round(1, 'locked'),
    upcoming = round(2, 'upcoming', second),
    rounds = [old, upcoming];
  const current = guideGameweek(
    rounds,
    undefined,
    Date.parse('2026-10-02T00:00:00Z'),
  );
  assert.equal(current?.rules.version, 2);
  assert.equal(guideGameweek(rounds, old.id, Date.now())?.rules.version, 1);
  assert.equal(
    guideGameweek(rounds, undefined, Date.parse('2027-01-01T00:00:00Z'))?.id,
    upcoming.id,
  );
  assert.throws(
    () => guideGameweek(rounds, randomUUID(), Date.now()),
    RangeError,
  );
  assert.equal(guideGameweek([], undefined, Date.now()), undefined);
});
void test('both languages reflect changed budgets, transfer costs, disabled options and finality without changing old rules', () => {
  for (const locale of ['ar', 'en'] as const) {
    const before = playingSteps(first, locale).join(' '),
      after = playingSteps(second, locale).join(' ');
    assert.notEqual(before, after);
    for (const value of [123, 2, 9, 7.5, 37])
      assert.ok(after.includes(value.toLocaleString(locale)));
    assert.ok(
      after.includes(
        locale === 'ar' ? 'الكابتنية غير مفعّلة' : 'Captaincy is disabled',
      ),
    );
    assert.ok(
      after.includes(
        locale === 'ar'
          ? 'التبديلات التلقائية غير مفعّلة'
          : 'Automatic substitutions are disabled',
      ),
    );
    assert.ok(before.includes((100).toLocaleString(locale)));
  }
  assert.equal(first.squad.startingBudget, 1000);
});
void test('every contextual help topic has both translations and route-specific explanations', () => {
  for (const [enTitle, enText, arTitle, arText] of Object.values(helpTopics)) {
    assert.ok(enText.length > 20 && arText.length > 20);
    assert.notEqual(enTitle, arTitle);
  }
  for (const topic of [
    'play',
    'squad',
    'market',
    'groups',
    'h2h',
    'chat',
    'prizes',
    'achievements',
    'profile',
    'security',
    'administration',
    'configuration',
    'catalogue',
    'providers',
    'matches',
    'results',
    'prices',
    'staff',
    'operations',
    'sponsors',
    'review',
  ] as const) {
    const en = helpCopy(topic, 'en'),
      ar = helpCopy(topic, 'ar');
    assert.ok(en.text.length > 20 && ar.text.length > 20);
    assert.notEqual(en.title, ar.title);
    assert.notEqual(en.text, ar.text);
  }
  assert.equal(pageHelpTopic('/ar/admin/providers/schedules'), 'providers');
  assert.equal(
    pageHelpTopic('/en/admin/competitions/example/prices'),
    'prices',
  );
  assert.equal(pageHelpTopic('/ar/groups/example/chat'), 'chat');
  assert.equal(pageHelpTopic('/en/admin/prizes/example'), 'prizes');
  assert.equal(pageHelpTopic('/en/entries/example'), 'squad');
});
