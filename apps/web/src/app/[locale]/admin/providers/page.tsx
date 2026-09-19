import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AccessDenied, readProviderAdministration } from '@fantasy/application';
import { AdminShell } from '@/components/admin-shell';
import { ProviderControls } from '@/components/providers/provider-controls';
import { requireLocale, deadlineLabel } from '@/lib/locale';
import { getRuntime } from '@/server/runtime';
import { requireStaffSession } from '@/server/staff';
import '@/styles/groups.css';
export default async function ProvidersPage({
  params,
}: {
  readonly params: Promise<{ locale: string }>;
}) {
  const locale = requireLocale((await params).locale),
    ar = locale === 'ar',
    context = await requireStaffSession(locale);
  const info = await readProviderAdministration(
    getRuntime().db,
    context.principal,
    context.grants,
  ).catch((error: unknown) => {
    if (error instanceof AccessDenied) notFound();
    throw error;
  });
  const account = info?.account.data ?? null;
  const outcomes = {
    success: ar ? 'نجاح' : 'Success',
    'provider-error': ar ? 'خطأ من المزود' : 'Provider error',
    'rate-limited': ar ? 'حد الطلبات' : 'Rate limited',
    unconfirmed: ar ? 'نتيجة غير مؤكّدة' : 'Unconfirmed',
    'schema-invalid': ar ? 'استجابة غير صالحة' : 'Invalid response',
    'dispatch-expired': ar ? 'انتهت مهلة الإرسال' : 'Dispatch expired',
  };
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <span className="eyebrow">API-FOOTBALL</span>
        <h1>
          {ar ? 'بيانات موثوقة. طلبات محسوبة.' : 'CONTROL EVERY REQUEST.'}
        </h1>
        <p>
          {ar
            ? 'كل محاولة وصفحة وإعادة طلب تُحسب قبل الإرسال. بيانات الملاعب المنشورة لها دورة تحقق مستقلة.'
            : 'Every attempt, page and retry is counted before dispatch. Published football facts have a separate validation lifecycle.'}
        </p>
      </div>
      <p>
        <Link href={`/${locale}/admin/providers/acceptance`}>
          {ar ? 'سياسة قبول التقارير' : 'Report acceptance policy'} ↗
        </Link>
      </p>
      <section className="group-card">
        <h2>
          {account?.state === 'enabled'
            ? ar
              ? 'الطلب مسموح ضمن الحدود'
              : 'REQUESTS ENABLED WITHIN LIMITS'
            : ar
              ? 'الطلبات متوقفة'
              : 'REQUESTS PAUSED'}
        </h2>
        <p>
          {ar
            ? 'يلزم مفتاح عامل مُعدّ على خادم التشغيل. التفعيل هنا يؤكد الميزانية فقط؛ لا يثبت تغطية الموسم أو صحة البيانات.'
            : 'A worker key must be configured on the server. Enabling here confirms quota only; it does not establish season coverage or data accuracy.'}
        </p>
        {info?.interval && (
          <p>
            {deadlineLabel(info.interval.starts.toISOString(), locale)} →{' '}
            {deadlineLabel(info.interval.ends.toISOString(), locale)}
          </p>
        )}
        <p>
          {ar ? 'الاستهلاك الكلي' : 'Total used'}: {info?.budget?.used ?? 0} /{' '}
          {info?.budget?.ceiling ?? account?.dailyLimit ?? '—'} ·{' '}
          {ar ? 'الطلبات العادية' : 'Ordinary calls'}:{' '}
          {info?.budget?.ordinary_used ?? 0} /{' '}
          {info?.budget?.ordinary_ceiling ?? '—'}
        </p>
        {info?.account.cooldown_until && (
          <p>
            {ar ? 'مهلة أمان حتى' : 'Cooldown until'}:{' '}
            {deadlineLabel(info.account.cooldown_until.toISOString(), locale)}
          </p>
        )}
        <p>
          {ar ? 'آخر استجابة ناجحة' : 'Last successful response'}:{' '}
          {info?.account.last_success_at
            ? deadlineLabel(info.account.last_success_at.toISOString(), locale)
            : ar
              ? 'لم تُسجّل'
              : 'Not recorded'}
        </p>
      </section>
      <p>
        <Link
          className="button-outline"
          href={`/${locale}/admin/providers/identities`}
        >
          {ar ? 'ربط هويات المصدر ↗' : 'Map provider identities ↗'}
        </Link>
      </p>
      <p>
        <Link
          className="button-outline"
          href={`/${locale}/admin/providers/schedules`}
        >
          {ar ? 'جدولة بيانات المباريات ↗' : 'Schedule match collection ↗'}
        </Link>
      </p>
      <ProviderControls
        key={account?.revision ?? 0}
        locale={locale}
        account={account}
        windowStart={info?.interval?.starts.toISOString() ?? null}
        used={info?.budget?.used ?? 0}
      />
      <section className="admin-panel">
        <div className="admin-panel-heading">
          <h2>{ar ? 'آخر ٥٠ محاولة' : 'LATEST 50 ATTEMPTS'}</h2>
        </div>
        <div className="admin-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{ar ? 'المورد' : 'Resource'}</th>
                <th>{ar ? 'الفئة' : 'Budget class'}</th>
                <th>{ar ? 'وقت الحجز' : 'Reserved'}</th>
                <th>{ar ? 'النتيجة' : 'Outcome'}</th>
                <th>{ar ? 'الدليل' : 'Evidence'}</th>
              </tr>
            </thead>
            <tbody>
              {info?.attempts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <bdi>{a.request.resource}</bdi>
                  </td>
                  <td>
                    {a.priority === 'ordinary'
                      ? ar
                        ? 'عادي'
                        : 'Ordinary'
                      : ar
                        ? 'تصحيح / استعادة'
                        : 'Correction / recovery'}
                  </td>
                  <td>{deadlineLabel(a.reserved_at.toISOString(), locale)}</td>
                  <td>
                    {a.outcome
                      ? outcomes[a.outcome]
                      : ar
                        ? 'محجوزة / غير مؤكّدة'
                        : 'Reserved / uncertain'}
                  </td>
                  <td>
                    <Link href={`/${locale}/admin/providers/evidence/${a.id}`}>
                      {ar ? 'مراجعة الدليل' : 'Review evidence'}
                    </Link>
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
