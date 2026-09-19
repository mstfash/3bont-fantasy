import Link from 'next/link';
import { notFound } from 'next/navigation';
import { idSchema } from '@fantasy/contracts';
import { readProviderEvidence } from '@fantasy/application';
import { AdminShell } from '@/components/admin-shell';
import { requireStaff } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
import { requireLocale, deadlineLabel } from '@/lib/locale';
export default async function ProviderEvidencePage({
  params,
}: {
  readonly params: Promise<{ locale: string; attemptId: string }>;
}) {
  const route = await params,
    locale = requireLocale(route.locale),
    ar = locale === 'ar';
  const parsed = idSchema.safeParse(route.attemptId);
  if (!parsed.success) notFound();
  const staff = await requireStaff(locale, 'facts.manage', null);
  const report = await readProviderEvidence(
    getRuntime().db,
    staff.principal,
    staff.grants,
    parsed.data,
  );
  if (!report) notFound();
  const payload = report.evidence
    ? JSON.stringify(report.evidence.payload, null, 2)
    : null;
  return (
    <AdminShell locale={locale} grants={staff.grants}>
      <div className="admin-title">
        <Link className="eyebrow" href={`/${locale}/admin/providers`}>
          {ar ? 'العودة إلى المزود' : 'BACK TO PROVIDER'} ↗
        </Link>
        <h1>{ar ? 'دليل المصدر المحفوظ' : 'SAVED SOURCE EVIDENCE'}</h1>
        <p>
          {ar
            ? 'استجابة محفوظة بعد حجب الأسرار. هذا دليل للمراجعة، ولا يعني قبول البيانات لحساب النقاط.'
            : 'A retained response with secrets redacted. Evidence for review does not mean the data was accepted for scoring.'}
        </p>
      </div>
      <section className="admin-panel">
        <h2>{ar ? 'الطلب والتوقيت' : 'REQUEST AND TIMING'}</h2>
        <p dir="ltr">{JSON.stringify(report.request)}</p>
        <p>
          {ar ? 'بداية الطلب' : 'Request started'}:{' '}
          {deadlineLabel(report.startedAt, locale)}
        </p>
        <p>
          {ar ? 'الاستجابة' : 'HTTP response'}: {report.httpStatus ?? '—'}
        </p>
        <p>
          {ar ? 'انتهى الطلب' : 'Request finished'}:{' '}
          {report.finishedAt ? deadlineLabel(report.finishedAt, locale) : '—'}
        </p>
        {report.evidence && (
          <p>
            {ar ? 'أول حفظ لهذا المحتوى' : 'First stored copy of this content'}:{' '}
            {deadlineLabel(report.evidence.firstStoredAt, locale)}
          </p>
        )}
        <p>
          {ar
            ? 'بصمة النقل الأصلية قبل الحجب'
            : 'Original transport checksum before redaction'}
        </p>
        <code style={{ overflowWrap: 'anywhere' }}>
          {report.transportChecksum ?? '—'}
        </code>
      </section>
      <section className="admin-panel">
        <Link
          className="button-outline"
          href={`/api/v1/admin/providers/evidence?attempt=${report.attemptId}`}
        >
          {ar ? 'تنزيل الدليل المحجوب' : 'Download redacted evidence'}
        </Link>
        <h2>{ar ? 'المحتوى المحفوظ' : 'RETAINED CONTENT'}</h2>
        {payload !== null ? (
          <>
            <pre
              dir="ltr"
              style={{
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                maxHeight: '36rem',
                overflow: 'auto',
                fontSize: '.8rem',
              }}
            >
              {payload.slice(0, 32000)}
            </pre>
            {payload.length > 32000 && (
              <p>
                {ar
                  ? 'تُعرض أول ٣٢ ألف حرف فقط؛ المحتوى الكامل محفوظ للمراجعة.'
                  : 'Showing the first 32,000 characters; the complete bounded response remains stored for review.'}
              </p>
            )}
          </>
        ) : (
          <p>
            {ar
              ? 'لا يوجد محتوى محفوظ. قد يكون الطلب قد انقطع أو تجاوز حد الحجم. لا يُفسّر ذلك كبيانات صفرية.'
              : 'No response content was retained. The request may have failed or exceeded the size limit; this is not zero-valued football data.'}
          </p>
        )}
      </section>
    </AdminShell>
  );
}
