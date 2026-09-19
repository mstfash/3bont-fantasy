import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  CommandRejected,
  previewHistoricalRules,
  readHistoricalRulesHistory,
} from '@fantasy/application';
import {
  idSchema,
  historicalRuleSelectionSchema,
  historicalRuleSettingsSchema,
  competitionRulesSchema,
  type HistoricalRuleSelection,
} from '@fantasy/contracts';
import { AdminShell } from '@/components/admin-shell';
import { HistoricalRulesForm } from '@/components/historical-rules-form';
import { HistoricalRulesConfirm } from '@/components/historical-rules-confirm';
import { HistoricalRuleDiff } from '@/components/historical-rule-diff';
import { ResultImpactSummary } from '@/components/result-impact-summary';
import { ResultScoreChanges } from '@/components/result-score-changes';
import { InfoTip } from '@/components/help/info-tip';
import { requireLocale } from '@/lib/locale';
import { commandError } from '@/lib/command-errors';
import { requireStaff } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
export default async function HistoricalRulesPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
  readonly searchParams: Promise<{ proposal?: string; edit?: string }>;
}) {
  const p = await params,
    locale = requireLocale(p.locale),
    ar = locale === 'ar',
    db = getRuntime().db;
  if (!idSchema.safeParse(p.id).success) notFound();
  const round = (
    await db
      .selectFrom('gameweeks')
      .select('data')
      .where('id', '=', p.id)
      .executeTakeFirst()
  )?.data;
  if (!round) notFound();
  const context = await requireStaff(
    locale,
    'results.replay',
    round.competitionId,
    true,
  );
  if (round.resultRevision < 1) notFound();
  const query = await searchParams;
  let selection: HistoricalRuleSelection | undefined;
  let notice = '';
  if (query.proposal) {
    try {
      if (typeof query.proposal !== 'string' || query.proposal.length > 12000)
        throw new Error('Invalid proposal');
      const raw: unknown = JSON.parse(query.proposal);
      selection = historicalRuleSelectionSchema.parse(raw);
      if (selection.gameweekId !== round.id) throw new Error('Wrong gameweek');
    } catch {
      selection = undefined;
      notice = commandError('invalid-request', locale);
    }
  }
  let preview: Awaited<ReturnType<typeof previewHistoricalRules>> | null = null;
  if (selection && query.edit !== '1') {
    try {
      preview = await previewHistoricalRules(db, context.principal, selection);
    } catch (error) {
      if (error instanceof CommandRejected)
        notice = commandError(error.code, locale);
      else throw error;
    }
  }
  const history = await readHistoricalRulesHistory(
    db,
    context.principal,
    round.id,
  );
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <Link href={`/${locale}/admin/results/${round.id}`} className="eyebrow">
          {round.name[locale]} ↗
        </Link>
        <h1>
          {ar
            ? 'صحّح القاعدة. واحفظ التاريخ.'
            : 'CORRECT THE RULE. KEEP THE HISTORY.'}
        </h1>
        <p>
          {ar
            ? 'تصحيح تاريخي لجولة واحدة بصلاحية المالك. المعاينة لا تنشر نتائج.'
            : 'An owner-authorized correction for one published gameweek. Preview does not publish results.'}
        </p>
        <InfoTip
          locale={locale}
          label={ar ? 'حدود التصحيح التاريخي' : 'Historical correction limits'}
          text={
            ar
              ? 'تبقى التشكيلة واختيارات الكابتن والبدلاء والشيبس المسجلة كما هي. تتغير قيم احتساب النقاط أو مضاعفات الكابتن أو تطبيق التبديلات فقط. لا تتغير القواعد المستقبلية أو أسعار ومعاملات اللاعبين.'
              : 'Recorded squads, captain choices, bench order and chips remain intact. Only footballer scoring, captain multipliers and automatic substitution rules may change. Future rules and player price transactions are preserved.'
          }
        />
      </div>
      {!preview && (
        <HistoricalRulesForm
          key={query.proposal ?? 'initial'}
          locale={locale}
          round={round}
          {...(selection ? { initial: selection } : {})}
        />
      )}
      {notice && <p role="alert">{notice}</p>}
      {preview && (
        <div id="rule-preview">
          <section className="admin-panel">
            <h2>
              {ar ? 'معاينة التصحيح التاريخي' : 'Historical correction preview'}
            </h2>
            <p>
              {ar ? 'نسخة القواعد' : 'Rules version'}{' '}
              {preview.originalRules.version} → {preview.proposedRules.version}{' '}
              · {ar ? 'نسخة النتائج الحالية' : 'Current result revision'}{' '}
              {round.resultRevision}
            </p>
            <p>
              {preview.canApply
                ? ar
                  ? 'اكتملت المدخلات؛ راجع الأثر قبل الاعتماد.'
                  : 'Inputs are complete; review the impact before approving.'
                : ar
                  ? 'النشر محجوب: توجد بيانات أو نتائج ناقصة.'
                  : 'Publication held: scoring inputs or recorded results are incomplete.'}
            </p>
          </section>
          <Link
            className="button-outline"
            href={`/${locale}/admin/results/${round.id}/rules?proposal=${encodeURIComponent(JSON.stringify(preview.selection))}&edit=1`}
          >
            {ar ? 'تعديل المقترح' : 'Edit proposal'}
          </Link>
          <HistoricalRuleDiff
            locale={locale}
            before={historicalRuleSettingsSchema.parse({
              scoring: historicalRuleSettingsSchema.shape.scoring
                .strip()
                .parse(preview.originalRules.scoring),
              gameweek: preview.originalRules.gameweek,
            })}
            after={preview.selection.settings}
          />
          <ResultScoreChanges
            locale={locale}
            changes={preview.impact.changes}
          />
          <ResultImpactSummary locale={locale} preview={preview.impact} />
          {preview.canApply && (
            <HistoricalRulesConfirm
              locale={locale}
              selection={preview.selection}
              fingerprint={preview.fingerprint}
            />
          )}
        </div>
      )}
      <section className="admin-panel">
        <h2>{ar ? 'سجل نسخ الحساب' : 'Calculation history'}</h2>
        <p>
          {ar
            ? 'أحدث ٢٠ نسخة محفوظة. لا يمحو التصحيح النسخ السابقة.'
            : 'The latest 20 retained calculations. Corrections never erase earlier revisions.'}
        </p>
        <div className="admin-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{ar ? 'نسخة النتائج' : 'Result revision'}</th>
                <th>{ar ? 'نسخة القواعد' : 'Rules version'}</th>
                <th>{ar ? 'نقاط التمريرة' : 'Assist points'}</th>
                <th>{ar ? 'مضاعف الكابتن' : 'Captain multiplier'}</th>
                <th>{ar ? 'وقت الحساب' : 'Calculated at'}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => {
                const rules = competitionRulesSchema.parse(h.rules);
                return (
                  <tr key={h.revision}>
                    <td>{h.revision}</td>
                    <td>{rules.version}</td>
                    <td>{rules.scoring.assist / 1000}</td>
                    <td>{rules.gameweek.captainMultiplier}</td>
                    <td>
                      {new Intl.DateTimeFormat(locale, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                        timeZone: 'Africa/Cairo',
                      }).format(new Date(h.calculatedAt))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
