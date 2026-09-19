'use client';
import { TopicHelp } from './help/page-help';
import { useRef, useState, type SubmitEvent } from 'react';
import { z } from 'zod';
import {
  competitionCommandSchema,
  competitionImpactSchema,
  type CompetitionImpact,
  competitionRulesSchema,
  competitionSchema,
  defaultCompetitionRules,
  type Competition,
  type Season,
  type Gameweek,
} from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { commandError } from '@/lib/command-errors';
import { CompetitionRuleControls } from './rules/competition-rules';
import { CairoDateTime } from './cairo-date-time';
import { CompetitionImpactReview } from './competition-impact';

const responseSchema = z.object({
  competition: competitionSchema.optional(),
  code: z.string().optional(),
});
export function CompetitionEditor({
  locale,
  competition,
  seasons,
  initialOpens,
  gameweeks = [],
}: {
  readonly locale: Locale;
  readonly competition: Competition | null;
  readonly seasons: readonly Season[];
  readonly initialOpens: string;
  readonly gameweeks?: readonly Gameweek[];
}) {
  const ar = locale === 'ar';
  const [rules, setRules] = useState(
    competition?.rules ?? defaultCompetitionRules(),
  );
  const [impact, setImpact] = useState<CompetitionImpact | null>(null);
  const reviewGeneration = useRef(0);
  function invalidateReview() {
    reviewGeneration.current++;
    setPreview(null);
    setImpact(null);
  }
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<z.infer<
    typeof competitionCommandSchema
  > | null>(null);
  const previous = useRef<{ fingerprint: string; commandId: string } | null>(
    null,
  );
  async function review(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setNotice('');
    invalidateReview();
    const generation = reviewGeneration.current;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const field = (key: string) => {
      const value = form.get(key);
      return typeof value === 'string' ? value : '';
    };
    try {
      const draft = {
        commandId: crypto.randomUUID(),
        name: { ar: field('nameAr'), en: field('nameEn') },
        description: { ar: field('descriptionAr'), en: field('descriptionEn') },
        entryLimit: Number(field('entryLimit')),
        registrationOpens: new Date(field('opens')).toISOString(),
        registrationCloses: new Date(field('closes')).toISOString(),
        rules: competitionRulesSchema.parse(rules),
        reason: field('reason'),
      };
      const command = competitionCommandSchema.parse(
        competition
          ? {
              ...draft,
              kind: 'update',
              ...(field('economicEffectiveGameweekId')
                ? {
                    economicEffectiveGameweekId: field(
                      'economicEffectiveGameweekId',
                    ),
                  }
                : {}),
              competitionId: competition.id,
              expectedRevision: competition.revision,
            }
          : {
              ...draft,
              kind: 'create',
              slug: field('slug'),
              seasonId: field('seasonId'),
            },
      );
      if (
        Date.parse(draft.registrationCloses) <=
        Date.parse(draft.registrationOpens)
      )
        throw new Error('Registration dates');
      if (command.kind === 'update') {
        const response = await fetch('/api/v1/admin/competitions/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(command),
        });
        const payload: unknown = await response.json();
        const result = z
          .object({
            impact: competitionImpactSchema.optional(),
            code: z.string().optional(),
          })
          .parse(payload);
        if (reviewGeneration.current !== generation) return;
        if (!response.ok || !result.impact) {
          setNotice(commandError(result.code ?? 'request-unconfirmed', locale));
          return;
        }
        setImpact(result.impact);
        setPreview({
          ...command,
          expectedImpactFingerprint: result.impact.fingerprint,
        });
      } else setPreview(command);
    } catch {
      if (reviewGeneration.current !== generation) return;
      setNotice(
        ar
          ? 'راجع البيانات والتواريخ وتكوين القواعد. لم يتم الحفظ.'
          : 'Check the fields, dates and rules configuration. Nothing was saved.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function confirm(): Promise<void> {
    if (!preview) return;
    setBusy(true);
    setNotice('');
    try {
      const fingerprint = JSON.stringify({ ...preview, commandId: '' });
      if (previous.current?.fingerprint !== fingerprint)
        previous.current = { fingerprint, commandId: preview.commandId };
      const response = await fetch('/api/v1/admin/competitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...preview,
          commandId: previous.current.commandId,
        }),
      });
      const payload: unknown = await response.json();
      const result = responseSchema.parse(payload);
      if (!response.ok || !result.competition) {
        const code = result.code;
        if (
          code === 'competition-impact-changed' ||
          code === 'competition-changed'
        )
          invalidateReview();
        if (code === 'staff-verification-required')
          setNotice(
            ar
              ? 'جدّد التحقق من كلمة المرور والمصادقة في صفحة الأمان، ثم أعد المحاولة.'
              : 'Refresh password/authenticator verification on the Security page, then retry.',
          );
        else if (code === 'structural-rules-frozen')
          setNotice(
            ar
              ? 'تكوين الفريق والترتيب ثابتان بعد أول موعد إغلاق. استخدم بطولة جديدة لتغييرات التكوين.'
              : 'Squad structure and ranking policy are fixed after the first deadline. Use a new competition for structural changes.',
          );
        else if (code === 'entry-limit-below-existing')
          setNotice(
            ar
              ? 'لا يمكن تخفيض الحد تحت عدد فرق أحد الحسابات الموجودة.'
              : 'The limit cannot be lower than an account’s existing entry count.',
          );
        else if (code?.startsWith('player-pool-'))
          setNotice(
            ar
              ? 'مجموعة اللاعبين لا تسمح بتكوين فريق قانوني ضمن الميزانية. راجع المراكز واللاعبين المتاحين وحد النادي والأسعار.'
              : 'The selectable player pool cannot produce a legal squad within budget. Review positions, club limits and prices.',
          );
        else if (code === 'publication-needs-rounds-and-player-pool')
          setNotice(
            ar
              ? 'أضف جولات مستقبلية ومجموعة لاعبين قبل النشر.'
              : 'Add future gameweeks and a player pool before publishing.',
          );
        else setNotice(commandError(code ?? 'request-unconfirmed', locale));
        return;
      }
      window.location.assign(
        `/${locale}/admin/competitions/${result.competition.id}`,
      );
    } catch {
      setNotice(
        ar
          ? 'لم يتم تأكيد الحفظ. أعد المحاولة بنفس البيانات.'
          : 'Save not confirmed. Retry with the same data.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-panel">
      <TopicHelp locale={locale} topic="configuration" />
      <form
        className="admin-form"
        onSubmit={(event) => {
          void review(event);
        }}
        onChange={invalidateReview}
      >
        <div className="form-pair">
          <label>
            {ar ? 'الاسم بالعربية' : 'Arabic name'}
            <input
              name="nameAr"
              dir="rtl"
              required
              maxLength={120}
              defaultValue={competition?.name.ar}
            />
          </label>
          <label>
            {ar ? 'الاسم بالإنجليزية' : 'English name'}
            <input
              name="nameEn"
              dir="ltr"
              required
              maxLength={120}
              defaultValue={competition?.name.en}
            />
          </label>
        </div>
        <div className="form-pair">
          <label>
            {ar ? 'الوصف بالعربية' : 'Arabic description'}
            <textarea
              name="descriptionAr"
              dir="rtl"
              required
              maxLength={2000}
              defaultValue={competition?.description.ar}
            />
          </label>
          <label>
            {ar ? 'الوصف بالإنجليزية' : 'English description'}
            <textarea
              name="descriptionEn"
              dir="ltr"
              required
              maxLength={2000}
              defaultValue={competition?.description.en}
            />
          </label>
        </div>
        {!competition && (
          <div className="form-pair">
            <label>
              {ar ? 'الموسم الحقيقي' : 'Real season'}
              <select name="seasonId" required>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name[locale]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {ar ? 'رابط البطولة' : 'Competition URL slug'}
              <input
                name="slug"
                dir="ltr"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                required
                maxLength={80}
              />
            </label>
          </div>
        )}
        <div className="form-pair">
          <CairoDateTime
            locale={locale}
            label={ar ? 'بداية التسجيل' : 'Registration opens'}
            name="opens"
            initialValue={competition?.registrationOpens ?? initialOpens}
          />
          <CairoDateTime
            locale={locale}
            label={ar ? 'نهاية التسجيل' : 'Registration closes'}
            name="closes"
            initialValue={competition?.registrationCloses ?? ''}
          />
        </div>
        <label>
          {ar ? 'الحد الأقصى للفرق لكل حساب' : 'Maximum squads per account'}
          <input
            name="entryLimit"
            type="number"
            min={1}
            max={100}
            required
            defaultValue={competition?.entryLimit ?? 1}
          />
        </label>
        {competition && (
          <label>
            {ar
              ? 'بدء تغييرات الانتقالات وتفعيل الشرائح'
              : 'Transfer and chip availability changes start from'}
            <select name="economicEffectiveGameweekId" defaultValue="">
              <option value="">
                {ar
                  ? 'اختر جولة لم يبدأ تعديلها بعد عند تغيير هذه القواعد'
                  : 'Choose an unopened editing round when changing these rules'}
              </option>
              {gameweeks
                .filter(
                  (g) =>
                    g.status === 'upcoming' &&
                    Date.parse(g.deadline) > Date.parse(initialOpens),
                )
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name[locale]}
                  </option>
                ))}
            </select>
            <small>
              {ar
                ? 'يلزم إخطار قبل فتح تعديل الجولة بـ ٤٨ ساعة على الأقل. لا تتغير تكاليف الانتقالات السابقة أو الشرائح المختارة. زيادة المخزون تتطلب منحة متساوية مستقلة.'
                : 'Allow at least 48 hours before that round opens for editing. Accepted transfers and selected chips keep their rules. Inventory increases require a separate equal grant.'}
            </small>
          </label>
        )}
        <CompetitionRuleControls
          locale={locale}
          value={rules}
          frozen={
            (competition?.firstLockedAt ?? null) !== null ||
            gameweeks.some(
              (g) =>
                g.status !== 'upcoming' ||
                Date.parse(g.deadline) <= Date.parse(initialOpens),
            )
          }
          onChange={(next) => {
            setRules(next);
            invalidateReview();
          }}
        />
        <label>
          {ar
            ? 'سبب التغيير — يظهر في السجل'
            : 'Reason — recorded in the audit trail'}
          <textarea name="reason" required minLength={5} maxLength={1000} />
        </label>
        {notice && (
          <p role="alert" className="editor-notice">
            {notice}
          </p>
        )}
        <div className="admin-actions">
          <button type="submit" className="action-button" disabled={busy}>
            {ar ? 'مراجعة وحفظ' : 'REVIEW & SAVE'}
          </button>
          {competition?.status === 'draft' && (
            <button
              type="button"
              className="button-outline"
              disabled={busy}
              onClick={() => {
                invalidateReview();
                setPreview({
                  kind: 'publish',
                  commandId: crypto.randomUUID(),
                  competitionId: competition.id,
                  expectedRevision: competition.revision,
                  reason: ar
                    ? 'اعتماد البطولة ونشرها للمشاركين'
                    : 'Approve competition for public participation',
                });
              }}
            >
              {ar ? 'مراجعة النشر' : 'Review publication'}
            </button>
          )}
        </div>
      </form>
      {preview && (
        <div className="admin-confirmation">
          <h2>{ar ? 'تأكيد التغيير' : 'Confirm change'}</h2>
          <p>
            {preview.kind === 'publish'
              ? ar
                ? 'ستظهر البطولة للمشاركين. يجب تجهيز الجولات ومجموعة اللاعبين أولاً.'
                : 'The competition will become visible to participants. Gameweeks and a player pool must be ready.'
              : ar
                ? 'سيتم حفظ البيانات وتسجيل السبب. الجولات المغلقة تحتفظ بقواعدها.'
                : 'Save these details and record the reason. Locked gameweeks retain their rules.'}
          </p>
          {preview.kind === 'update' && impact && (
            <CompetitionImpactReview impact={impact} locale={locale} />
          )}
          <button
            className="action-button"
            disabled={busy}
            type="button"
            onClick={() => {
              void confirm();
            }}
          >
            {ar ? 'تأكيد' : 'CONFIRM'}
          </button>
        </div>
      )}
    </section>
  );
}
