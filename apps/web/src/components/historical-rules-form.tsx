'use client';
import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  historicalRuleSelectionSchema,
  historicalRuleSettingsSchema,
  type Gameweek,
  type HistoricalRuleSelection,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { ScoringRuleControls } from './rules/scoring-rules';
import { RuleNumber, RuleToggle } from './rules/fields';
export function HistoricalRulesForm({
  locale,
  round,
  initial,
}: {
  readonly locale: Locale;
  readonly round: Gameweek;
  readonly initial?: HistoricalRuleSelection;
}) {
  const ar = locale === 'ar',
    router = useRouter();
  const [scoring, setScoring] = useState(
    initial
      ? { ...initial.settings.scoring, version: round.rules.scoring.version }
      : round.rules.scoring,
  );
  const [gameweek, setGameweek] = useState(
    initial?.settings.gameweek ?? round.rules.gameweek,
  );
  const [notice, setNotice] = useState('');
  function submit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    const selection = historicalRuleSelectionSchema.safeParse({
      gameweekId: round.id,
      expectedResultRevision: round.resultRevision,
      settings: {
        scoring: historicalRuleSettingsSchema.shape.scoring
          .strip()
          .parse(scoring),
        gameweek,
      },
    });
    if (!selection.success) {
      setNotice(ar ? 'راجع قيم القواعد.' : 'Check the rule values.');
      return;
    }
    router.push(
      `/${locale}/admin/results/${round.id}/rules?proposal=${encodeURIComponent(JSON.stringify(selection.data))}#rule-preview`,
    );
  }
  return (
    <section className="admin-panel">
      <h2>
        {ar
          ? 'القواعد المقترحة لهذه الجولة'
          : 'Proposed rules for this gameweek'}
      </h2>
      <p>
        {ar
          ? 'تتغير قواعد احتساب النقاط لهذه الجولة فقط. تبقى التشكيلة المسجلة واختيارات الكابتن والشيبس وخصومات الانتقالات وقواعد الجولات المقبلة كما هي.'
          : 'Only this gameweek’s scoring rules change. Recorded squads, captain choices, consumed chips, transfer deductions and future rules stay as recorded.'}
      </p>
      <form className="admin-form" onSubmit={submit}>
        <ScoringRuleControls
          locale={locale}
          value={scoring}
          onChange={setScoring}
        />
        <div className="form-pair">
          <RuleNumber
            locale={locale}
            helpKey="captainMultiplier"
            label={ar ? 'مضاعف الكابتن' : 'Captain multiplier'}
            value={gameweek.captainMultiplier}
            min={1}
            max={10}
            onChange={(captainMultiplier) => {
              setGameweek({ ...gameweek, captainMultiplier });
            }}
          />
          <RuleNumber
            locale={locale}
            helpKey="tripleMultiplier"
            label={ar ? 'مضاعف التريبل كابتن' : 'Triple Captain multiplier'}
            value={gameweek.tripleCaptainMultiplier}
            min={1}
            max={10}
            onChange={(tripleCaptainMultiplier) => {
              setGameweek({ ...gameweek, tripleCaptainMultiplier });
            }}
          />
        </div>
        <RuleToggle
          locale={locale}
          helpKey="autoSubs"
          label={ar ? 'التبديلات التلقائية' : 'Automatic substitutions'}
          checked={gameweek.automaticSubstitutions}
          onChange={(automaticSubstitutions) => {
            setGameweek({ ...gameweek, automaticSubstitutions });
          }}
        />
        {notice && <p role="alert">{notice}</p>}
        <button className="action-button" type="submit">
          {ar ? 'معاينة تصحيح القواعد' : 'PREVIEW RULE CORRECTION'}
        </button>
      </form>
    </section>
  );
}
