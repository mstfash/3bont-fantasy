'use client';
import { fantasyTicks, POSITIONS } from '@fantasy/domain';
import type { CompetitionRules } from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { positionNames } from '@/lib/football-labels';
import { RuleNumber, RuleToggle } from './fields';
export function SquadRuleControls({
  locale,
  value,
  onChange,
  frozen,
}: {
  readonly locale: Locale;
  readonly value: CompetitionRules['squad'];
  readonly onChange: (value: CompetitionRules['squad']) => void;
  readonly frozen: boolean;
}) {
  const ar = locale === 'ar';
  return (
    <details className="rule-section">
      <summary>
        {ar ? 'تكوين الفريق والتشكيلات' : 'Squad structure & formations'}
      </summary>
      <p>
        {frozen
          ? ar
            ? 'تكوين الفريق ثابت لهذه البطولة المنشورة. أنشئ بطولة جديدة لتغييره.'
            : 'Squad structure is fixed after the first deadline. Create a new competition to change it.'
          : ar
            ? 'يجب أن يتساوى مجموع حصص المراكز مع حجم الفريق، ومجموع كل تشكيلة مع عدد الأساسيين.'
            : 'Position quotas must total the squad size. Every formation must total the starting lineup size.'}
      </p>
      <div className="form-pair">
        <RuleNumber
          locale={locale}
          helpKey="squadSize"
          label={ar ? 'حجم الفريق' : 'Squad size'}
          value={value.squadSize}
          min={2}
          max={25}
          disabled={frozen}
          onChange={(squadSize) => {
            onChange({ ...value, squadSize });
          }}
        />
        <RuleNumber
          locale={locale}
          helpKey="starters"
          label={ar ? 'عدد الأساسيين' : 'Starting lineup size'}
          value={value.starterCount}
          min={1}
          max={22}
          disabled={frozen}
          onChange={(starterCount) => {
            onChange({ ...value, starterCount });
          }}
        />
        <RuleNumber
          locale={locale}
          helpKey="budget"
          label={ar ? 'ميزانية البداية' : 'Starting fantasy budget'}
          value={value.startingBudget / 10}
          step={0.1}
          max={100000}
          disabled={frozen}
          onChange={(budget) => {
            onChange({
              ...value,
              startingBudget: fantasyTicks(Math.round(budget * 10)),
            });
          }}
        />
        <RuleNumber
          locale={locale}
          helpKey="clubCap"
          label={ar ? 'الحد من النادي الواحد' : 'Maximum footballers per club'}
          value={value.clubCap}
          min={1}
          max={25}
          disabled={frozen}
          onChange={(clubCap) => {
            onChange({ ...value, clubCap });
          }}
        />
        {POSITIONS.map((position) => (
          <RuleNumber
            locale={locale}
            helpKey="quota"
            key={position}
            label={`${positionNames[position][locale]} — ${ar ? 'الحصة' : 'quota'}`}
            value={value.quotas[position]}
            max={25}
            disabled={frozen}
            onChange={(count) => {
              onChange({
                ...value,
                quotas: { ...value.quotas, [position]: count },
              });
            }}
          />
        ))}
      </div>
      <RuleToggle
        locale={locale}
        helpKey="captaincy"
        label={ar ? 'تفعيل الكابتن ونائبه' : 'Enable captain and vice-captain'}
        checked={value.captaincyEnabled}
        disabled={frozen}
        onChange={(captaincyEnabled) => {
          onChange({ ...value, captaincyEnabled });
        }}
      />
      <h3>{ar ? 'التشكيلات المسموحة' : 'Allowed formations'}</h3>
      {value.formations.map((formation, index) => (
        <fieldset className="formation-editor" key={index}>
          <legend>
            {ar ? 'تشكيلة' : 'Formation'} {index + 1}
          </legend>
          <div className="form-pair">
            {POSITIONS.map((position) => (
              <RuleNumber
                locale={locale}
                helpKey="formation"
                key={position}
                label={`${positionNames[position][locale]} / ${String(index + 1)}`}
                value={formation[position]}
                max={25}
                disabled={frozen}
                onChange={(count) => {
                  onChange({
                    ...value,
                    formations: value.formations.map((f, i) =>
                      i === index ? { ...f, [position]: count } : f,
                    ),
                  });
                }}
              />
            ))}
          </div>
          <button
            type="button"
            className="button-outline"
            disabled={frozen || value.formations.length <= 1}
            onClick={() => {
              onChange({
                ...value,
                formations: value.formations.filter((_, i) => i !== index),
              });
            }}
          >
            {ar ? 'حذف التشكيلة' : 'Remove formation'}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="button-outline"
        disabled={frozen || value.formations.length >= 100}
        onClick={() => {
          onChange({
            ...value,
            formations: [
              ...value.formations,
              { GK: 1, DEF: 4, MID: 4, FWD: 2 },
            ],
          });
        }}
      >
        {ar ? 'إضافة تشكيلة' : 'Add formation'}
      </button>
    </details>
  );
}
