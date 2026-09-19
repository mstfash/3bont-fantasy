'use client';
import { useState, type SubmitEvent } from 'react';
import { z } from 'zod';
import {
  matchDataCommandSchema,
  matchReviewPreviewSchema,
  type Fixture,
  type FixtureDisposition,
  type MatchDataCommand,
  type MatchReviewPreview,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { commandError } from '@/lib/command-errors';
import { MatchReviewSummary } from './match-review-summary';
import { InfoTip } from './help/info-tip';
export function FixtureDispositionEditor({
  locale,
  fixture,
  previous,
  replacements,
}: {
  readonly locale: Locale;
  readonly fixture: Fixture;
  readonly previous: FixtureDisposition | null;
  readonly replacements: readonly Fixture[];
}) {
  const ar = locale === 'ar',
    active = previous && previous.choice.outcome !== 'release';
  const [outcome, setOutcome] = useState(active ? 'release' : 'void');
  const [pending, setPending] = useState<MatchDataCommand | null>(null);
  const [preview, setPreview] = useState<MatchReviewPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  async function request(body: object) {
    const response = await fetch('/api/v1/admin/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const raw: unknown = await response.json();
    if (!response.ok) {
      const parsed = z.object({ code: z.string() }).parse(raw);
      throw new Error(commandError(parsed.code, locale));
    }
    return raw;
  }
  async function review(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const command = matchDataCommandSchema.safeParse({
      kind: 'disposition',
      commandId: crypto.randomUUID(),
      fixtureId: fixture.id,
      expectedRevision: fixture.revision,
      choice: {
        outcome,
        ...(outcome === 'awarded'
          ? {
              homeGoals: Number(form.get('homeGoals')),
              awayGoals: Number(form.get('awayGoals')),
            }
          : {}),
        replacementFixtureId:
          outcome === 'replay' ? form.get('replacement') : null,
      },
      officialReference: form.get('reference'),
      reason: form.get('reason'),
    });
    if (!command.success) {
      setNotice(commandError('invalid-request', locale));
      return;
    }
    setBusy(true);
    setNotice('');
    setPreview(null);
    setPending(null);
    try {
      const raw = await request({ kind: 'preview', command: command.data });
      const result = z
        .object({
          kind: z.literal('preview'),
          preview: matchReviewPreviewSchema,
        })
        .parse(raw);
      setPending(command.data);
      setPreview(result.preview);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : commandError('request-unconfirmed', locale),
      );
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!pending || !preview) return;
    setBusy(true);
    setNotice('');
    try {
      await request({
        kind: 'apply',
        command: pending,
        expectedFingerprint: preview.fingerprint,
      });
      window.location.reload();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : commandError('request-unconfirmed', locale),
      );
    } finally {
      setBusy(false);
    }
  }
  const labels = {
    void: { en: 'Officially void; no replay', ar: 'إلغاء رسمي دون إعادة' },
    replay: {
      en: 'Void and replace with a new fixture',
      ar: 'إلغاء وإعادة بمباراة جديدة',
    },
    awarded: {
      en: 'Awarded result; zero footballer performance',
      ar: 'نتيجة إدارية دون أداء للاعبين',
    },
    release: {
      en: 'Release disposition; await a reviewed report',
      ar: 'إلغاء القرار وانتظار تقرير مُراجع',
    },
  };
  return (
    <section className="admin-panel">
      <h2>
        {ar ? 'القرارات الاستثنائية للمباراة' : 'Exceptional fixture decisions'}{' '}
        <InfoTip
          locale={locale}
          label={ar ? 'القرار الرسمي' : 'Official disposition'}
          text={
            ar
              ? 'الإلغاء يستبعد أداء المباراة ويحفظ تقاريرها. الإعادة مباراة جديدة في جولة مستقبلية غير مغلقة. استئناف اللعب يبقى بنفس المباراة ويحتاج تقريراً كاملاً يجمع الفترات مرة واحدة.'
              : 'Voiding excludes performance and retains reports. A replay uses a new fixture in an unlocked future gameweek. Resumed play keeps its fixture and requires one complete cumulative report.'
          }
        />
      </h2>
      <p>
        {ar
          ? 'راجع الأثر في كل البطولات قبل الاعتماد. تبقى النتائج النهائية حتى إعادة فتحها بشكل منفصل.'
          : 'Review every affected competition before approval. Final results remain published until separately reopened.'}
      </p>
      {previous && (
        <p>
          {ar ? 'آخر قرار مسجل' : 'Last recorded decision'}:{' '}
          {labels[previous.choice.outcome][locale]} ·{' '}
          {previous.officialReference}
        </p>
      )}
      <form
        className="admin-form"
        onSubmit={(event) => {
          void review(event);
        }}
        onChange={() => {
          setPending(null);
          setPreview(null);
        }}
      >
        <fieldset disabled={busy}>
          <label>
            {ar ? 'نوع القرار' : 'Disposition'}
            <select
              aria-label={ar ? 'نوع القرار' : 'Disposition'}
              value={outcome}
              onChange={(event) => {
                setOutcome(event.target.value);
              }}
            >
              {(active
                ? (['release'] as const)
                : (['void', 'replay', 'awarded'] as const)
              ).map((value) => (
                <option key={value} value={value}>
                  {labels[value][locale]}
                </option>
              ))}
            </select>
          </label>
          {outcome === 'awarded' && (
            <div className="form-pair">
              <label>
                {ar ? 'أهداف صاحب الأرض الإدارية' : 'Awarded home goals'}
                <input
                  name="homeGoals"
                  type="number"
                  required
                  min={0}
                  max={100}
                />
              </label>
              <label>
                {ar ? 'أهداف الضيف الإدارية' : 'Awarded away goals'}
                <input
                  name="awayGoals"
                  type="number"
                  required
                  min={0}
                  max={100}
                />
              </label>
            </div>
          )}
          {outcome === 'replay' && (
            <label>
              {ar ? 'مباراة الإعادة' : 'Replacement fixture'}
              <select
                aria-label={ar ? 'مباراة الإعادة' : 'Replacement fixture'}
                name="replacement"
                required
                defaultValue=""
              >
                <option value="">
                  {ar ? 'اختر مباراة لم تبدأ' : 'Choose an unplayed fixture'}
                </option>
                {replacements.map((r) => (
                  <option key={r.id} value={r.id}>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'Africa/Cairo',
                    }).format(new Date(r.kickoff))}{' '}
                    · {r.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {ar ? 'مرجع القرار الرسمي' : 'Official decision reference'}
            <textarea
              name="reference"
              required
              minLength={5}
              maxLength={2000}
            />
          </label>
          <label>
            {ar ? 'سبب القرار' : 'Disposition reason'}
            <textarea name="reason" required minLength={5} maxLength={1000} />
          </label>
          <button className="button-outline" type="submit">
            {ar ? 'معاينة القرار' : 'PREVIEW DISPOSITION'}
          </button>
        </fieldset>
      </form>
      {notice && <p role="alert">{notice}</p>}
      {pending && preview && (
        <div className="admin-confirmation">
          <MatchReviewSummary locale={locale} preview={preview} />
          <button
            className="action-button"
            disabled={busy}
            type="button"
            onClick={() => {
              void confirm();
            }}
          >
            {ar ? 'تأكيد القرار الرسمي' : 'CONFIRM DISPOSITION'}
          </button>
        </div>
      )}
    </section>
  );
}
