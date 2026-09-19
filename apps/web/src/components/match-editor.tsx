'use client';
import { TopicHelp } from './help/page-help';
import { MatchReviewSummary } from './match-review-summary';
import { useRef, useState, type SubmitEvent } from 'react';
import { z } from 'zod';
import {
  matchDataCommandSchema,
  matchReviewPreviewSchema,
  type MatchReviewPreview,
  type Fixture,
  type Footballer,
  type FixtureObservation,
  type MatchDataCommand,
  type ProviderNormalizationPreview,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { commandError } from '@/lib/command-errors';

const statisticFields = [
  ['minutes', 'Minutes', 'الدقائق'],
  ['goals', 'Goals', 'الأهداف'],
  ['assists', 'Assists', 'التمريرات الحاسمة'],
  ['ownGoals', 'Own goals', 'الأهداف العكسية'],
  ['penaltyMisses', 'Penalties missed', 'ركلات جزاء مهدرة'],
  ['concededWhileOnPitch', 'Conceded on pitch', 'أهداف مستقبلة أثناء اللعب'],
  ['concededAfterDismissal', 'Conceded after red', 'أهداف بعد الطرد'],
  ['savesIncludingPenalties', 'Total saves', 'كل التصديات'],
  ['penaltySaves', 'Penalty saves', 'صد ركلات الجزاء'],
] as const;
type Performance = FixtureObservation['performances'][number];
const blank = {
  minutes: null,
  goals: null,
  assists: null,
  ownGoals: null,
  penaltyMisses: null,
  concededWhileOnPitch: null,
  concededAfterDismissal: null,
  savesIncludingPenalties: null,
  penaltySaves: null,
};
const zeros = {
  minutes: 0,
  goals: 0,
  assists: 0,
  ownGoals: 0,
  penaltyMisses: 0,
  concededWhileOnPitch: 0,
  concededAfterDismissal: 0,
  savesIncludingPenalties: 0,
  penaltySaves: 0,
};

export function MatchEditor({
  locale,
  fixture,
  observation,
  footballers,
  factRevisions,
  providerDraft,
}: {
  readonly providerDraft?: ProviderNormalizationPreview;
  readonly locale: Locale;
  readonly fixture: Fixture;
  readonly observation: FixtureObservation | null;
  readonly footballers: readonly Footballer[];
  readonly factRevisions: Readonly<Record<string, number>>;
}) {
  const ar = locale === 'ar';
  const [selected, setSelected] = useState<string[]>(
    observation?.eligibleFootballerIds ?? [],
  );
  const [performances, setPerformances] = useState<Performance[]>(
    footballers.map(
      (p) =>
        observation?.performances.find((f) => f.footballerId === p.id) ?? {
          footballerId: p.id,
          statistics: blank,
          discipline: null,
        },
    ),
  );
  const [editing, setEditing] = useState(footballers[0]?.id ?? '');
  const [pending, setPending] = useState<MatchDataCommand | null>(null);
  const [impact, setImpact] = useState<MatchReviewPreview | null>(null);
  const editVersion = useRef(0);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const current = performances.find((p) => p.footballerId === editing);
  function update(value: Performance): void {
    editVersion.current++;
    setImpact(null);
    setPerformances(
      performances.map((p) =>
        p.footballerId === value.footballerId ? value : p,
      ),
    );
    setPending(null);
  }
  async function review(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = form.get('action');
    const input =
      kind === 'report'
        ? {
            kind: 'import',
            commandId: crypto.randomUUID(),
            expectedRevision: fixture.revision,
            reason: form.get('reason'),
            source: providerDraft ? 'api-football-reviewed' : 'operator-report',
            ...(providerDraft
              ? {
                  providerReview: {
                    selection: providerDraft.selection,
                    expectedFingerprint: providerDraft.fingerprint,
                    eligibilityReference: form.get('eligibilityReference'),
                  },
                }
              : {}),
            observation: {
              fixture: {
                ...fixture,
                status: form.get('status'),
                homeGoals:
                  form.get('homeGoals') === ''
                    ? null
                    : Number(form.get('homeGoals')),
                awayGoals:
                  form.get('awayGoals') === ''
                    ? null
                    : Number(form.get('awayGoals')),
                factsComplete: form.get('factsComplete') === 'on',
              },
              eligibilityComplete: form.get('eligibilityComplete') === 'on',
              eligibleFootballerIds: selected,
              performances: performances.filter((p) =>
                selected.includes(p.footballerId),
              ),
            },
          }
        : {
            kind: 'override',
            commandId: crypto.randomUUID(),
            fixtureId: fixture.id,
            footballerId: editing,
            expectedRevision: factRevisions[editing] ?? 0,
            reason: form.get('reason'),
            change:
              kind === 'release'
                ? { kind: 'release-override' }
                : {
                    kind: 'performance',
                    statistics: current?.statistics,
                    discipline: current?.discipline,
                  },
          };
    const parsed = matchDataCommandSchema.safeParse(input);
    if (!parsed.success) {
      setNotice(
        ar
          ? 'راجع بيانات التقرير وسبب التغيير.'
          : 'Check the report fields and reason.',
      );
      return;
    }
    setNotice('');
    setPending(null);
    setImpact(null);
    setBusy(true);
    const version = editVersion.current;
    try {
      const response = await fetch('/api/v1/admin/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'preview', command: parsed.data }),
      });
      const payload: unknown = await response.json();
      if (version !== editVersion.current) return;
      if (!response.ok) {
        setNotice(
          commandError(
            z.object({ code: z.string() }).parse(payload).code,
            locale,
          ),
        );
        return;
      }
      const result = z
        .object({
          kind: z.literal('preview'),
          preview: matchReviewPreviewSchema,
        })
        .parse(payload);
      setPending(parsed.data);
      setImpact(result.preview);
    } catch {
      if (version !== editVersion.current) return;
      setNotice(
        ar
          ? 'تعذرت المعاينة. حاول مرة أخرى.'
          : 'Preview could not be completed. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(): Promise<void> {
    if (!pending || !impact) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/v1/admin/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'apply',
          command: pending,
          expectedFingerprint: impact.fingerprint,
        }),
      });
      if (response.ok) {
        window.location.reload();
        return;
      }
      const payload: unknown = await response.json();
      const error = z.object({ code: z.string() }).parse(payload);
      setNotice(commandError(error.code, locale));
      if (error.code === 'match-preview-changed') {
        setPending(null);
        setImpact(null);
      }
    } catch {
      setNotice(
        ar
          ? 'لم يتأكد الحفظ. أعد نفس الطلب.'
          : 'Save not confirmed. Retry the same request.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-panel">
      <TopicHelp locale={locale} topic="matches" />
      <h2>{ar ? 'تقرير المباراة' : 'Match report'}</h2>
      <p>
        {ar
          ? 'الحقول الفارغة تعني بيانات غير معروفة. سجّل عدم المشاركة صراحة، وراجع التقرير قبل اعتماده. التصحيحات الثابتة لها أولوية على التقارير التالية.'
          : 'Blank fields mean unknown data. Record non-appearances explicitly and review the report before approval. Persistent corrections take precedence over later reports.'}
      </p>
      <form
        className="admin-form"
        onSubmit={(event) => {
          void review(event);
        }}
        onChange={() => {
          editVersion.current++;
          setPending(null);
          setImpact(null);
        }}
      >
        <div className="form-pair">
          <label>
            {ar ? 'حالة المباراة' : 'Match status'}
            <select
              aria-label={ar ? 'حالة المباراة' : 'Match status'}
              name="status"
              defaultValue={fixture.status}
            >
              {['scheduled', 'live', 'suspended', 'postponed', 'finished'].map(
                (status, i) => (
                  <option key={status} value={status}>
                    {ar
                      ? ['مجدولة', 'مباشرة', 'متوقفة', 'مؤجلة', 'انتهت'][i]
                      : status}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            {ar ? 'أهداف المضيف' : 'Home goals'}
            <input
              type="number"
              min={0}
              max={100}
              name="homeGoals"
              defaultValue={fixture.homeGoals ?? ''}
            />
          </label>
          <label>
            {ar ? 'أهداف الضيف' : 'Away goals'}
            <input
              type="number"
              min={0}
              max={100}
              name="awayGoals"
              defaultValue={fixture.awayGoals ?? ''}
            />
          </label>
        </div>
        {providerDraft && (
          <label>
            {ar
              ? 'دليل الأهلية والتعديلات اليدوية'
              : 'Eligibility evidence and manual changes'}
            <textarea
              name="eligibilityReference"
              aria-label={
                ar
                  ? 'دليل الأهلية والتعديلات اليدوية'
                  : 'Eligibility evidence and manual changes'
              }
              aria-describedby="eligibility-evidence-help"
              required
              minLength={5}
              maxLength={2000}
            />
            <small id="eligibility-evidence-help">
              {ar
                ? 'اذكر مصدر قائمة المؤهلين للمباراة وما راجعته أو أكملته من بيانات المزود. غياب اللاعب لا يثبت أنه لم يلعب.'
                : 'Identify the historical eligibility source and facts you reviewed or completed. An absent player record does not prove zero minutes.'}
            </small>
          </label>
        )}
        <label className="confirmation-check">
          <input
            type="checkbox"
            name="eligibilityComplete"
            defaultChecked={observation?.eligibilityComplete ?? false}
          />
          {ar
            ? 'قائمة المؤهلين كاملة وتشمل من لم يلعب.'
            : 'The eligibility roster is complete, including non-appearances.'}
        </label>
        <label className="confirmation-check">
          <input
            type="checkbox"
            name="factsComplete"
            defaultChecked={fixture.factsComplete}
          />
          {ar
            ? 'اكتملت بيانات المباراة المطلوبة للنقاط.'
            : 'All match data required for scoring is complete.'}
        </label>
        <fieldset className="fixture-choices">
          <legend>
            {ar ? 'المؤهلون لهذه المباراة' : 'Eligible for this fixture'}
          </legend>
          {footballers.map((p) => (
            <label key={p.id}>
              <input
                type="checkbox"
                checked={selected.includes(p.id)}
                onChange={(event) => {
                  setSelected(
                    event.target.checked
                      ? [...selected, p.id]
                      : selected.filter((id) => id !== p.id),
                  );
                }}
              />
              {p.name[locale]}
            </label>
          ))}
        </fieldset>
        <label>
          {ar ? 'تحرير أداء لاعب' : 'Edit footballer performance'}
          <select
            aria-label={ar ? 'تحرير أداء لاعب' : 'Edit footballer performance'}
            value={editing}
            onChange={(event) => {
              setEditing(event.target.value);
            }}
          >
            {footballers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name[locale]}
              </option>
            ))}
          </select>
        </label>
        {current && (
          <>
            <div className="form-pair">
              {statisticFields.map(([key, en, arabic]) => (
                <label key={key}>
                  {ar ? arabic : en}
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={current.statistics[key] ?? ''}
                    onChange={(event) => {
                      update({
                        ...current,
                        statistics: {
                          ...current.statistics,
                          [key]:
                            event.target.value === ''
                              ? null
                              : Number(event.target.value),
                        },
                      });
                    }}
                  />
                </label>
              ))}
              <label>
                {ar ? 'البطاقات' : 'Cards'}
                <select
                  value={
                    current.discipline?.kind === 'straight-red' &&
                    current.discipline.priorYellow
                      ? 'yellow-straight-red'
                      : (current.discipline?.kind ?? 'unknown')
                  }
                  onChange={(event) => {
                    const kind = event.target.value;
                    update({
                      ...current,
                      discipline:
                        kind === 'unknown'
                          ? null
                          : kind === 'yellow-straight-red'
                            ? { kind: 'straight-red', priorYellow: true }
                            : kind === 'straight-red'
                              ? { kind, priorYellow: false }
                              : kind === 'yellow' ||
                                  kind === 'second-yellow' ||
                                  kind === 'none'
                                ? { kind }
                                : null,
                    });
                  }}
                >
                  {[
                    'unknown',
                    'none',
                    'yellow',
                    'second-yellow',
                    'straight-red',
                    'yellow-straight-red',
                  ].map((kind, i) => (
                    <option key={kind} value={kind}>
                      {ar
                        ? [
                            'غير معروف',
                            'بدون بطاقات',
                            'إنذار',
                            'طرد بإنذار ثانٍ',
                            'طرد مباشر',
                            'إنذار ثم طرد مباشر',
                          ][i]
                        : [
                            'Unknown',
                            'No cards',
                            'Yellow',
                            'Second yellow dismissal',
                            'Straight red',
                            'Yellow then straight red',
                          ][i]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className="button-outline"
              onClick={() => {
                update({
                  ...current,
                  statistics: zeros,
                  discipline: { kind: 'none' },
                });
              }}
            >
              {ar
                ? 'تسجيل عدم مشاركة مؤكد لهذا اللاعب'
                : 'Record confirmed non-appearance for this footballer'}
            </button>
          </>
        )}
        <label>
          {ar ? 'العملية' : 'Action'}
          <select name="action">
            <option value="report">
              {ar ? 'حفظ تقرير المباراة' : 'Save the match report'}
            </option>
            <option value="override">
              {ar
                ? 'تصحيح ثابت لأداء اللاعب المختار'
                : 'Apply a persistent correction to the selected footballer'}
            </option>
            <option value="release">
              {ar
                ? 'إزالة التصحيح والعودة لآخر تقرير'
                : 'Release the selected footballer’s correction'}
            </option>
          </select>
        </label>
        <label>
          {ar ? 'السبب ومصدر الدليل' : 'Reason and evidence source'}
          <textarea name="reason" required minLength={5} maxLength={1000} />
        </label>
        <button className="action-button" disabled={busy} type="submit">
          {ar ? 'مراجعة التقرير' : 'REVIEW REPORT'}
        </button>
      </form>
      {notice && <p role="alert">{notice}</p>}
      {impact && <MatchReviewSummary preview={impact} locale={locale} />}
      {pending && (
        <div className="admin-confirmation">
          <h3>{ar ? 'تأكيد بيانات المباراة' : 'Confirm match data'}</h3>
          <p>
            {pending.kind === 'import'
              ? ar
                ? `حفظ سجل ${String(pending.observation.performances.length)} لاعب. اكتمال البيانات: ${pending.observation.fixture.factsComplete ? 'نعم' : 'لا'}.`
                : `Save ${String(pending.observation.performances.length)} performance records. Data complete: ${pending.observation.fixture.factsComplete ? 'yes' : 'no'}.`
              : ar
                ? 'سيتم تعديل التصحيح الثابت للاعب المختار مع تسجيل السبب.'
                : 'Update the selected footballer’s persistent correction and record the reason.'}
          </p>
          <p>
            {ar
              ? 'النتائج النهائية لن تتغير دون مراجعة وإعادة فتح الجولة.'
              : 'Final results will require review and reopening before they change.'}
          </p>
          <button
            className="action-button"
            type="button"
            disabled={busy}
            onClick={() => {
              void save();
            }}
          >
            {ar ? 'تأكيد وحفظ' : 'CONFIRM & SAVE'}
          </button>
        </div>
      )}
    </section>
  );
}
