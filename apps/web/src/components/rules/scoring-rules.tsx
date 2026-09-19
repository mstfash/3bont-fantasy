'use client';
import { pointUnits, POSITIONS } from '@fantasy/domain';
import type { CompetitionRules } from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { positionNames } from '@/lib/football-labels';
import { RuleNumber } from './fields';
export function ScoringRuleControls({
  locale,
  value,
  onChange,
}: {
  readonly locale: Locale;
  readonly value: CompetitionRules['scoring'];
  readonly onChange: (value: CompetitionRules['scoring']) => void;
}) {
  const ar = locale === 'ar';
  const awards = [
    ['assist', 'Assist', 'التمريرة الحاسمة'],
    ['yellow', 'Yellow card', 'الإنذار'],
    ['straightRed', 'Straight red', 'الطرد المباشر'],
    [
      'secondYellowDismissal',
      'Second-yellow dismissal total',
      'إجمالي الطرد بإنذار ثانٍ',
    ],
    ['penaltySave', 'Penalty saved', 'صد ركلة جزاء'],
    ['penaltyMiss', 'Penalty missed', 'إهدار ركلة جزاء'],
    ['ownGoal', 'Own goal', 'الهدف العكسي'],
  ] as const;
  return (
    <details className="rule-section">
      <summary>{ar ? 'نقاط أداء اللاعبين' : 'Footballer scoring'}</summary>
      <p>
        {ar
          ? 'القيم بالنقاط الظاهرة للمشارك. تعديلاتك تطبق على الجولات المستقبلية غير المغلقة.'
          : 'Values are participant-facing points. Changes apply to future unlocked gameweeks.'}
      </p>
      <div className="form-pair">
        <RuleNumber
          locale={locale}
          helpKey="appearanceThreshold"
          label={
            ar
              ? 'حد دقائق المشاركة الكاملة'
              : 'Full appearance threshold (minutes)'
          }
          value={value.appearance.thresholdMinutes}
          min={1}
          max={180}
          onChange={(thresholdMinutes) => {
            onChange({
              ...value,
              appearance: { ...value.appearance, thresholdMinutes },
            });
          }}
        />
        <RuleNumber
          locale={locale}
          helpKey="shortAppearance"
          label={ar ? 'نقاط المشاركة القصيرة' : 'Short appearance points'}
          value={value.appearance.short / 1000}
          min={-1000}
          step={0.001}
          onChange={(n) => {
            onChange({
              ...value,
              appearance: {
                ...value.appearance,
                short: pointUnits(Math.round(n * 1000)),
              },
            });
          }}
        />
        <RuleNumber
          locale={locale}
          helpKey="fullAppearance"
          label={ar ? 'نقاط المشاركة الكاملة' : 'Full appearance points'}
          value={value.appearance.full / 1000}
          min={-1000}
          step={0.001}
          onChange={(n) => {
            onChange({
              ...value,
              appearance: {
                ...value.appearance,
                full: pointUnits(Math.round(n * 1000)),
              },
            });
          }}
        />
        <RuleNumber
          locale={locale}
          helpKey="cleanThreshold"
          label={
            ar ? 'حد دقائق الشباك النظيفة' : 'Clean-sheet threshold (minutes)'
          }
          value={value.cleanSheet.thresholdMinutes}
          min={1}
          max={180}
          onChange={(thresholdMinutes) => {
            onChange({
              ...value,
              cleanSheet: { ...value.cleanSheet, thresholdMinutes },
            });
          }}
        />
        <RuleNumber
          locale={locale}
          helpKey="concededGroup"
          label={ar ? 'كل كم هدف مستقبل؟' : 'Conceded-goal group size'}
          value={value.conceded.perGoals}
          min={1}
          max={100}
          onChange={(perGoals) => {
            onChange({ ...value, conceded: { ...value.conceded, perGoals } });
          }}
        />
        <RuleNumber
          locale={locale}
          helpKey="savesGroup"
          label={ar ? 'كل كم تصدٍ؟' : 'Save group size'}
          value={value.saves.perSaves}
          min={1}
          max={100}
          onChange={(perSaves) => {
            onChange({ ...value, saves: { ...value.saves, perSaves } });
          }}
        />
        <RuleNumber
          locale={locale}
          helpKey="savesAward"
          label={ar ? 'نقاط مجموعة التصديات' : 'Points per save group'}
          value={value.saves.award / 1000}
          min={-1000}
          step={0.001}
          onChange={(n) => {
            onChange({
              ...value,
              saves: {
                ...value.saves,
                award: pointUnits(Math.round(n * 1000)),
              },
            });
          }}
        />
        {awards.map(([key, en, arabic]) => (
          <RuleNumber
            locale={locale}
            helpKey={key}
            key={key}
            label={ar ? arabic : en}
            value={value[key] / 1000}
            min={-1000}
            step={0.001}
            onChange={(n) => {
              onChange({ ...value, [key]: pointUnits(Math.round(n * 1000)) });
            }}
          />
        ))}
        {POSITIONS.map((position) => (
          <RuleNumber
            locale={locale}
            helpKey="goal"
            key={`goal-${position}`}
            label={`${ar ? 'هدف' : 'Goal'} — ${positionNames[position][locale]}`}
            value={value.goal[position] / 1000}
            min={-1000}
            step={0.001}
            onChange={(n) => {
              onChange({
                ...value,
                goal: {
                  ...value.goal,
                  [position]: pointUnits(Math.round(n * 1000)),
                },
              });
            }}
          />
        ))}
        {POSITIONS.map((position) => (
          <RuleNumber
            locale={locale}
            helpKey="cleanAward"
            key={`clean-${position}`}
            label={`${ar ? 'شباك نظيفة' : 'Clean sheet'} — ${positionNames[position][locale]}`}
            value={value.cleanSheet.award[position] / 1000}
            min={-1000}
            step={0.001}
            onChange={(n) => {
              onChange({
                ...value,
                cleanSheet: {
                  ...value.cleanSheet,
                  award: {
                    ...value.cleanSheet.award,
                    [position]: pointUnits(Math.round(n * 1000)),
                  },
                },
              });
            }}
          />
        ))}
        {POSITIONS.map((position) => (
          <RuleNumber
            locale={locale}
            helpKey="concededAward"
            key={`conceded-${position}`}
            label={`${ar ? 'أهداف مستقبلة' : 'Conceded'} — ${positionNames[position][locale]}`}
            value={value.conceded.award[position] / 1000}
            min={-1000}
            step={0.001}
            onChange={(n) => {
              onChange({
                ...value,
                conceded: {
                  ...value.conceded,
                  award: {
                    ...value.conceded.award,
                    [position]: pointUnits(Math.round(n * 1000)),
                  },
                },
              });
            }}
          />
        ))}
      </div>
    </details>
  );
}
