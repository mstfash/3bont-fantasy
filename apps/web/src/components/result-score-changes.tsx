import type { previewGameweekResults } from '@fantasy/application';
import type { Locale } from '@/lib/brand';
export function ResultScoreChanges({
  locale,
  changes,
}: {
  readonly locale: Locale;
  readonly changes: Awaited<
    ReturnType<typeof previewGameweekResults>
  >['changes'];
}) {
  const ar = locale === 'ar';
  const changed = changes.filter((c) => c.before !== c.after);
  return (
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
  );
}
