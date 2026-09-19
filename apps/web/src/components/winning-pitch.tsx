import type { readCompetitionPulse } from '@fantasy/application';
import type { Locale } from '@/lib/brand';
import { InfoTip } from './help/info-tip';
import { FootballShirt } from './football-shirt';
import { positionNames } from '@/lib/football-labels';
type Lineup = NonNullable<
  Awaited<ReturnType<typeof readCompetitionPulse>>['lineup']
>;
export function WinningPitch({
  lineup,
  locale,
}: {
  readonly lineup: Lineup;
  readonly locale: Locale;
}) {
  const ar = locale === 'ar';
  const field = lineup.players.filter((p) => lineup.pitchIds.includes(p.id));
  const bench = lineup.players.filter((p) => lineup.benchIds.includes(p.id));
  const formation = ['DEF', 'MID', 'FWD']
    .map((position) => field.filter((p) => p.position === position).length)
    .join('–');
  function player(p: Lineup['players'][number]) {
    return (
      <li className="kit-player" key={p.id}>
        <div className="kit-art">
          <FootballShirt color={p.color} number={p.shirtNumber} />
          {p.captain && (
            <span
              className="captain-badge"
              aria-label={ar ? 'الكابتن' : 'Captain'}
            >
              C
            </span>
          )}
        </div>
        <strong>{p.name[locale]}</strong>
        <small>
          {p.club} · {ar ? 'رقم' : 'No.'} {p.shirtNumber ?? '—'}
        </small>
        <span
          className={p.counted ? 'pitch-points' : 'pitch-points reserve-points'}
        >
          {(
            (p.points + (p.captain ? lineup.captainExtra : 0)) /
            1000
          ).toLocaleString(locale)}{' '}
          {ar ? 'نقطة' : 'pts'}
          {!p.counted && <small> · {ar ? 'لم تُحتسب' : 'not counted'}</small>}
        </span>
      </li>
    );
  }
  return (
    <div className="winning-lineup">
      <div className="pitch-caption">
        <strong dir="ltr">{formation}</strong>
        <InfoTip
          locale={locale}
          label={ar ? 'التشكيلة والنقاط' : 'Formation and points'}
          text={
            ar
              ? 'التشكيلة المنشورة للجولة. تُطبق التبديلات التلقائية بعد حسم المشاركة. إضافة الكابتن ضمن نقاطه. تظهر دكة تعزيز البدلاء منفصلة. أرقام القمصان من الدليل الحالي؛ الشرطة تعني رقماً غير معروف.'
              : 'The published gameweek lineup. Automatic substitutions apply once participation is settled. Captain points include the multiplier. Bench Boost reserves remain separate. Shirt numbers come from the current catalogue; a dash means unknown.'
          }
        />
      </div>
      <div
        className="winning-pitch"
        aria-label={ar ? 'ملعب التشكيلة المحتسبة' : 'Scoring formation pitch'}
      >
        <div className="field-markings" aria-hidden="true">
          <i />
          <b />
        </div>
        {(['FWD', 'MID', 'DEF', 'GK'] as const).map((position) => (
          <ul
            className="winning-pitch-row"
            aria-label={positionNames[position][locale]}
            key={position}
          >
            {field.filter((p) => p.position === position).map(player)}
          </ul>
        ))}
      </div>
      {bench.length > 0 && (
        <div className="winning-bench">
          <h4>{ar ? 'دكة البدلاء' : 'THE BENCH'}</h4>
          <ul>{bench.map(player)}</ul>
        </div>
      )}
      <div className="pitch-ledger">
        <span>
          {ar ? 'نقاط اللاعبين' : 'Player points'}{' '}
          <b>{(lineup.playersTotal / 1000).toLocaleString(locale)}</b>
        </span>
        <span>
          {ar ? 'إضافة الكابتن' : 'Captain bonus'}{' '}
          <b>{(lineup.captainExtra / 1000).toLocaleString(locale)}</b>
        </span>
        <span>
          {ar ? 'خصم الانتقالات' : 'Transfer cost'}{' '}
          <b>{(lineup.transferDeduction / 1000).toLocaleString(locale)}</b>
        </span>
        <strong>
          {ar ? 'المجموع' : 'TOTAL'}{' '}
          {(lineup.total / 1000).toLocaleString(locale)}
        </strong>
      </div>
    </div>
  );
}
