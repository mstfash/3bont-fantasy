import { notFound } from 'next/navigation';
import { idSchema } from '@fantasy/contracts';
import { previewGameweekResults } from '@fantasy/application';
import { AdminShell } from '@/components/admin-shell';
import { ResultImpactSummary } from '@/components/result-impact-summary';
import { ReopenResults } from '@/components/reopen-results';
import { requireLocale } from '@/lib/locale';
import { requireStaff } from '@/server/staff';
import { getRuntime } from '@/server/runtime';
export default async function ResultReviewPage({
  params,
}: {
  readonly params: Promise<{ locale: string; id: string }>;
}) {
  const p = await params;
  const locale = requireLocale(p.locale);
  const ar = locale === 'ar';
  if (!idSchema.safeParse(p.id).success) notFound();
  const db = getRuntime().db;
  const reference = await db
    .selectFrom('gameweeks')
    .select('competition_id')
    .where('id', '=', p.id)
    .executeTakeFirst();
  if (!reference) notFound();
  const context = await requireStaff(
    locale,
    'competition.manage',
    reference.competition_id,
  );
  const preview = await previewGameweekResults(
    db,
    context.principal,
    context.grants,
    p.id,
  );
  const changed = preview.changes.filter((c) => c.before !== c.after);
  return (
    <AdminShell locale={locale} grants={context.grants}>
      <div className="admin-title">
        <span className="eyebrow">
          {preview.round.name[locale]} / {preview.round.status}
        </span>
        <h1>{ar ? 'راجع أثر كل نقطة.' : 'REVIEW EVERY POINT.'}</h1>
        <p>
          {ar
            ? `${String(changed.length)} فريق تتغير نقاطه. هذه معاينة وليست نشراً.`
            : `${String(changed.length)} squads have changed totals. This is a preview, not a publication.`}
        </p>
      </div>
      <section className="admin-panel">
        <h2>{ar ? 'جودة البيانات' : 'Data readiness'}</h2>
        <p>
          {preview.settled
            ? ar
              ? 'كل المباريات وبيانات النقاط مكتملة.'
              : 'All fixtures and scoring inputs are settled.'
            : ar
              ? 'الجولة لم تكتمل أو توجد بيانات ناقصة.'
              : 'The round is still in progress or scoring data is incomplete.'}
        </p>
        {preview.issues.length > 0 && (
          <details>
            <summary>
              {ar ? 'عرض البيانات الناقصة' : 'Show missing-data details'} (
              {preview.issues.length})
            </summary>
            <ul>
              {preview.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </details>
        )}
      </section>
      <section className="admin-panel">
        <h2>{ar ? 'تغييرات النقاط' : 'Score changes'}</h2>
        <div className="admin-table-scroll">
          <table>
            <thead>
              <tr>
                <th>{ar ? 'الفريق' : 'Squad'}</th>
                <th>{ar ? 'المنشور' : 'Published'}</th>
                <th>{ar ? 'المقترح' : 'Proposed'}</th>
                <th>{ar ? 'الفرق' : 'Change'}</th>
              </tr>
            </thead>
            <tbody>
              {changed.slice(0, 200).map((row) => (
                <tr key={row.entryId}>
                  <td>{row.name}</td>
                  <td>{row.before === null ? '—' : row.before / 1000}</td>
                  <td>
                    {row.after === null
                      ? ar
                        ? 'متعذر'
                        : 'Blocked'
                      : row.after / 1000}
                  </td>
                  <td>
                    {row.before !== null && row.after !== null
                      ? (row.after - row.before) / 1000
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {changed.length > 200 && (
          <p>
            {ar
              ? 'تظهر أول ٢٠٠ نتيجة متغيرة.'
              : 'Showing the first 200 changed results.'}
          </p>
        )}
      </section>
      <ResultImpactSummary locale={locale} preview={preview} />
      {['finalized', 'review'].includes(preview.round.status) && (
        <ReopenResults
          locale={locale}
          gameweekId={p.id}
          revision={preview.round.resultRevision}
          fingerprint={preview.fingerprint}
        />
      )}
    </AdminShell>
  );
}
