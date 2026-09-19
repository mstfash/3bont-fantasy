'use client';
import { CHIPS, fantasyTicks, pointUnits } from '@fantasy/domain';
import type { CompetitionRules } from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { RuleNumber, RuleToggle } from './fields';
import { SquadRuleControls } from './squad-rules';
import { ScoringRuleControls } from './scoring-rules';
const names = {
  wildcard: { en: 'Wildcard', ar: 'وايلد كارد' },
  'free-hit': { en: 'Free Hit', ar: 'فري هيت' },
  'bench-boost': { en: 'Bench Boost', ar: 'دكة البدلاء' },
  'triple-captain': { en: 'Triple Captain', ar: 'تريبل كابتن' },
};
export function CompetitionRuleControls({
  locale,
  value,
  onChange,
  frozen,
}: {
  readonly locale: Locale;
  readonly value: CompetitionRules;
  readonly onChange: (value: CompetitionRules) => void;
  readonly frozen: boolean;
}) {
  const ar = locale === 'ar';
  return (
    <div className="rule-controls">
      <SquadRuleControls
        locale={locale}
        value={value.squad}
        frozen={frozen}
        onChange={(squad) => {
          onChange({ ...value, squad });
        }}
      />
      <details className="rule-section">
        <summary>
          {ar
            ? 'الانتقالات والكابتن والجولات'
            : 'Transfers, captaincy & gameweeks'}
        </summary>
        <div className="form-pair">
          <RuleNumber
            locale={locale}
            helpKey="allowance"
            label={
              ar ? 'انتقالات مجانية لكل جولة' : 'Free transfers per gameweek'
            }
            value={value.transfer.allowance}
            max={100}
            onChange={(allowance) => {
              onChange({
                ...value,
                transfer: { ...value.transfer, allowance },
              });
            }}
          />
          <RuleNumber
            locale={locale}
            helpKey="carryCap"
            label={ar ? 'سقف الانتقالات المدخرة' : 'Saved-transfer cap'}
            value={value.transfer.carryCap}
            max={100}
            onChange={(carryCap) => {
              onChange({ ...value, transfer: { ...value.transfer, carryCap } });
            }}
          />
          <RuleNumber
            locale={locale}
            helpKey="transferCost"
            label={
              ar ? 'خصم الانتقال الإضافي' : 'Points deducted per extra transfer'
            }
            value={value.transfer.extraTransferCost / 1000}
            step={0.001}
            onChange={(n) => {
              onChange({
                ...value,
                transfer: {
                  ...value.transfer,
                  extraTransferCost: pointUnits(Math.round(n * 1000)),
                },
              });
            }}
          />
          <label>
            {ar ? 'سياسة البيع' : 'Selling-price policy'}
            <select
              value={value.transfer.sellingPolicy}
              onChange={(event) => {
                const sellingPolicy = event.target.value;
                if (
                  sellingPolicy === 'half-gain-full-loss' ||
                  sellingPolicy === 'current-price'
                )
                  onChange({
                    ...value,
                    transfer: { ...value.transfer, sellingPolicy },
                  });
              }}
            >
              <option value="half-gain-full-loss">
                {ar ? 'نصف المكسب، كامل الخسارة' : 'Half the gain, full losses'}
              </option>
              <option value="current-price">
                {ar ? 'السعر الحالي بالكامل' : 'Full current price'}
              </option>
            </select>
          </label>
          <RuleNumber
            locale={locale}
            helpKey="captainMultiplier"
            label={ar ? 'مضاعف الكابتن' : 'Captain multiplier'}
            value={value.gameweek.captainMultiplier}
            min={1}
            max={10}
            onChange={(captainMultiplier) => {
              onChange({
                ...value,
                gameweek: { ...value.gameweek, captainMultiplier },
              });
            }}
          />
          <RuleNumber
            locale={locale}
            helpKey="tripleMultiplier"
            label={ar ? 'مضاعف التريبل كابتن' : 'Triple Captain multiplier'}
            value={value.gameweek.tripleCaptainMultiplier}
            min={1}
            max={10}
            onChange={(tripleCaptainMultiplier) => {
              onChange({
                ...value,
                gameweek: { ...value.gameweek, tripleCaptainMultiplier },
              });
            }}
          />
          <RuleNumber
            locale={locale}
            helpKey="deadline"
            label={
              ar
                ? 'دقائق الإغلاق قبل أول مباراة'
                : 'Default deadline before kickoff (minutes)'
            }
            value={value.deadlineOffsetMinutes}
            max={10080}
            onChange={(deadlineOffsetMinutes) => {
              onChange({ ...value, deadlineOffsetMinutes });
            }}
          />
          <RuleNumber
            locale={locale}
            helpKey="correction"
            label={ar ? 'نافذة التصحيح بالساعات' : 'Correction window (hours)'}
            value={value.correctionWindowHours}
            max={168}
            onChange={(correctionWindowHours) => {
              onChange({ ...value, correctionWindowHours });
            }}
          />
          <label>
            {ar ? 'التعادل في الترتيب' : 'Ranking ties'}
            <select
              disabled={frozen}
              value={value.ranking}
              onChange={(event) => {
                const ranking = event.target.value;
                if (ranking === 'shared' || ranking === 'deductions-then-goals')
                  onChange({ ...value, ranking });
              }}
            >
              <option value="shared">
                {ar ? 'مركز مشترك' : 'Shared ranks'}
              </option>
              <option value="deductions-then-goals">
                {ar
                  ? 'خصومات أقل ثم أهداف أكثر'
                  : 'Fewer deductions, then more goals'}
              </option>
            </select>
          </label>
        </div>
        <RuleToggle
          locale={locale}
          helpKey="autoSubs"
          label={
            ar ? 'تفعيل التبديلات التلقائية' : 'Enable automatic substitutions'
          }
          checked={value.gameweek.automaticSubstitutions}
          onChange={(automaticSubstitutions) => {
            onChange({
              ...value,
              gameweek: { ...value.gameweek, automaticSubstitutions },
            });
          }}
        />
      </details>
      <details className="rule-section">
        <summary>{ar ? 'الخصائص الخاصة' : 'Chips & availability'}</summary>
        <p>
          {ar
            ? 'لكل فريق مخزونه الخاص. خاصية واحدة فقط لكل جولة. عدم إضافة نافذة يعني إتاحتها طوال البطولة.'
            : 'Each squad owns its inventory. One chip per gameweek. No availability window means the chip is available throughout the competition.'}
        </p>
        {CHIPS.map((chip) => (
          <fieldset className="formation-editor" key={chip}>
            <legend>{names[chip][locale]}</legend>
            <RuleToggle
              locale={locale}
              helpKey="chipEnabled"
              label={`${ar ? 'تفعيل' : 'Enable'} ${names[chip][locale]}`}
              checked={value.enabledChips.includes(chip)}
              onChange={(enabled) => {
                onChange({
                  ...value,
                  enabledChips: enabled
                    ? [...value.enabledChips, chip]
                    : value.enabledChips.filter((c) => c !== chip),
                });
              }}
            />
            <RuleNumber
              locale={locale}
              helpKey="inventory"
              label={`${names[chip][locale]} — ${ar ? 'مخزون الفريق الجديد' : 'new-squad allowance'}`}
              value={value.chipInventory[chip]}
              max={25}
              onChange={(count) => {
                onChange({
                  ...value,
                  chipInventory: { ...value.chipInventory, [chip]: count },
                });
              }}
            />
            {value.chipWindows.map(
              (window, index) =>
                window.chip === chip && (
                  <div className="form-pair" key={index}>
                    <RuleNumber
                      locale={locale}
                      helpKey="chipWindow"
                      label={`${names[chip][locale]} — ${ar ? 'من الجولة' : 'from gameweek'} ${String(index + 1)}`}
                      value={window.firstRound}
                      min={1}
                      max={200}
                      onChange={(firstRound) => {
                        onChange({
                          ...value,
                          chipWindows: value.chipWindows.map((w, i) =>
                            i === index ? { ...w, firstRound } : w,
                          ),
                        });
                      }}
                    />
                    <RuleNumber
                      locale={locale}
                      helpKey="chipWindow"
                      label={`${names[chip][locale]} — ${ar ? 'إلى الجولة' : 'through gameweek'} ${String(index + 1)}`}
                      value={window.lastRound}
                      min={1}
                      max={200}
                      onChange={(lastRound) => {
                        onChange({
                          ...value,
                          chipWindows: value.chipWindows.map((w, i) =>
                            i === index ? { ...w, lastRound } : w,
                          ),
                        });
                      }}
                    />
                    <button
                      className="button-outline"
                      type="button"
                      onClick={() => {
                        onChange({
                          ...value,
                          chipWindows: value.chipWindows.filter(
                            (_, i) => i !== index,
                          ),
                        });
                      }}
                    >
                      {ar ? 'حذف النافذة' : 'Remove window'}
                    </button>
                  </div>
                ),
            )}
            <button
              className="button-outline"
              type="button"
              disabled={value.chipWindows.length >= 100}
              onClick={() => {
                onChange({
                  ...value,
                  chipWindows: [
                    ...value.chipWindows,
                    { chip, firstRound: 1, lastRound: 38 },
                  ],
                });
              }}
            >
              {ar ? 'إضافة نافذة إتاحة' : 'Add availability window'}
            </button>
          </fieldset>
        ))}
      </details>
      <ScoringRuleControls
        locale={locale}
        value={value.scoring}
        onChange={(scoring) => {
          onChange({ ...value, scoring });
        }}
      />
      <details className="rule-section">
        <summary>
          {ar ? 'حدود الأسعار والتجميد' : 'Price bounds & freeze window'}
        </summary>
        <p>
          {ar
            ? 'القيم بوحدات ميزانية الفانتازي. معايرة التسعير التلقائي تتم في مسار الأسعار.'
            : 'Values use fantasy budget units. Automatic pricing requires its separate calibration workflow.'}
        </p>
        <div className="form-pair">
          <RuleNumber
            locale={locale}
            helpKey="priceMin"
            label={ar ? 'أقل سعر' : 'Minimum fantasy price'}
            value={value.pricing.minimum / 10}
            step={0.1}
            max={100000}
            onChange={(n) => {
              onChange({
                ...value,
                pricing: {
                  ...value.pricing,
                  minimum: fantasyTicks(Math.round(n * 10)),
                },
              });
            }}
          />
          <RuleNumber
            locale={locale}
            helpKey="priceMax"
            label={ar ? 'أعلى سعر' : 'Maximum fantasy price'}
            value={value.pricing.maximum / 10}
            step={0.1}
            max={100000}
            onChange={(n) => {
              onChange({
                ...value,
                pricing: {
                  ...value.pricing,
                  maximum: fantasyTicks(Math.round(n * 10)),
                },
              });
            }}
          />
          <RuleNumber
            locale={locale}
            helpKey="priceFreeze"
            label={
              ar
                ? 'تجميد الأسعار قبل الموعد بالساعات'
                : 'Price freeze before deadline (hours)'
            }
            value={value.pricing.freezeHours}
            max={168}
            onChange={(freezeHours) => {
              onChange({
                ...value,
                pricing: { ...value.pricing, freezeHours },
              });
            }}
          />
        </div>
      </details>
    </div>
  );
}
