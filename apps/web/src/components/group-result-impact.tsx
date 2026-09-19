import type { previewGameweekResults } from '@fantasy/application';
import type { Locale } from '@/lib/brand';
import { RankingImpactTable } from './ranking-impact-table';
import { InfoTip } from './help/info-tip';

type Impact = Awaited<ReturnType<typeof previewGameweekResults>>['groupImpact'];
type Edition = Impact['groups'][number]['headToHead'][number];
type Match = Edition['before']['matches'][number];
function outcome(match: Match, ar: boolean) {
  switch (match.outcome) {
    case null:
      return ar ? 'غير متاح' : 'Unavailable';
    case 'bye':
      return ar ? 'راحة' : 'Bye';
    case 'double-forfeit':
      return ar ? 'انسحاب الطرفين' : 'Double forfeit';
    case 'draw':
      return ar ? 'تعادل' : 'Draw';
    case 'home':
      return `${ar ? 'الفائز' : 'Winner'}: ${match.homeName}`;
    case 'away':
      return `${ar ? 'الفائز' : 'Winner'}: ${match.awayName ?? ''}`;
  }
}
function EditionImpact({
  edition,
  locale,
}: {
  readonly edition: Edition;
  readonly locale: Locale;
}) {
  const ar = locale === 'ar';
  const after = edition.after;
  if (after === null)
    return (
      <p role="status">
        {ar
          ? 'تعذرت معاينة المواجهات لأن نتيجة فريق غير متاحة للحساب.'
          : 'Matchup projection is unavailable because a squad cannot be scored.'}
      </p>
    );
  const beforeById = new Map(
    edition.before.table.map((row) => [row.entryId, row]),
  );
  const changed = after.table.filter((row) => {
    const before = beforeById.get(row.entryId);
    return (
      !before ||
      before.rank !== row.rank ||
      before.tablePoints !== row.tablePoints ||
      before.fantasyPoints !== row.fantasyPoints
    );
  });
  return (
    <>
      <div className="admin-table-scroll">
        <table>
          <caption>
            {ar ? 'نتائج مواجهات الجولة' : 'Gameweek matchup results'}
          </caption>
          <thead>
            <tr>
              <th>{ar ? 'المواجهة' : 'Matchup'}</th>
              <th>{ar ? 'النتيجة المنشورة' : 'Published outcome'}</th>
              <th>{ar ? 'النتيجة المقترحة' : 'Proposed outcome'}</th>
              <th>{ar ? 'النقاط المنشورة' : 'Published scores'}</th>
              <th>{ar ? 'النقاط المقترحة' : 'Proposed scores'}</th>
            </tr>
          </thead>
          <tbody>
            {edition.before.matches.map((match, index) => {
              const next = after.matches[index];
              if (!next)
                throw new Error('Correction preview lost a scheduled matchup');
              const score = (value: number | null) =>
                value === null ? '—' : String(value / 1000);
              return (
                <tr key={`${match.gameweekId}:${match.homeId}`}>
                  <td>
                    {match.homeName} / {match.awayName ?? (ar ? 'راحة' : 'Bye')}
                  </td>
                  <td>{outcome(match, ar)}</td>
                  <td>{outcome(next, ar)}</td>
                  <td>
                    <bdi>
                      {score(match.homePoints)} / {score(match.awayPoints)}
                    </bdi>
                  </td>
                  <td>
                    <bdi>
                      {score(next.homePoints)} / {score(next.awayPoints)}
                    </bdi>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {changed.length === 0 ? (
        <p>
          {ar ? 'لا تغيير في جدول المواجهات.' : 'No changes to the H2H table.'}
        </p>
      ) : (
        <div className="admin-table-scroll">
          <table>
            <caption>
              {ar ? 'التغييرات في جدول المواجهات' : 'H2H table changes'}
            </caption>
            <thead>
              <tr>
                <th>{ar ? 'الفريق' : 'Squad'}</th>
                <th>{ar ? 'الترتيب المنشور' : 'Published rank'}</th>
                <th>{ar ? 'الترتيب المقترح' : 'Proposed rank'}</th>
                <th>
                  {ar ? 'نقاط الجدول المنشورة' : 'Published table points'}
                </th>
                <th>{ar ? 'نقاط الجدول المقترحة' : 'Proposed table points'}</th>
                <th>
                  {ar ? 'نقاط الفانتازي المنشورة' : 'Published fantasy points'}
                </th>
                <th>
                  {ar ? 'نقاط الفانتازي المقترحة' : 'Proposed fantasy points'}
                </th>
              </tr>
            </thead>
            <tbody>
              {changed.map((row) => {
                const before = beforeById.get(row.entryId);
                return (
                  <tr key={row.entryId}>
                    <td>{row.name}</td>
                    <td>{before?.rank ?? '—'}</td>
                    <td>{row.rank}</td>
                    <td>{before?.tablePoints ?? '—'}</td>
                    <td>{row.tablePoints}</td>
                    <td>{before ? before.fantasyPoints / 1000 : '—'}</td>
                    <td>{row.fantasyPoints / 1000}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
export function GroupResultImpact({
  locale,
  impact,
}: {
  readonly locale: Locale;
  readonly impact: Impact;
}) {
  const ar = locale === 'ar';
  const label = ar
    ? 'أثر التصحيح على الدوريات والمواجهات'
    : 'League and H2H correction impact';
  return (
    <section className="admin-panel" aria-labelledby="group-impact-title">
      <h2 id="group-impact-title">{label}</h2>
      <InfoTip
        locale={locale}
        label={label}
        text={
          ar
            ? 'تستخدم الدوريات أعضاءها الحاليين وجولة البداية، وتستخدم المواجهات جدولها المنشور وانسحاباتها المسجلة. تبقى هذه معاينة فقط؛ تغيّر أي بيانات مؤثرة يتطلب مراجعة جديدة.'
            : 'Classic leagues use current active members and their starting round. H2H uses the published schedule and recorded forfeits. This is a projection only; a change to relevant data requires a fresh review.'
        }
      />
      <p>
        {ar
          ? 'تستبدل المعاينة نتيجة هذه الجولة فقط. لا تُنشر نتائج أو تُعتمد جوائز عند فتحها.'
          : 'The preview replaces only this gameweek. Opening it does not publish results or approve awards.'}
      </p>
      {impact.restrictedGroups > 0 && (
        <p role="status">
          {ar
            ? `${String(impact.restrictedGroups)} دوريات خاصة مشمولة في فحص التغييرات؛ تفاصيلها محجوبة حسب صلاحية القراءة.`
            : `${String(impact.restrictedGroups)} private leagues are included in the change check; their details are restricted by read access.`}
        </p>
      )}
      {impact.groups.length === 0 && (
        <p>
          {ar
            ? 'لا توجد دوريات متأثرة متاحة للعرض.'
            : 'No affected leagues are available to display.'}
        </p>
      )}
      {impact.groups.map((group) => (
        <details key={group.id} className="admin-panel">
          <summary>{group.name}</summary>
          {group.classic && (
            <>
              <h3>
                {ar ? 'ترتيب الدوري الكلاسيكي' : 'Classic league standings'}
              </h3>
              <RankingImpactTable
                locale={locale}
                rankings={group.classic.rankings}
              />
            </>
          )}
          {group.headToHead.map((edition) => (
            <div key={edition.id}>
              <h3>{edition.name}</h3>
              <EditionImpact edition={edition} locale={locale} />
            </div>
          ))}
        </details>
      ))}
    </section>
  );
}
