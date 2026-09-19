'use client';
import { useRef, useState, type SubmitEvent } from 'react';
import { z } from 'zod';
import {
  providerNormalizationPreviewSchema,
  providerNormalizationSelectionSchema,
  type Fixture,
  type FixtureObservation,
  type Footballer,
  type ProviderNormalizationPreview,
  type ProviderRequest,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { deadlineLabel } from '@/lib/locale';
import { commandError } from '@/lib/command-errors';
import { MatchEditor } from './match-editor';
const fields = [
  ['fixtureAttemptId', 'fixtures', 'Fixture response', 'بيانات المباراة'],
  [
    'playersAttemptId',
    'fixtures/players',
    'Player statistics',
    'إحصائيات اللاعبين',
  ],
  ['lineupsAttemptId', 'fixtures/lineups', 'Lineups', 'قوائم المباراة'],
  ['eventsAttemptId', 'fixtures/events', 'Events', 'أحداث المباراة'],
] as const;
const issueLabels: Readonly<Record<string, { en: string; ar: string }>> = {
  'timeline-lineup-incomplete': {
    en: 'The timeline needs two complete starting elevens with unique player identities.',
    ar: 'يحتاج تسلسل الأحداث إلى تشكيلين أساسيين كاملين دون تكرار هوية أي لاعب.',
  },
  'timeline-time-missing': {
    en: 'An event has missing or unsupported timing. Verify stoppage time and exclude shootouts.',
    ar: 'توقيت أحد الأحداث مفقود أو غير مدعوم. راجع الوقت بدل الضائع واستبعد ركلات الترجيح.',
  },
  'timeline-event-ambiguous': {
    en: 'Duplicate events, video reviews or events in the same minute leave the sequence uncertain.',
    ar: 'تكرار الأحداث أو مراجعة الفيديو أو وقوع أحداث في الدقيقة نفسها يجعل ترتيبها غير مؤكد.',
  },
  'timeline-score-conflict': {
    en: 'The goal events do not establish the reported final score.',
    ar: 'أحداث الأهداف لا تثبت النتيجة النهائية المسجلة.',
  },
  'timeline-participation-conflict': {
    en: 'Lineups, substitutions, dismissals and reported playing minutes do not agree.',
    ar: 'يوجد اختلاف بين التشكيلات والتبديلات والطرد ودقائق المشاركة المسجلة.',
  },
  'timeline-cards-conflict': {
    en: 'Card events and totals disagree; affected defensive and disciplinary facts stay unknown.',
    ar: 'تختلف أحداث البطاقات عن إجمالياتها؛ تظل البيانات الدفاعية والانضباطية المتأثرة غير معروفة.',
  },
  'eligibility-needs-evidence': {
    en: 'Establish the complete historical eligibility roster, including non-appearances.',
    ar: 'راجع قائمة المؤهلين وقت المباراة، بما فيها من لم يشارك.',
  },
  'defensive-timeline-needs-review': {
    en: 'Review on-pitch conceded goals, dismissals and goalkeeper saves.',
    ar: 'راجع الأهداف المستقبلة أثناء اللعب وبعد الطرد وتصديات الحارس.',
  },
  'penalties-and-own-goals-need-review': {
    en: 'Review penalties and own goals; shootout events do not count.',
    ar: 'راجع ركلات الجزاء والأهداف العكسية، مع استبعاد ركلات الترجيح.',
  },
  'discipline-needs-review': {
    en: 'Review cards, distinguishing second-yellow dismissal from a straight red.',
    ar: 'راجع البطاقات وميّز الطرد بالإنذار الثاني عن الأحمر المباشر.',
  },
  'aggregate-values-missing': {
    en: 'Some minutes, goals or assists are unavailable.',
    ar: 'توجد دقائق أو أهداف أو تمريرات حاسمة غير معروفة.',
  },
  'event-player-outside-lineup': {
    en: 'An event references someone outside the lineup. Reconcile the sources.',
    ar: 'يوجد لاعب في الأحداث خارج القائمة؛ راجع اختلاف المصادر.',
  },
  'unsupported-event-type': {
    en: 'An unfamiliar event type needs review.',
    ar: 'يوجد نوع حدث غير معروف يحتاج للمراجعة.',
  },
};
export function ProviderMatchWorkspace({
  locale,
  fixture,
  observation,
  footballers,
  factRevisions,
  sources,
  savedReview,
}: {
  readonly savedReview: {
    sources: ProviderNormalizationPreview['sources'];
    eligibilityReference: string;
  } | null;
  readonly locale: Locale;
  readonly fixture: Fixture;
  readonly observation: FixtureObservation | null;
  readonly footballers: readonly Footballer[];
  readonly factRevisions: Readonly<Record<string, number>>;
  readonly sources:
    | readonly {
        id: string;
        resource: ProviderRequest['resource'];
        finishedAt: string | null;
      }[]
    | null;
}) {
  const ar = locale === 'ar';
  const [preview, setPreview] = useState<ProviderNormalizationPreview | null>(
    null,
  );
  const [staged, setStaged] = useState<ProviderNormalizationPreview | null>(
    null,
  );
  const [stageVersion, setStageVersion] = useState(0);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  async function review(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setPreview(null);
    setNotice('');
    setBusy(true);
    const form = new FormData(event.currentTarget),
      current = ++generation.current;
    try {
      const selection = providerNormalizationSelectionSchema.parse({
        fixtureId: fixture.id,
        ...Object.fromEntries(fields.map(([name]) => [name, form.get(name)])),
      });
      const response = await fetch('/api/v1/admin/providers/normalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selection),
      });
      const payload: unknown = await response.json();
      const result = z
        .object({
          preview: providerNormalizationPreviewSchema.optional(),
          code: z.string().optional(),
        })
        .parse(payload);
      if (current !== generation.current) return;
      if (!response.ok || !result.preview) {
        setNotice(commandError(result.code ?? 'request-unconfirmed', locale));
        return;
      }
      setPreview(result.preview);
    } catch {
      if (current === generation.current)
        setNotice(
          ar
            ? 'تعذرت المعاينة. راجع الردود المختارة.'
            : 'Preview unavailable. Check the selected responses.',
        );
    } finally {
      setBusy(false);
    }
  }
  const selected = staged?.observation ?? observation;
  const visible = staged
    ? footballers
    : footballers.filter(
        (f) =>
          [fixture.homeClubId, fixture.awayClubId].includes(f.clubId) ||
          selected?.eligibleFootballerIds.includes(f.id),
      );
  return (
    <>
      {savedReview && (
        <section
          className="admin-panel"
          aria-label={ar ? 'مصادر التقرير المحفوظ' : 'Saved report sources'}
        >
          <h2>{ar ? 'مصادر التقرير المحفوظ' : 'Saved report sources'}</h2>
          <p>{savedReview.eligibilityReference}</p>
          <ProviderSourceLinks sources={savedReview.sources} locale={locale} />
        </section>
      )}
      <section className="admin-panel">
        <h2>
          {ar ? 'مسودة من بيانات المزود' : 'Draft from provider evidence'}
        </h2>
        <p>
          {ar
            ? 'اختر أربعة ردود محفوظة للمباراة نفسها. تُملأ الدقائق والأهداف والتمريرات المتاحة، وتبقى البيانات الأخرى للمراجعة. لن تُحفظ نقاط أو نتائج من المعاينة.'
            : 'Choose four saved responses for the same match. Available minutes, goals and assists are prefilled; other facts remain for review. Previewing saves no scores or results.'}
        </p>
        {!sources ? (
          <p>
            {ar
              ? 'اربط الموسم ومعرّف المباراة أولاً من صفحة ربط بيانات المزود.'
              : 'Bind the season and fixture identity on the provider identity page first.'}
          </p>
        ) : (
          <form
            className="admin-form"
            onSubmit={(event) => {
              void review(event);
            }}
            onChange={() => {
              generation.current++;
              setPreview(null);
            }}
          >
            <div className="form-pair">
              {fields.map(([name, resource, en, arabic]) => (
                <label key={name}>
                  {ar ? arabic : en}
                  <select
                    name={name}
                    aria-label={ar ? arabic : en}
                    required
                    defaultValue=""
                  >
                    <option value="">
                      {ar ? 'اختر ردًا محفوظًا' : 'Choose saved response'}
                    </option>
                    {sources
                      .filter((s) => s.resource === resource)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.finishedAt
                            ? deadlineLabel(s.finishedAt, locale)
                            : '—'}{' '}
                          · {s.id.slice(0, 8)}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
            </div>
            <button className="action-button" type="submit" disabled={busy}>
              {ar ? 'معاينة بيانات المزود' : 'PREVIEW PROVIDER DATA'}
            </button>
          </form>
        )}
        {notice && <p role="alert">{notice}</p>}
        {preview && (
          <div className="admin-confirmation">
            <h3>{ar ? 'يلزم استكمال المراجعة' : 'Review required'}</h3>
            <ul>
              {preview.issues.map((issue) => (
                <li key={issue}>
                  {issueLabels[issue]?.[locale] ??
                    (ar ? 'راجع المصدر.' : 'Review the source.')}
                </li>
              ))}
            </ul>
            <p>
              {ar
                ? 'سيحل هذا المحتوى محل تعديلات النموذج غير المحفوظة. التصحيحات الثابتة تبقى سارية.'
                : 'Staging replaces unsaved match-form edits. Persistent overrides remain in effect.'}
            </p>
            {preview.replacesCompleteReport && (
              <p>
                {ar
                  ? 'يوجد تقرير مكتمل. ستحتاج إلى مراجعة الأهلية والاكتمال مرة أخرى قبل الحفظ.'
                  : 'A complete report already exists. Recheck eligibility and completeness before saving a replacement.'}
              </p>
            )}
            <div className="admin-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{ar ? 'اللاعب' : 'Player'}</th>
                    <th>{ar ? 'الدقائق' : 'Minutes'}</th>
                    <th>{ar ? 'الأهداف' : 'Goals'}</th>
                    <th>{ar ? 'التمريرات' : 'Assists'}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.observation.performances.map((p) => (
                    <tr key={p.footballerId}>
                      <td>
                        {footballers.find((f) => f.id === p.footballerId)?.name[
                          locale
                        ] ?? '—'}
                      </td>
                      <td>{p.statistics.minutes ?? '—'}</td>
                      <td>{p.statistics.goals ?? '—'}</td>
                      <td>{p.statistics.assists ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ProviderSourceLinks sources={preview.sources} locale={locale} />
            <button
              type="button"
              className="action-button"
              onClick={() => {
                setStaged(preview);
                setStageVersion((value) => value + 1);
                setPreview(null);
              }}
            >
              {ar ? 'نقل المسودة إلى التقرير' : 'STAGE IN MATCH REPORT'}
            </button>
          </div>
        )}
      </section>
      {staged && (
        <section className="admin-panel">
          <p role="status">
            {ar
              ? 'تم نقل المسودة. جميع لاعبي الموسم متاحون لتوثيق الأهلية التاريخية، بما في ذلك المنتقلون بين الأندية.'
              : 'Draft staged. All season footballers are available to establish historical eligibility, including transferred players.'}
          </p>
          <ProviderSourceLinks sources={staged.sources} locale={locale} />
          <button
            type="button"
            className="button-outline"
            onClick={() => {
              setStaged(null);
              setStageVersion((value) => value + 1);
            }}
          >
            {ar
              ? 'إلغاء المسودة والعودة للتقرير المحفوظ'
              : 'Discard draft and restore saved report'}
          </button>
        </section>
      )}
      <MatchEditor
        key={stageVersion}
        locale={locale}
        fixture={staged?.observation.fixture ?? fixture}
        observation={selected}
        footballers={visible}
        factRevisions={factRevisions}
        {...(staged ? { providerDraft: staged } : {})}
      />
    </>
  );
}

function ProviderSourceLinks({
  sources,
  locale,
}: {
  readonly sources: ProviderNormalizationPreview['sources'];
  readonly locale: Locale;
}) {
  const ar = locale === 'ar';
  return (
    <div className="admin-actions">
      {sources.map((source, i) => (
        <a
          key={source.attemptId}
          target="_blank"
          rel="noopener noreferrer"
          title={
            ar
              ? 'فتح دليل المصدر في علامة تبويب جديدة'
              : 'Open source evidence in a new tab'
          }
          href={`/${locale}/admin/providers/evidence/${source.attemptId}`}
        >
          {ar ? 'المصدر' : 'Source'} {i + 1} ↗
        </a>
      ))}
    </div>
  );
}
