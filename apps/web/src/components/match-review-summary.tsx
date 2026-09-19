import type { MatchReviewPreview } from '@fantasy/contracts';
import type { Locale } from '@/lib/brand';
import { InfoTip } from './help/info-tip';
export function MatchReviewSummary({
  preview,
  locale,
}: {
  readonly preview: MatchReviewPreview;
  readonly locale: Locale;
}) {
  const ar = locale === 'ar';
  return (
    <section
      aria-label={ar ? 'أثر المباراة على البطولات' : 'Shared match impact'}
    >
      <h3>
        {ar ? 'كل البطولات المتأثرة' : 'EVERY AFFECTED COMPETITION'}{' '}
        <InfoTip
          locale={locale}
          label={ar ? 'أثر المباراة' : 'Match impact'}
          text={
            ar
              ? 'معاينة دون حفظ. يشمل التحقق كل البطولات المرتبطة حتى غير المسموح لك بعرضها. اعتماد الحقائق لا يعيد فتح النتائج النهائية ولا يغير جوائز مسلّمة.'
              : 'This preview saves nothing. Confirmation checks every linked competition, including restricted ones. Accepting facts does not reopen final results or change delivered awards.'
          }
        />
      </h3>
      <p>
        {ar
          ? `بطولات متأثرة: ${String(preview.affectedCompetitions)}. محجوبة حسب الصلاحيات: ${String(preview.restrictedCompetitions)}.`
          : `Affected competitions: ${String(preview.affectedCompetitions)}. Restricted by scope: ${String(preview.restrictedCompetitions)}.`}
      </p>
      {preview.rounds.map((r) => (
        <article key={r.gameweekId} className="group-card">
          <h4>
            {r.competitionName[locale]} · {r.name[locale]}
          </h4>
          <p>
            {ar ? 'نسخة القواعد' : 'Rules version'} {r.rulesVersion}
          </p>
          {!r.locked ? (
            <p>
              {ar
                ? 'الجولة لم تُغلق؛ لا توجد تشكيلة ثابتة لحساب أثرها بعد.'
                : 'This round has not locked; its squad impact cannot be calculated yet.'}
            </p>
          ) : (
            <>
              <p>
                {ar
                  ? `فرق تتغير نقاطها: ${String(r.changedSquads)} · مراكز تتغير: ${String(r.changedRanks)}`
                  : `Squad scores changed: ${String(r.changedSquads)} · Ranks changed: ${String(r.changedRanks)}`}
              </p>
              <p>
                {ar
                  ? `دوريات كلاسيكية: ${String(r.classicGroups)} · نسخ مواجهات: ${String(r.headToHeadEditions)} · جوائز: ${String(r.prizePools)}`
                  : `Classic leagues: ${String(r.classicGroups)} · H2H editions: ${String(r.headToHeadEditions)} · Prize pools: ${String(r.prizePools)}`}
              </p>
              <p>
                {ar
                  ? `معاينات جوائز معلّقة: ${String(r.heldPrizeProjections)}`
                  : `Held prize projections: ${String(r.heldPrizeProjections)}`}
              </p>
              {!r.settled && (
                <p role="status">
                  {ar
                    ? 'بيانات غير مكتملة؛ النتائج المقترحة غير نهائية.'
                    : 'Incomplete evidence; proposed results are not final.'}
                </p>
              )}
            </>
          )}
        </article>
      ))}
      <p>
        {ar
          ? 'النتائج النهائية تحتاج مراجعة وإعادة فتح منفصلة بعد حفظ التصحيح.'
          : 'Final results require a separate reviewed reopening after this correction is saved.'}
      </p>
    </section>
  );
}
