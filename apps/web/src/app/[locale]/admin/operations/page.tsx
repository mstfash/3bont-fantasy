import Link from 'next/link';
import { readWorkerHealth } from '@fantasy/application';
import type { WorkerRunSummary } from '@fantasy/contracts';
import { AdminShell } from '@/components/admin-shell';
import { requireLocale, deadlineLabel } from '@/lib/locale';
import { commandError } from '@/lib/command-errors';
import { requireStaff } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
import '@/styles/groups.css';
export default async function OperationsPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const locale = requireLocale((await params).locale),
    ar = locale === 'ar',
    staff = await requireStaff(locale, 'operations.read', null),
    health = await readWorkerHealth(
      getRuntime().db,
      staff.principal,
      staff.grants,
    );
  const taskNames = {
    'game-cycle': ar ? 'المواعيد والنتائج' : 'Deadlines and results',
    maintenance: ar ? 'صيانة البيانات' : 'Data maintenance',
    'provider-collection': ar
      ? 'جمع بيانات المباريات'
      : 'Match data collection',
    'account-exports': ar ? 'أرشيفات المشاركين' : 'Participant archives',
  };
  const states = {
    unobserved: ar ? 'لم يُسجّل تشغيل بعد' : 'No run recorded',
    stale: ar ? 'لم يبدأ تشغيل حديث' : 'No recent run',
    running: ar ? 'قيد التشغيل' : 'Running',
    ok: ar ? 'اكتمل' : 'Completed',
    attention: ar ? 'يحتاج مراجعة' : 'Needs review',
    failed: ar ? 'فشل التشغيل' : 'Run failed',
  };
  const metrics: Record<keyof WorkerRunSummary['counts'], string> = {
    providerAutomationEnabled: ar
      ? 'الجمع التلقائي مفعل (١ = نعم)'
      : 'Automation enabled (1 = yes)',
    collectionsPlanned: ar ? 'دفعات مجدولة' : 'Collections planned',
    providerAttempts: ar ? 'محاولات المزود' : 'Provider attempts',
    collectionsCompleted: ar ? 'دفعات مكتملة' : 'Collections completed',
    collectionsHeld: ar ? 'دفعات تحتاج مراجعة' : 'Collections held',
    archivesReady: ar ? 'أرشيفات جاهزة' : 'Archives ready',
    archivesFailed: ar ? 'أرشيفات تعذّرت' : 'Archives failed',
    roundsInspected: ar ? 'جولات فُحصت' : 'Rounds inspected',
    roundsLocked: ar ? 'جولات أُغلقت' : 'Rounds locked',
    entriesSnapshotted: ar ? 'فرق حُفظت' : 'Squads snapshotted',
    resultsProcessed: ar ? 'جولات نتائج عولجت' : 'Result rounds processed',
    achievementChanges: ar ? 'تغييرات الإنجازات' : 'Achievement changes',
    prizeCasesOpened: ar ? 'مراجعات جوائز جديدة' : 'Prize reviews opened',
    prizeCasesUpdated: ar ? 'مراجعات جوائز محدّثة' : 'Prize reviews updated',
  };
  return (
    <AdminShell locale={locale} grants={staff.grants}>
      <div className="admin-title">
        <span className="eyebrow">
          {ar
            ? 'المواعيد. النتائج. المتابعة.'
            : 'DEADLINES. RESULTS. FOLLOW-THROUGH.'}
        </span>
        <h1>{ar ? 'حالة التشغيل' : 'WORKER HEALTH'}</h1>
        <p>
          {ar
            ? 'آخر نشاط مسجّل لمعالجة اللعبة وصيانة البيانات. غياب السجل لا يثبت نجاح التشغيل.'
            : 'Recorded activity for game processing and data maintenance. An absent run does not establish successful operation.'}
        </p>
        <p>
          {ar ? 'آخر قراءة' : 'Observed at'}:{' '}
          {deadlineLabel(health.now, locale)}
        </p>
        <a href={`/${locale}/admin/operations`}>
          {ar ? 'تحديث الحالة' : 'Refresh status'}
        </a>{' '}
        ·{' '}
        <Link href={`/${locale}/admin/support`}>
          {ar ? 'فتح متابعة التشغيل' : 'Open support desk'}
        </Link>
      </div>
      <div className="group-grid">
        {health.latest.map(({ task, run, state }) => (
          <section className="group-card" key={task}>
            <h2>{taskNames[task]}</h2>
            <p>
              <strong>{states[state]}</strong>
            </p>
            <p>
              {task !== 'maintenance'
                ? ar
                  ? 'متوقّع كل دقيقة؛ راجع التشغيل إذا لم يبدأ خلال ٣ دقائق.'
                  : 'Expected every minute; investigate if no run starts within 3 minutes.'
                : ar
                  ? 'متوقّع كل ساعة؛ راجع التشغيل إذا لم يبدأ خلال ٩٠ دقيقة.'
                  : 'Expected hourly; investigate if no run starts within 90 minutes.'}
            </p>
            {run && (
              <>
                <p>
                  {ar ? 'بدأ' : 'Started'}:{' '}
                  {deadlineLabel(run.started_at.toISOString(), locale)}
                </p>
                <p>
                  {ar ? 'انتهى' : 'Finished'}:{' '}
                  {run.finished_at
                    ? deadlineLabel(run.finished_at.toISOString(), locale)
                    : '—'}
                </p>
                <p>
                  {ar ? 'مشكلات تحتاج مراجعة' : 'Issues needing review'}:{' '}
                  {run.summary?.issueCount ?? '—'}
                </p>
                {Object.entries(run.summary?.counts ?? {}).map(
                  ([key, value]) => (
                    <p key={key}>
                      {metrics[key as keyof typeof metrics]}: {value}
                    </p>
                  ),
                )}
              </>
            )}
            {state === 'failed' && (
              <p>
                {ar
                  ? 'راجع سجل الخادم باستخدام معرّف التشغيل أدناه. لا تُعد تشغيل الجوائز أو الأسعار يدويًا دون مراجعة حالتها.'
                  : 'Use the run reference below to inspect the server log and the affected workflow state.'}
              </p>
            )}
          </section>
        ))}
      </div>
      <section className="admin-panel">
        <h2>{ar ? 'آخر ٥٠ تشغيلًا' : 'LATEST 50 RUNS'}</h2>
        <p>
          {ar
            ? 'تُحفظ سجلات التشغيل ٣٠ يومًا. لا تتضمن كلمات مرور أو نصوص استثناءات أو محتوى المحادثات.'
            : 'Run records are retained for 30 days. They contain no passwords, exception text or chat content.'}
        </p>
        <div className="admin-table-scroll pool-scroll">
          <table>
            <thead>
              <tr>
                <th>{ar ? 'المهمة' : 'Task'}</th>
                <th>{ar ? 'البداية' : 'Started'}</th>
                <th>{ar ? 'النتيجة' : 'Outcome'}</th>
                <th>{ar ? 'المشكلات' : 'Issues'}</th>
              </tr>
            </thead>
            <tbody>
              {health.runs.map((run) => (
                <tr key={run.id}>
                  <td>{taskNames[run.task]}</td>
                  <td>{deadlineLabel(run.started_at.toISOString(), locale)}</td>
                  <td>{states[run.status]}</td>
                  <td>
                    <details>
                      <summary>
                        {run.summary?.issueCount ?? '—'} ·{' '}
                        {ar ? 'مرجع التشغيل' : 'Run reference'}
                      </summary>
                      <p>
                        <bdi>{run.id}</bdi>
                      </p>
                      {run.summary?.issues.map((issue, i) => (
                        <p key={`${issue.kind}:${issue.id}:${String(i)}`}>
                          {commandError(issue.code, locale)}{' '}
                          <bdi>{issue.id}</bdi>
                        </p>
                      ))}
                      {run.summary &&
                        run.summary.issueCount > run.summary.issues.length && (
                          <p>
                            {ar
                              ? 'عُرضت أول ١٠٠ مشكلة؛ راجع سير العمل للمزيد.'
                              : 'The first 100 issues are shown; inspect the workflow for the rest.'}
                          </p>
                        )}
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
