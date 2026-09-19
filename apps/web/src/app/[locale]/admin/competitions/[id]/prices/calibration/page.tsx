import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CommandRejected, readPriceCalibration } from '@fantasy/application';
import { competitionSchema, idSchema } from '@fantasy/contracts';
import { AdminShell } from '@/components/admin-shell';
import { PriceCalibrationForm } from '@/components/price-calibration-form';
import { requireLocale } from '@/lib/locale';
import { requireStaff } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
export default async function CalibrationPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
  readonly searchParams: Promise<{ report?: string }>;
}) {
  const p = await params,
    search = await searchParams,
    locale = requireLocale(p.locale),
    ar = locale === 'ar';
  if (
    !idSchema.safeParse(p.id).success ||
    (search.report && !idSchema.safeParse(search.report).success)
  )
    notFound();
  const context = await requireStaff(locale, 'competition.manage', p.id),
    db = getRuntime().db;
  const row = await db
    .selectFrom('competitions')
    .select('data')
    .where('id', '=', p.id)
    .executeTakeFirst();
  if (!row) notFound();
  const competition = competitionSchema.parse(row.data);
  const recent = await db
    .selectFrom('price_calibration_runs')
    .select(['id', 'created_at'])
    .where('competition_id', '=', p.id)
    .orderBy('created_at', 'desc')
    .limit(20)
    .execute();
  const selected = search.report;
  const report = selected
    ? await readPriceCalibration(
        db,
        context.principal,
        context.grants,
        p.id,
        selected,
      ).catch((error: unknown) => {
        if (error instanceof CommandRejected) notFound();
        throw error;
      })
    : null;
  const amount = (ticks: string | null) =>
    ticks === null
      ? ar
        ? 'لا توجد تشكيلة قانونية'
        : 'No legal squad'
      : `${String(BigInt(ticks) / 10n)}.${String(BigInt(ticks) % 10n)}`;
  const date = (value: string) =>
    new Date(value).toLocaleString(ar ? 'ar-EG' : 'en-GB', {
      timeZone: 'Africa/Cairo',
    });
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <Link
          className="eyebrow"
          href={`/${locale}/admin/competitions/${p.id}/prices`}
        >
          {competition.name[locale]} ↗
        </Link>
        <h1>{ar ? 'اختبر. قبل التسعير.' : 'TEST BEFORE REPRICING.'}</h1>
        <p>
          {ar
            ? 'تجربة محفوظة تقارن سياسات الأسعار باستخدام نتائج الجولات النهائية.'
            : 'A saved experiment comparing pricing policies using finalized gameweek results.'}
        </p>
      </div>
      <section className="admin-panel">
        <h2>{ar ? 'افتراضات التجربة' : 'Experiment assumptions'}</h2>
        <p>
          {ar
            ? 'تبدأ التجربة بأسعار ومراكز وأندية وإتاحة اللاعبين وتثبيت الأسعار الحالية. تستخدم آخر نسخة نهائية مسجلة لكل جولة ومواعيدها الحالية؛ لا تعيد بناء الأسعار أو البيانات المعروفة تاريخياً. لا تحاكي أرصدة المشاركين أو مشترياتهم، ولا تضيف نقاطاً للاعب غائب عن بيانات الجولة.'
            : 'Starts with current prices, positions, clubs, selectability and manual pins. Uses each round’s latest finalized revision and recorded calendar; it does not reconstruct historical prices or what was known at the time. Participant banks and purchases are excluded. Missing player observations never become zero-point appearances.'}
        </p>
        <p>
          {ar
            ? 'دفعة واحدة لكل نافذة تعديل مع احترام فترة التجميد. النتائج التي تصل داخل التجميد تؤجل. حفظ التقرير لا ينشر أسعاراً ولا يفعّل التحديث التلقائي.'
            : 'At most one batch per editing window, respecting the freeze period. Results arriving inside the freeze are deferred. Saving a report does not publish prices or enable automatic updates.'}
        </p>
      </section>
      <section className="admin-panel">
        <h2>{ar ? 'تجربة جديدة' : 'New experiment'}</h2>
        <div className="admin-form">
          <PriceCalibrationForm
            locale={locale}
            competitionId={p.id}
            rules={competition.rules.pricing}
          />
        </div>
      </section>
      {report && (
        <section className="admin-panel" data-testid="calibration-report">
          <h2>{ar ? 'تقرير المقارنة' : 'Comparison report'}</h2>
          <p>
            {report.basis.synthetic
              ? ar
                ? 'بيانات تجريبية مصطنعة — لا تثبت جاهزية الموسم الحقيقي.'
                : 'Synthetic rehearsal data — not evidence of real-season readiness.'
              : ar
                ? 'يلزم التحقق من ترخيص وجودة وملاءمة البيانات قبل التشغيل التلقائي.'
                : 'Data rights, quality and representativeness still require review before automatic operation.'}
          </p>
          <p>
            {ar ? 'البيانات حتى' : 'Data cutoff'}: {date(report.basis.cutoff)} ·{' '}
            {report.basis.players.length} {ar ? 'لاعب' : 'players'} ·{' '}
            {report.basis.rounds.filter((r) => r.finalizedAt).length}{' '}
            {ar ? 'جولة نهائية' : 'finalized rounds'}
          </p>
          <p>
            {ar ? 'أقل تكلفة قبل التجربة' : 'Starting minimum squad cost'}:{' '}
            {amount(report.output.baseline.minimumSquadTicks)} ·{' '}
            {ar ? 'الميزانية' : 'Budget'}:{' '}
            {amount(String(report.basis.squad.startingBudget))}
          </p>
          <div className="admin-actions">
            <a
              className="button-outline"
              href={`/api/v1/admin/prices/calibration?competition=${p.id}&report=${report.id}`}
            >
              {ar ? 'تنزيل التقرير والبيانات' : 'Download report and evidence'}
            </a>
          </div>
          {report.output.results.map((result) => (
            <div key={result.label} className="admin-panel">
              <h3>{result.label}</h3>
              <p>
                {result.batches.length}{' '}
                {ar ? 'دفعة محاكاة' : 'simulated batches'} ·{' '}
                {result.deferredGameweekIds.length}{' '}
                {ar ? 'جولة مؤجلة' : 'deferred rounds'}
              </p>
              <p>
                {ar ? 'التكلفة النهائية لأرخص تشكيلة' : 'Final cheapest squad'}:{' '}
                {amount(result.final.minimumSquadTicks)} ·{' '}
                {result.final.affordable
                  ? ar
                    ? 'ضمن الميزانية'
                    : 'Within budget'
                  : ar
                    ? 'خارج الميزانية أو لا توجد تشكيلة قانونية'
                    : 'Over budget or no legal squad'}
              </p>
              <p>
                {ar ? 'إجمالي قيمة اللاعبين: من' : 'Total pool value: from'}{' '}
                {amount(report.output.baseline.totalTicks)} →{' '}
                {amount(result.final.totalTicks)}
              </p>
              <div className="admin-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{ar ? 'المركز' : 'Position'}</th>
                      <th>{ar ? 'اللاعبون' : 'Players'}</th>
                      <th>{ar ? 'القيمة النهائية' : 'Final value'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.final.positions.map((position) => (
                      <tr key={position.position}>
                        <td>{position.position}</td>
                        <td>{position.count}</td>
                        <td>{amount(position.totalTicks)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="admin-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{ar ? 'النشر المحاكى' : 'Simulated publication'}</th>
                      <th>{ar ? 'الجولة التالية' : 'Editing round'}</th>
                      <th>{ar ? 'مصادر' : 'Sources'}</th>
                      <th>{ar ? 'تغيرات' : 'Changes'}</th>
                      <th>{ar ? 'أقل تكلفة' : 'Minimum cost'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.batches.map((batch) => (
                      <tr key={batch.editingGameweekId}>
                        <td>{date(batch.at)}</td>
                        <td>
                          {
                            report.basis.rounds.find(
                              (r) => r.id === batch.editingGameweekId,
                            )?.number
                          }
                        </td>
                        <td>
                          {batch.sourceGameweekIds
                            .map(
                              (id) =>
                                report.basis.rounds.find((r) => r.id === id)
                                  ?.number,
                            )
                            .join(', ')}
                        </td>
                        <td>{batch.changes.length}</td>
                        <td>
                          {amount(batch.market.minimumSquadTicks)}
                          {!batch.market.affordable && ' ⚠'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!result.batches.length && (
                <p>
                  {ar
                    ? 'لم تتوفر نافذة نشر مناسبة ضمن البيانات المختارة.'
                    : 'No eligible publication window was available within this sample.'}
                </p>
              )}
            </div>
          ))}
        </section>
      )}
      <section className="admin-panel">
        <h2>{ar ? 'التقارير المحفوظة' : 'Saved reports'}</h2>
        {recent.map((run) => (
          <p key={run.id}>
            <Link
              href={`/${locale}/admin/competitions/${p.id}/prices/calibration?report=${run.id}`}
            >
              {date(run.created_at.toISOString())}
            </Link>
          </p>
        ))}
        {!recent.length && (
          <p>{ar ? 'لا توجد تقارير بعد.' : 'No reports yet.'}</p>
        )}
      </section>
    </AdminShell>
  );
}
