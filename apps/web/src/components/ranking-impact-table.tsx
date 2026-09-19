import type { previewGameweekResults } from '@fantasy/application';
import type { Locale } from '@/lib/brand';
type Rankings = Awaited<ReturnType<typeof previewGameweekResults>>['rankings'];
export function RankingImpactTable({
  locale,
  rankings,
}: {
  readonly locale: Locale;
  readonly rankings: Rankings;
}) {
  const ar = locale === 'ar';
  const changed =
    rankings?.filter(
      (row) =>
        row.beforeRank !== row.afterRank ||
        row.beforePoints !== row.afterPoints,
    ) ?? [];
  return (
    <>
      {rankings === null ? (
        <p role="status">
          {ar
            ? 'تعذرت معاينة الترتيب لأن نتيجة فريق واحد على الأقل غير متاحة للحساب.'
            : 'Ranking projection is unavailable because at least one squad cannot be scored.'}
        </p>
      ) : changed.length === 0 ? (
        <p>
          {ar
            ? 'لا تغيير في الترتيب أو مجموع النقاط.'
            : 'No changes to ranks or point totals.'}
        </p>
      ) : (
        <>
          <div className="admin-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{ar ? 'الفريق' : 'Squad'}</th>
                  <th>{ar ? 'الترتيب المنشور' : 'Published rank'}</th>
                  <th>{ar ? 'الترتيب المقترح' : 'Proposed rank'}</th>
                  <th>{ar ? 'المجموع المنشور' : 'Published total'}</th>
                  <th>{ar ? 'المجموع المقترح' : 'Proposed total'}</th>
                </tr>
              </thead>
              <tbody>
                {changed.slice(0, 200).map((row) => (
                  <tr key={row.entryId}>
                    <td>{row.name}</td>
                    <td>{row.beforeRank}</td>
                    <td>{row.afterRank}</td>
                    <td>{row.beforePoints / 1000}</td>
                    <td>{row.afterPoints / 1000}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {changed.length > 200 && (
            <p>
              {ar
                ? `تظهر أول ٢٠٠ من ${String(changed.length)} فريق متأثر.`
                : `Showing the first 200 of ${String(changed.length)} affected squads.`}
            </p>
          )}
        </>
      )}
    </>
  );
}
