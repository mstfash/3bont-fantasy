import type { HistoricalRuleSelection } from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
type Settings = HistoricalRuleSelection['settings'];
const labels: Record<string, { en: string; ar: string }> = {
  scoring: { en: 'Footballer scoring', ar: 'نقاط اللاعبين' },
  gameweek: { en: 'Lineup scoring', ar: 'نقاط التشكيلة' },
  appearance: { en: 'Appearance', ar: 'المشاركة' },
  thresholdMinutes: { en: 'Minutes threshold', ar: 'حد الدقائق' },
  short: { en: 'Short appearance', ar: 'مشاركة قصيرة' },
  full: { en: 'Full appearance', ar: 'مشاركة كاملة' },
  goal: { en: 'Goal', ar: 'هدف' },
  assist: { en: 'Assist', ar: 'تمريرة حاسمة' },
  cleanSheet: { en: 'Clean sheet', ar: 'شباك نظيفة' },
  award: { en: 'Points', ar: 'نقاط' },
  conceded: { en: 'Goals conceded', ar: 'أهداف مستقبلة' },
  perGoals: { en: 'Goal group size', ar: 'عدد الأهداف بالمجموعة' },
  yellow: { en: 'Yellow card', ar: 'إنذار' },
  straightRed: { en: 'Straight red', ar: 'طرد مباشر' },
  secondYellowDismissal: {
    en: 'Second yellow dismissal',
    ar: 'طرد بإنذار ثانٍ',
  },
  saves: { en: 'Saves', ar: 'التصديات' },
  perSaves: { en: 'Save group size', ar: 'عدد التصديات بالمجموعة' },
  penaltySave: { en: 'Penalty saved', ar: 'صد ركلة جزاء' },
  penaltyMiss: { en: 'Penalty missed', ar: 'ركلة جزاء مهدرة' },
  ownGoal: { en: 'Own goal', ar: 'هدف عكسي' },
  automaticSubstitutions: {
    en: 'Automatic substitutions',
    ar: 'التبديلات التلقائية',
  },
  captainMultiplier: { en: 'Captain multiplier', ar: 'مضاعف الكابتن' },
  tripleCaptainMultiplier: {
    en: 'Triple Captain multiplier',
    ar: 'مضاعف التريبل كابتن',
  },
  GK: { en: 'Goalkeeper', ar: 'حارس مرمى' },
  DEF: { en: 'Defender', ar: 'مدافع' },
  MID: { en: 'Midfielder', ar: 'وسط' },
  FWD: { en: 'Forward', ar: 'مهاجم' },
};
function leaves(value: object, prefix = ''): Map<string, number | boolean> {
  const result = new Map<string, number | boolean>();
  for (const [key, raw] of Object.entries(value)) {
    const item: unknown = raw;
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof item === 'number' || typeof item === 'boolean')
      result.set(path, item);
    else if (item !== null && typeof item === 'object')
      for (const [k, v] of leaves(item, path)) result.set(k, v);
  }
  return result;
}
export function HistoricalRuleDiff({
  locale,
  before,
  after,
}: {
  readonly locale: Locale;
  readonly before: Settings;
  readonly after: Settings;
}) {
  const ar = locale === 'ar',
    previous = leaves(before),
    next = leaves(after);
  function display(path: string, value: number | boolean | undefined) {
    if (value === undefined) return '—';
    if (typeof value === 'boolean')
      return value ? (ar ? 'مفعّل' : 'Enabled') : ar ? 'معطّل' : 'Disabled';
    const points =
      path.startsWith('scoring.') &&
      !['thresholdMinutes', 'perGoals', 'perSaves'].some((key) =>
        path.endsWith(key),
      );
    return (points ? value / 1000 : value).toLocaleString(locale);
  }
  return (
    <section className="admin-panel">
      <h2>{ar ? 'القواعد قبل التصحيح وبعده' : 'Rules before and after'}</h2>
      <div className="admin-table-scroll">
        <table>
          <thead>
            <tr>
              <th>{ar ? 'القاعدة' : 'Rule'}</th>
              <th>{ar ? 'المسجل' : 'Recorded'}</th>
              <th>{ar ? 'المقترح' : 'Proposed'}</th>
            </tr>
          </thead>
          <tbody>
            {[...next]
              .filter(([key, v]) => previous.get(key) !== v)
              .map(([key, v]) => (
                <tr key={key}>
                  <td>
                    {key
                      .split('.')
                      .map((part) => labels[part]?.[locale] ?? '—')
                      .join(' / ')}
                  </td>
                  <td>{display(key, previous.get(key))}</td>
                  <td>{display(key, v)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
