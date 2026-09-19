import Link from 'next/link';
import type { readCompetitionPulse } from '@fantasy/application';
import type { Locale } from '@/lib/brand';
import { WinningPitch } from './winning-pitch';
import { BoardRefresh } from './board-refresh';
import { StandingsMovement } from './standings-movement';
import { InfoTip } from './help/info-tip';
import '@/styles/home-board.css';
type Pulse = Awaited<ReturnType<typeof readCompetitionPulse>>;
export function HomeBoard({
  pulse,
  locale,
  competitions,
}: {
  readonly pulse: Pulse;
  readonly locale: Locale;
  readonly competitions: readonly {
    slug: string;
    name: { ar: string; en: string };
  }[];
}) {
  const ar = locale === 'ar',
    root = `/${locale}/competitions/${pulse.competition.slug}`;
  const selected = pulse.winners.find(
    (w) => w.entryId === pulse.selectedEntryId,
  );
  return (
    <section
      className="content-section home-board"
      id="scoreboard"
      aria-label={ar ? 'لوحة النتائج' : 'Gameweek board'}
    >
      <div className="section-heading">
        <span className="eyebrow">
          {ar ? 'كل مركز له حكاية' : 'THE GAMEWEEK BOARD'}
        </span>
        <h2>
          {ar ? 'الترتيب بيتغيّر. تابع الحكاية.' : 'THE TABLE HAS A STORY.'}
        </h2>
      </div>
      <div className="board-toolbar">
        <form action={`/${locale}`}>
          <label>
            {ar ? 'البطولة' : 'Competition'}
            <select name="competition" defaultValue={pulse.competition.slug}>
              {competitions.map((c) => (
                <option value={c.slug} key={c.slug}>
                  {c.name[locale]}
                </option>
              ))}
            </select>
          </label>
          <button className="button-outline" type="submit">
            {ar ? 'عرض البطولة' : 'Show competition'}
          </button>
        </form>
        <BoardRefresh locale={locale} checkedAt={pulse.checkedAt} />
      </div>
      {pulse.synthetic && (
        <p className="synthetic-banner">
          {ar
            ? 'بيانات تجريبية مصطنعة — ليست نتائج الدوري الحقيقي'
            : 'SYNTHETIC DEMO DATA — NOT LIVE LEAGUE RESULTS'}
        </p>
      )}
      <div className="board-grid">
        <div className="board-tables">
          <section
            className="leaderboard-card"
            aria-label={ar ? 'صدارة الترتيب العام' : 'Overall leaders'}
          >
            <div className="board-card-heading">
              <h3>{ar ? 'في الصدارة' : 'THE FRONT RUNNERS'}</h3>
              <InfoTip
                locale={locale}
                label={ar ? 'الترتيب والحركة' : 'Ranking and movement'}
                text={
                  ar
                    ? 'أول خمسة فرق حسب النقاط المنشورة. الأسهم تقارن الترتيب بنهاية الجولة السابقة، وفق النسخ الحالية للنتائج. الجديد لم يكن له مركز سابق. النقاط المؤقتة قد تتغير. تتحدث الصفحة كل دقيقة أثناء ظهورها.'
                    : 'Top five squads by published points. Arrows compare the table with the previous gameweek using current result revisions. New means no earlier rank. Provisional scores may change. The visible page refreshes every minute.'
                }
              />
            </div>
            <p>
              {pulse.competition.name[locale]}
              {pulse.latest && <> · {pulse.latest.name[locale]}</>}
            </p>
            {pulse.standings.length === 0 ? (
              <p className="board-empty">
                {ar
                  ? 'أول نقاط الموسم جاية. كوّن فريقك وابدأ المنافسة.'
                  : 'The first points are still to come. Build your squad and get in the game.'}
              </p>
            ) : (
              <ol className="leaderboard-list">
                {pulse.standings.slice(0, 5).map((row) => (
                  <li key={row.entryId}>
                    <span className="board-rank">
                      {row.rank.toLocaleString(locale)}
                    </span>
                    <div className="board-entry">
                      <Link href={`${root}/results/${row.entryId}`}>
                        {row.name}
                      </Link>
                      <small>
                        {row.provisional
                          ? ar
                            ? 'نقاط مؤقتة'
                            : 'Provisional'
                          : ar
                            ? 'نقاط منشورة'
                            : 'Published'}
                        {row.retired &&
                          ` · ${ar ? 'انتهت المشاركة' : 'Retired'}`}
                      </small>
                    </div>
                    <StandingsMovement
                      rank={row.rank}
                      previousRank={row.previousRank}
                      locale={locale}
                    />
                    <div className="board-score">
                      <strong>
                        {(row.points / 1000).toLocaleString(locale)}
                      </strong>
                      <small>
                        {row.roundPoints > 0 ? '+' : ''}
                        {(row.roundPoints / 1000).toLocaleString(locale)}{' '}
                        {ar ? 'الجولة' : 'GW'}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <Link className="board-more" href={`${root}/standings`}>
              {ar ? 'الترتيب الكامل' : 'FULL STANDINGS'}{' '}
              <span aria-hidden="true">↗</span>
            </Link>
          </section>
          <section
            className="winners-card"
            aria-label={ar ? 'فائزو الجولة' : 'Gameweek winners'}
          >
            <div className="board-card-heading">
              <h3>{ar ? 'أصحاب الجولة' : 'THE GAMEWEEK BELONGS TO…'}</h3>
              <InfoTip
                locale={locale}
                label={ar ? 'فائزو الجولة' : 'Gameweek winners'}
                text={
                  ar
                    ? 'أصحاب المركز الأول في أحدث جولة معتمدة، مع تطبيق سياسة التعادل. الفوز بالنقاط ليس قرار صرف جائزة. تبقى الجوائز تحت شروطها ومسار اعتمادها.'
                    : 'First place in the latest finalized gameweek, applying its ranking policy. A points win is not an award payment decision. Prizes keep their own terms and approval process.'
                }
              />
            </div>
            {pulse.finalRound && <p>{pulse.finalRound.name[locale]}</p>}
            {pulse.winnersHeld ? (
              <p role="status">
                {ar
                  ? 'الفائزون قيد المراجعة بعد تحديث بيانات الجولة.'
                  : 'Winners are held for review after a gameweek data change.'}
              </p>
            ) : pulse.winners.length === 0 ? (
              <p>
                {ar
                  ? 'التتويج يبدأ بعد اعتماد أول جولة.'
                  : 'The first winners appear once a gameweek is final.'}
              </p>
            ) : (
              <>
                {pulse.winners.length > 1 && (
                  <p>
                    {ar
                      ? `فائزون مشتركون: ${String(pulse.winners.length)}`
                      : `Joint winners: ${String(pulse.winners.length)}`}
                  </p>
                )}
                <ol className="winner-list">
                  {pulse.winners.slice(0, 3).map((w) => (
                    <li key={w.entryId}>
                      <span aria-hidden="true">★</span>
                      <Link
                        href={`${root}/results/${w.entryId}?gameweek=${pulse.finalRound?.id ?? ''}`}
                      >
                        {w.name}
                      </Link>
                      <b>
                        {(w.points / 1000).toLocaleString(locale)}{' '}
                        {ar ? 'نقطة' : 'pts'}
                      </b>
                    </li>
                  ))}
                </ol>
                {pulse.winners.length > 3 && (
                  <p>
                    {ar
                      ? 'يعرض أول ثلاثة فائزين مشتركين؛ البقية في القائمة الكاملة.'
                      : 'Showing three joint winners; see the full list for everyone.'}
                  </p>
                )}
              </>
            )}
            {pulse.finalRound && (
              <Link
                className="board-more"
                href={`${root}/standings?gameweek=${pulse.finalRound.id}`}
              >
                {ar ? 'نتائج الجولة كاملة' : 'FULL GAMEWEEK RESULTS'}{' '}
                <span aria-hidden="true">↗</span>
              </Link>
            )}
          </section>
        </div>
        <section
          className="featured-squad"
          aria-label={ar ? 'تشكيلة الجولة الفائزة' : 'Winning gameweek squad'}
        >
          <span className="eyebrow">
            {ar ? 'على أرض الملعب' : 'ON THE PITCH'}
          </span>
          <h3>
            {selected?.name ??
              (ar ? 'مين هيكسب الجولة؟' : 'WHO WILL OWN THE GAMEWEEK?')}
          </h3>
          {pulse.finalRound && (
            <p>
              {pulse.finalRound.name[locale]} ·{' '}
              {ar ? 'جولة معتمدة' : 'Finalized gameweek'}
            </p>
          )}
          {pulse.winners.length > 1 && (
            <form action={`/${locale}`} className="winner-picker">
              <input
                type="hidden"
                name="competition"
                value={pulse.competition.slug}
              />
              <label>
                {ar ? 'اختر فائزاً مشتركاً' : 'Choose a joint winner'}
                <select
                  name="winner"
                  defaultValue={pulse.selectedEntryId ?? ''}
                >
                  {pulse.winners.map((w) => (
                    <option value={w.entryId} key={w.entryId}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="button-outline">
                {ar ? 'عرض التشكيلة' : 'Show squad'}
              </button>
            </form>
          )}
          {pulse.lineup ? (
            <WinningPitch lineup={pulse.lineup} locale={locale} />
          ) : (
            <div className="board-pitch-empty">
              <span aria-hidden="true">✳</span>
              <p>
                {ar
                  ? 'التشكيلة الفائزة تظهر هنا بعد اعتماد نتائج الجولة.'
                  : 'The winning formation lands here when gameweek results are final.'}
              </p>
              <Link href={`${root}/join`}>
                {ar ? 'كوّن فريقك' : 'Build your squad'} ↗
              </Link>
            </div>
          )}
          {selected && pulse.finalRound && (
            <Link
              className="board-more"
              href={`${root}/results/${selected.entryId}?gameweek=${pulse.finalRound.id}`}
            >
              {ar ? 'كل نقطة في التشكيلة' : 'EVERY POINT EXPLAINED'} ↗
            </Link>
          )}
        </section>
      </div>
    </section>
  );
}
