import Link from 'next/link';
import { commandError } from '@/lib/command-errors';
import { readProviderSchedules } from '@fantasy/application';
import { AdminShell } from '@/components/admin-shell';
import { ProviderScheduleControls } from '@/components/providers/provider-schedule-controls';
import { requireLocale, deadlineLabel } from '@/lib/locale';
import { requireStaff } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
import '@/styles/groups.css';
export default async function ProviderSchedulesPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const locale = requireLocale((await params).locale),
    ar = locale === 'ar';
  const staff = await requireStaff(locale, 'facts.manage', null);
  const info = await readProviderSchedules(
    getRuntime().db,
    staff.principal,
    staff.grants,
  );
  const states = {
    queued: ar ? 'في الانتظار' : 'Queued',
    collecting: ar ? 'جارٍ الجمع' : 'Collecting',
    complete: ar ? 'اكتملت المصادر' : 'Sources complete',
    held: ar ? 'تحتاج مراجعة' : 'Held for review',
    cancelled: ar ? 'ملغاة' : 'Cancelled',
  };
  return (
    <AdminShell locale={locale} grants={staff.grants}>
      <div className="admin-title">
        <span className="eyebrow">API-FOOTBALL</span>
        <h1>{ar ? 'جدول بيانات المباريات.' : 'MATCH DATA, ON SCHEDULE.'}</h1>
        <p>
          {ar
            ? 'جمع مصادر المباراة وفق مواعيدها، ضمن الحصة المتاحة. تُراجع التقارير قبل اعتماد حقائق المباراة أو نتائج الفانتازي.'
            : 'Collect match sources around kickoff within the available quota. Reports are reviewed before becoming football facts or fantasy results.'}
        </p>
        <p>
          <Link href={`/${locale}/admin/providers`}>
            {ar ? 'ميزانية المزود والمحاولات' : 'Provider quota and attempts'}
          </Link>{' '}
          ·{' '}
          <Link href={`/${locale}/admin/operations`}>
            {ar ? 'حالة العامل' : 'Worker health'}
          </Link>
        </p>
      </div>
      <section className="group-card">
        <h2>{ar ? 'حدود التشغيل' : 'Collection controls'}</h2>
        <p>
          {ar
            ? 'كل دفعة تحتاج أربعة طلبات. المواعيد المستهدفة تتأثر بالحصة والتأخير وإعادة المحاولة؛ لا تعني اكتمال البيانات. تنتهي صلاحية الدفعة بعد عشر دقائق من أول حجز إذا لم تكتمل.'
            : 'Each batch needs four requests. Quota, latency and retries can delay the requested cadence; a schedule does not establish data completeness. An unfinished batch expires ten minutes after its first reservation.'}
        </p>
        <p>
          {ar
            ? 'يبدأ تشغيل الجمع على الخادم معطلاً. مواسم الاختبار لا تُرسل إلى المزود الحقيقي.'
            : 'Server automation starts disabled. Synthetic seasons cannot send collection traffic to the live provider.'}
        </p>
      </section>
      {!info.account && (
        <p>
          {ar
            ? 'أعدّ حساب المزود أولاً.'
            : 'Configure the provider account first.'}
        </p>
      )}
      {info.bindings.length === 0 && (
        <p>
          <Link href={`/${locale}/admin/providers/identities`}>
            {ar
              ? 'اربط موسم المزود قبل إنشاء جدول.'
              : 'Bind a provider season before creating a schedule.'}
          </Link>
        </p>
      )}
      {info.bindings.map(({ binding, season, schedule }) => (
        <section
          className="group-card"
          key={binding.id}
          aria-label={season.name[locale]}
        >
          <h2>{season.name[locale]}</h2>
          <p>
            {schedule?.enabled
              ? ar
                ? 'جدول الموسم مفعل'
                : 'Season schedule enabled'
              : ar
                ? 'جدول الموسم متوقف'
                : 'Season schedule paused'}
            {season.synthetic
              ? ar
                ? ' · بيانات اختبار'
                : ' · Synthetic data'
              : ''}
          </p>
          {info.account && (
            <ProviderScheduleControls
              key={schedule?.revision ?? 0}
              locale={locale}
              accountId={info.account.id}
              bindingId={binding.id}
              schedule={schedule}
            />
          )}
        </section>
      ))}
      <section className="admin-panel">
        <div className="admin-panel-heading">
          <h2>{ar ? 'آخر ١٠٠ دفعة' : 'Latest 100 collections'}</h2>
        </div>
        <div className="admin-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{ar ? 'دفعة المباراة' : 'Match collection'}</th>
                <th>{ar ? 'الوقت المخطط' : 'Planned'}</th>
                <th>{ar ? 'الحالة' : 'State'}</th>
                <th>{ar ? 'المصادر' : 'Sources'}</th>
                <th>{ar ? 'التفاصيل' : 'Details'}</th>
              </tr>
            </thead>
            <tbody>
              {info.batches.map(({ data }) => (
                <tr key={data.id}>
                  <td>
                    <Link href={`/${locale}/admin/matches/${data.fixtureId}`}>
                      {ar ? 'مراجعة المباراة' : 'Review match'} ↗
                    </Link>
                  </td>
                  <td>{deadlineLabel(data.plannedAt, locale)}</td>
                  <td>{states[data.state]}</td>
                  <td>{data.step} / 4</td>
                  <td>
                    {data.code ? (
                      <details>
                        <summary>
                          {ar ? 'سبب التوقف' : 'Collection issue'}
                        </summary>
                        <p>{commandError(data.code, locale)}</p>
                        <code>{data.code}</code>
                      </details>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {info.batches.length === 0 && (
          <p>{ar ? 'لم تُخطط دفعات بعد.' : 'No collections planned yet.'}</p>
        )}
      </section>
    </AdminShell>
  );
}
